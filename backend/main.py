"""LocalLive backend: resolves a location with JamBase and returns upcoming events.

The API key stays here — the browser never talks to JamBase directly.
"""

import logging
import os
from datetime import date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

JAMBASE_BASE_URL = os.getenv("JBD_BASE_URL", "https://api.data.jambase.com/v3").rstrip("/")
JAMBASE_API_KEY = os.getenv("JBD_API_KEY", "").strip()

REQUEST_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
CITY_PAGE_SIZE = 50
EVENT_PAGE_SIZE = 40

# Users type the everyday form of a country; JamBase reports the ISO code.
COUNTRY_ALIASES = {"UK": "GB", "ENGLAND": "GB", "USA": "US", "U.S.": "US", "U.S.A.": "US"}

logger = logging.getLogger(__name__)

app = FastAPI(title="LocalLive API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def text(value):
    """JamBase sends empty strings for missing fields, and omits others entirely."""
    return value.strip() if isinstance(value, str) else ""


def parse_location(raw):
    """Split "Los Angeles, CA" into a city and an optional region token."""
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    if not parts:
        return "", None
    return parts[0], (parts[-1] if len(parts) > 1 else None)


def region_matches(city, region):
    address = city.get("address") or {}
    token = region.strip().upper()
    token = COUNTRY_ALIASES.get(token, token)
    state_iso = text(address.get("addressRegion")).upper()  # e.g. "US-CA"
    country = text(address.get("addressCountry")).upper()
    return state_iso.endswith(f"-{token}") or state_iso == token or country == token


def location_label(city):
    """Canonical label for the resolved place, e.g. "Los Angeles, CA"."""
    address = city.get("address") or {}
    name = text(city.get("name"))
    state_iso = text(address.get("addressRegion"))
    country = text(address.get("addressCountry"))
    region = state_iso.split("-")[-1] if state_iso else country
    return ", ".join(part for part in (name, region) if part)


def split_start(value):
    """JamBase returns venue-local ISO 8601 with no offset, e.g. 2026-08-22T20:00:00."""
    if not isinstance(value, str) or not value:
        return None, None
    date_part, _, time_part = value.partition("T")
    return (date_part or None), (time_part[:5] or None)


def event_has_started(event):
    """True when a show today has already begun in its venue's own timezone.

    JamBase sends venue-local times with no offset, so the comparison has to run
    in the venue's timezone: a New York show should not disappear just because
    the person searching is in Los Angeles. Anything we cannot read is kept.
    """
    start = text(event.get("startDate"))
    address = (event.get("location") or {}).get("address") or {}
    zone_name = text(address.get("x-timezone"))
    if not zone_name or "T" not in start:
        return False

    try:
        zone = ZoneInfo(zone_name)
        starts_at = datetime.fromisoformat(start).replace(tzinfo=zone)
    except (ValueError, ZoneInfoNotFoundError):
        return False

    return starts_at <= datetime.now(zone)


def normalize_event(event):
    venue = event.get("location") or {}
    address = venue.get("address") or {}
    state = address.get("addressRegion") or {}
    event_date, event_time = split_start(event.get("startDate"))
    performers = event.get("performer") or []

    return {
        "id": text(event.get("identifier")),
        "name": text(event.get("name")),
        "date": event_date,
        "time": event_time,
        "venue": text(venue.get("name")) or None,
        "city": text(address.get("addressLocality")) or None,
        # On events addressRegion is an object; alternateName is the short "CA" form.
        "state": text(state.get("alternateName")) or None,
        "image_url": text(event.get("image")) or text(event.get("x-promoImage")) or None,
        "event_url": text(event.get("url")) or None,
        "artists": [
            text(performer.get("name"))
            for performer in performers
            if isinstance(performer, dict) and text(performer.get("name"))
        ],
    }


async def jambase_get(client, path, params):
    try:
        response = await client.get(path, params=params)
    except httpx.TimeoutException as exc:
        raise HTTPException(504, "The events provider took too long to respond. Please try again.") from exc
    except httpx.RequestError as exc:
        raise HTTPException(502, "LocalLive could not reach the events provider.") from exc

    if response.status_code >= 400:
        # Log the status only; the upstream body can echo request details.
        logger.warning("JamBase %s returned %s", path, response.status_code)

    if response.status_code in (401, 403):
        raise HTTPException(502, "LocalLive is not authorised to read event data right now.")
    if response.status_code == 429:
        raise HTTPException(429, "The events provider is busy. Please try again in a moment.")
    if response.status_code >= 500:
        raise HTTPException(502, "The events provider is temporarily unavailable.")
    if response.status_code >= 400:
        raise HTTPException(502, "LocalLive could not read event data for that search.")

    try:
        return response.json()
    except ValueError as exc:
        raise HTTPException(502, "The events provider returned an unreadable response.") from exc


async def resolve_location(client, city_name, region):
    """Find the JamBase city that best matches what the user typed."""
    # Not filtering on cityHasUpcomingEvents: a real town with nothing booked must
    # still resolve, so "no events" stays distinct from "no such place".
    payload = await jambase_get(
        client,
        "/geographies/cities",
        {"geoCityName": city_name, "perPage": CITY_PAGE_SIZE},
    )
    cities = [
        city
        for city in (payload.get("cities") or [])
        if isinstance(city, dict) and text(city.get("identifier"))
    ]
    if not cities:
        raise HTTPException(404, f'Location not found: "{city_name}".')

    if region:
        in_region = [city for city in cities if region_matches(city, region)]
        if in_region:
            cities = in_region

    # Exact name first, then the busiest match: this is what separates
    # Paris, France from Paris, Illinois when the user gave no region.
    cities.sort(
        key=lambda city: (
            text(city.get("name")).casefold() == city_name.casefold(),
            city.get("x-numUpcomingEvents") or 0,
        ),
        reverse=True,
    )
    return cities[0]


def date_range_params(date_range):
    """Date filters for the three UI ranges.

    These are applied upstream, not to the page we get back: in a busy metro the
    soonest 40 events can all fall on one day, so filtering locally would lie.
    """
    if date_range == "weekend":
        return {"eventDatePreset": "thisWeekend"}
    if date_range == "week":
        today = date.today()
        return {
            "eventDateFrom": today.isoformat(),
            "eventDateTo": (today + timedelta(days=7)).isoformat(),
        }
    return {}  # "all": JamBase already defaults eventDateFrom to today.


async def fetch_events(client, city, date_range):
    metro = city.get("containedInPlace")
    metro_id = text(metro.get("identifier")) if isinstance(metro, dict) else ""
    # A metro covers surrounding venues too, which is what "near me" should mean.
    where = {"geoMetroId": metro_id} if metro_id else {"geoCityId": text(city.get("identifier"))}

    payload = await jambase_get(
        client,
        "/events",
        {**where, **date_range_params(date_range), "perPage": EVENT_PAGE_SIZE, "sort": "eventDate"},
    )
    return payload.get("events") or []


@app.get("/")
def root():
    return {"name": "LocalLive API", "status": "ok", "docs": "/docs"}


@app.get("/api/events")
async def get_events(
    location: str = Query(
        min_length=2,
        max_length=120,
        description='City to search, for example "Los Angeles, CA".',
    ),
    date_range: Literal["all", "week", "weekend"] = Query(
        "all",
        alias="range",
        description="Which upcoming events to include.",
    ),
):
    if not JAMBASE_API_KEY:
        raise HTTPException(503, "Server is missing its JamBase API key. Set JBD_API_KEY in .env.")

    city_name, region = parse_location(location)
    if not city_name:
        raise HTTPException(400, "Enter a city, for example \"Los Angeles, CA\".")

    headers = {
        "Authorization": f"Bearer {JAMBASE_API_KEY}",
        "Accept": "application/json",
        "User-Agent": "LocalLive/1.0",
    }
    async with httpx.AsyncClient(
        base_url=JAMBASE_BASE_URL, headers=headers, timeout=REQUEST_TIMEOUT
    ) as client:
        city = await resolve_location(client, city_name, region)
        raw_events = await fetch_events(client, city, date_range)

    events = [
        normalize_event(event)
        for event in raw_events
        if isinstance(event, dict)
        and event.get("eventStatus") != "cancelled"
        and not event_has_started(event)
    ]
    # An event with no id or name cannot be rendered or keyed.
    events = [event for event in events if event["id"] and event["name"]]

    return {"location": location_label(city), "count": len(events), "events": events}
