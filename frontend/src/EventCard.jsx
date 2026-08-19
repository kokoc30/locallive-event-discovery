import { useState } from "react";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

const DAY_MS = 24 * 60 * 60 * 1000;

// JamBase serves this named stock photo when it has no artwork for an event,
// so treat it as no image and use our own fallback instead.
const PROVIDER_PLACEHOLDER = /jambase-default-band-image/i;

/** Backend sends date and time apart; join them without letting JS read them as UTC. */
function toLocalDate(date, time) {
  if (!date) return null;
  const parsed = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateTag(startsAt) {
  if (!startsAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(startsAt);
  eventDay.setHours(0, 0, 0, 0);

  const daysAway = Math.round((eventDay - today) / DAY_MS);
  if (daysAway === 0) return "Tonight";
  if (daysAway === 1) return "Tomorrow";

  const weekday = eventDay.getDay();
  if (daysAway <= 7 && (weekday === 5 || weekday === 6 || weekday === 0)) return "This weekend";
  return null;
}

export default function EventCard({ event }) {
  const [imageFailed, setImageFailed] = useState(false);

  const startsAt = toLocalDate(event.date, event.time);
  const tag = dateTag(startsAt);
  const place = [event.city, event.state].filter(Boolean).join(", ");
  const [headliner, ...support] = event.artists ?? [];
  const supportLine = support.length > 0 ? `With ${support.join(", ")}` : "";
  const artwork =
    event.image_url && !PROVIDER_PLACEHOLDER.test(event.image_url) ? event.image_url : null;

  return (
    <article className="event-card">
      <div className="event-image">
        {imageFailed || !artwork ? (
          <div className="image-fallback" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          </div>
        ) : (
          <img
            src={artwork}
            alt={headliner ? `${headliner} performing` : event.name}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        {tag && <span className="tag">{tag}</span>}
      </div>

      <div className="card-body">
        <div className="card-top">
          <div className="date-block">
            {startsAt ? (
              <>
                <span className="month">{MONTH.format(startsAt)}</span>
                <span className="day">{String(startsAt.getDate()).padStart(2, "0")}</span>
              </>
            ) : (
              <span className="month">TBA</span>
            )}
          </div>
          <div>
            <h3>{event.name}</h3>
            <div className="meta">
              {event.venue && (
                <>
                  <strong>{event.venue}</strong>
                  <br />
                </>
              )}
              {place}
            </div>
          </div>
        </div>

        <div className="support">{supportLine}</div>

        <div className="card-footer">
          <span className="time">
            {startsAt
              ? `${WEEKDAY.format(startsAt)}${event.time ? ` · ${TIME.format(startsAt)}` : ""}`
              : "Date to be announced"}
          </span>
          {event.event_url && (
            <a className="view-link" href={event.event_url} target="_blank" rel="noopener noreferrer">
              View event <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
