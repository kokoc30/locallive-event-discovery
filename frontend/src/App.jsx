import { useCallback, useEffect, useRef, useState } from "react";
import EventCard from "./EventCard";

// All event data comes through our backend, which holds the JamBase key.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

const DEFAULT_LOCATION = "Los Angeles, CA";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1200&q=85";

const FILTERS = [
  { value: "all", label: "All upcoming", summary: "soonest first" },
  { value: "week", label: "This week", summary: "next 7 days" },
  { value: "weekend", label: "This weekend", summary: "this weekend" },
];

const ERRORS_BY_STATUS = {
  404: {
    title: "Location not found",
    description: "Check the city name and try again. Example: Miami, FL or Denver, CO.",
  },
  422: {
    title: "Enter a city or area",
    description: "Try something like “Los Angeles, CA”.",
  },
  429: {
    title: "Too many searches right now",
    description: "LocalLive is being rate limited. Please try again in a moment.",
  },
  502: {
    title: "Event service unavailable",
    description: "The events provider isn't responding. Please try again shortly.",
  },
  503: {
    title: "LocalLive isn't set up yet",
    description: "The server is missing its event provider configuration.",
  },
  504: {
    title: "That search timed out",
    description: "The events provider took too long to answer. Please try again.",
  },
};

const NETWORK_ERROR = {
  title: "Can't reach LocalLive",
  description: "The app couldn't reach its own server. Check it is running and try again.",
};

const GENERIC_ERROR = {
  title: "We couldn't load events right now",
  description: "Please try again in a moment. Your evening plans can wait a minute.",
};

function ResultState({ icon, title, description, spinning = false, children }) {
  return (
    <div className="state" role="status">
      <div className={spinning ? "state-icon spinning" : "state-icon"} aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

const LOADING_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
  </svg>
);

const EMPTY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M8 21h8M12 17v4M8.5 17a7 7 0 1 1 7 0" />
    <path d="M9 9h.01M15 9h.01" />
  </svg>
);

const ERROR_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </svg>
);

export default function App() {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [locationLabel, setLocationLabel] = useState(DEFAULT_LOCATION);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(GENERIC_ERROR);
  const [range, setRange] = useState("all");
  const [heroImageFailed, setHeroImageFailed] = useState(false);

  const [toastText, setToastText] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef();
  const inFlight = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(toastTimer.current);
      inFlight.current?.abort();
    };
  }, []);

  function showToast(message) {
    setToastText(message);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2300);
  }

  const search = useCallback(async (query, nextRange) => {
    // Drop any search the user has already replaced.
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStatus("loading");
    setLocationLabel(query);
    setRange(nextRange);

    const url = `${API_BASE}/api/events?location=${encodeURIComponent(query)}&range=${nextRange}`;

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        setEvents([]);
        setError(ERRORS_BY_STATUS[response.status] ?? GENERIC_ERROR);
        setStatus("error");
        return;
      }
      const data = await response.json();
      setEvents(data.events ?? []);
      setLocationLabel(data.location || query);
      setStatus("ready");
    } catch (requestError) {
      if (requestError.name === "AbortError") return;
      setEvents([]);
      setError(NETWORK_ERROR);
      setStatus("error");
    }
  }, []);

  // Load a default city so the page is not empty on first visit.
  useEffect(() => {
    search(DEFAULT_LOCATION, "all");
  }, [search]);

  function handleSearch(submitEvent) {
    submitEvent.preventDefault();
    const query = location.trim();
    if (!query) {
      showToast("Enter a city to see what's on.");
      return;
    }
    showToast(`Showing events near ${query}`);
    search(query, range);
  }

  function handleFilter(nextFilter) {
    if (nextFilter.value === range) return;
    showToast(`${nextFilter.label} selected`);
    search(locationLabel, nextFilter.value);
  }

  const isLoading = status === "loading";
  const activeFilter = FILTERS.find((option) => option.value === range) ?? FILTERS[0];

  return (
    <div className="page-shell">
      <header>
        <div className="container header-inner">
          <a className="brand" href="#top" aria-label="LocalLive home">
            <span className="brand-mark" aria-hidden="true" />
            <span>LocalLive</span>
          </a>
          <span className="header-note">Local plans, better nights.</span>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="container hero-layout">
            <div>
              <div className="eyebrow">Live nearby · {locationLabel}</div>
              <h1 id="hero-title">Find the next good night out.</h1>
              <p className="hero-copy">
                Discover intimate shows, big nights, and the local venues that make a city feel alive.
              </p>

              <div className="search-wrap">
                <label className="search-label" htmlFor="location">
                  Where do you want to go?
                </label>
                <form className="search-row" onSubmit={handleSearch}>
                  <div className="search-field">
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    <input
                      id="location"
                      value={location}
                      placeholder="City or city, state — e.g. San Francisco, CA"
                      onChange={(changeEvent) => setLocation(changeEvent.target.value)}
                    />
                  </div>
                  <button className="primary-btn" type="submit" disabled={isLoading}>
                    {isLoading ? "Searching…" : "Search events"}
                  </button>
                </form>

                <div className="quick-row" aria-label="Quick discovery filters">
                  <span className="quick-label">Browse</span>
                  {FILTERS.map((quickFilter) => (
                    <button
                      key={quickFilter.value}
                      className={range === quickFilter.value ? "filter-btn active" : "filter-btn"}
                      type="button"
                      aria-pressed={range === quickFilter.value}
                      disabled={isLoading}
                      onClick={() => handleFilter(quickFilter)}
                    >
                      {quickFilter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-image-frame">
                {heroImageFailed ? null : (
                  <img
                    src={HERO_IMAGE}
                    alt="Warm stage lights over a crowd at a live show"
                    onError={() => setHeroImageFailed(true)}
                  />
                )}
              </div>
              <div className="hero-note">
                <div className="section-kicker">Live music</div>
                <strong>Make room for a little wonder.</strong>
                <span>Straight from the stages and venues that make {locationLabel} sing.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="results" aria-labelledby="results-title">
          <div className="container">
            <div className="results-head">
              <div>
                <div className="section-kicker">Live near you</div>
                <h2 id="results-title">Upcoming near {locationLabel}</h2>
                <p className="results-sub" aria-live="polite">
                  {isLoading
                    ? "Checking what is on near you…"
                    : status === "ready" && events.length > 0
                      ? `Showing ${events.length} ${events.length === 1 ? "event" : "events"} · ${activeFilter.summary}`
                      : "Nothing to show for this search yet"}
                </p>
              </div>
              <div className="sort">Ordered by date</div>
            </div>

            {isLoading ? (
              <ResultState
                icon={LOADING_ICON}
                title={`Finding events near ${locationLabel}…`}
                description="Checking listings for that area now."
                spinning
              >
                <div className="skeleton-lines">
                  <span />
                  <span />
                </div>
              </ResultState>
            ) : status === "error" ? (
              <ResultState icon={ERROR_ICON} title={error.title} description={error.description} />
            ) : events.length === 0 ? (
              <ResultState
                icon={EMPTY_ICON}
                title="No upcoming events found"
                description="Try another area or date range."
              />
            ) : (
              <div className="event-grid">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <span className="footer-brand">LocalLive</span>
          <span>
            Live event data{" "}
            <a href="https://www.jambase.com" target="_blank" rel="noopener noreferrer">
              Powered by JamBase
            </a>
          </span>
        </div>
      </footer>

      <div className={toastVisible ? "toast show" : "toast"} role="status" aria-live="polite">
        {toastText}
      </div>
    </div>
  );
}
