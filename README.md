# LocalLive

LocalLive is a small web app that helps you find upcoming live events near a location. It uses a
React frontend, a FastAPI backend, and the JamBase API for real event data.

Built as a technical case study.

## Tech Stack

```text
Frontend: React, Vite, CSS
Backend:  Python, FastAPI, httpx
Data:     JamBase API
```

## Features

- Search events by city or area (`Los Angeles, CA`, `New York, NY`, `London, UK`)
- Event cards with date, time, venue, city, artists, artwork, and a link to the event page
- Filter by all upcoming, this week, or this weekend
- Responsive layout for desktop, tablet, and mobile
- Separate loading, empty, location-not-found, and error states

## How It Works

```text
React → FastAPI → JamBase API
```

The API key lives only on the backend, so the browser never calls JamBase directly. FastAPI takes
the location the user typed, looks it up with JamBase to find the matching city and the metro area
around it, then fetches upcoming events for that metro. Before replying it reduces each JamBase
event down to the ten fields the UI needs, so React never sees the raw upstream data.

One endpoint:

```text
GET /api/events?location=Los%20Angeles%2C%20CA&range=all
```

`range` accepts `all`, `week`, or `weekend`. Example response:

```json
{
  "location": "Los Angeles, CA",
  "count": 38,
  "events": [
    {
      "id": "jambase:15930152",
      "name": "Dirty Heads at Long Beach Amphitheater",
      "date": "2026-08-18",
      "time": "17:30",
      "venue": "Long Beach Amphitheater",
      "city": "Long Beach",
      "state": "CA",
      "image_url": "https://...",
      "event_url": "https://...",
      "artists": ["Dirty Heads", "311"]
    }
  ]
}
```

## Run Locally

You need Python 3.10+, Node.js 18+, and a JamBase API key (free trial at
[data.jambase.com](https://data.jambase.com/)).

**1. Clone and add your key**

```bash
git clone https://github.com/<your-username>/locallive-events-app.git
cd locallive-events-app
cp .env.example .env          # Windows: copy .env.example .env
```

Then fill in `.env`:

```env
JBD_API_KEY=your_jambase_api_key
JBD_BASE_URL=https://api.data.jambase.com/v3
```

**2. Backend**

```bash
cd backend
py -m venv .venv              # macOS/Linux: python3 -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**3. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173, the API at http://127.0.0.1:8000, and the generated API
docs at http://127.0.0.1:8000/docs.

## Design Decisions

- Location search is the main action, because someone looking for events starts by picking where
  they want to go.
- Cards show only what helps you decide whether to go: date, event name, venue, city, artists, and
  artwork. JamBase returns much more, but extra fields would just add noise.
- The date block is large and sits on the left so a grid of events is easy to scan by date.
- Results are sorted soonest first, so the nearest options are at the top.
- Shows that already started today are dropped, using the venue's own timezone so a New York
  search is not filtered by the clock of someone browsing from California.
- "Location not found" and "No upcoming events found" are separate states, because they are
  different problems and need different fixes from the user.
- A search covers the surrounding metro area, so searching Los Angeles also finds shows in Long
  Beach and Pasadena.

## Tradeoffs

The brief asked for a small project, so I kept the scope tight on purpose.

- Each search returns the first 40 upcoming events rather than paging through everything. Los
  Angeles has thousands of upcoming events, so the UI says "Showing 38 events" instead of implying
  that is the total.
- No database. The app only shows live data, so there is nothing worth storing.
- No user accounts or saved events.
- Location handling stays simple: one city lookup, using the state or country you type to pick
  between cities with the same name. No second geocoding service.

## With More Time

- Pagination or a "Load more" button
- Caching for repeated city lookups
- Automated tests for the backend normalization and error handling
- Better location search, such as suggestions when a city name is ambiguous
- Support for more event providers behind the same response format

## Time Spent

```text
Time spent: Approximately 2 hours
```

## Self Grade

**Code Quality: A-** — The code is small, readable, and handles expected API and error cases.

**Work Product: A** — The app works end to end with real event data, filters, responsive design, and clear error states.

**Extensibility: B+** — The normalized API response keeps the frontend separated from JamBase and leaves room for pagination, caching, and additional providers.
