// front/src/pages/Dashboard.jsx
// front/src/pages/Dashboard.jsx
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import ASEANMap from "../components/ASEANMap.jsx";
import "./Dashboard.css";

export default function Dashboard({ articles = [], events = [] }) {
  // ---------------- Normalization for region names ----------------
  const REGION_NORMALIZE = {
    singapore: "Singapore",
    malaysia: "Malaysia",
    indonesia: "Indonesia",
    vietnam: "Vietnam",
    philippines: "Philippines",
    thailand: "Thailand",
    cambodia: "Cambodia",
    laos: "Laos",
    "lao pdr": "Laos",
    myanmar: "Myanmar",
    brunei: "Brunei",
    "brunei darussalam": "Brunei",
  };

  const CANON_REGIONS = [
    "All",
    "Singapore",
    "Malaysia",
    "Philippines",
    "Indonesia",
    "Thailand",
    "Vietnam",
    "Cambodia",
    "Laos",
    "Myanmar",
    "Brunei",
  ];

  // ---------------- Filters ----------------
  const [keyword, setKeyword] = useState("All");
  const [country, setCountry] = useState("All"); // controlled + synced with map

  const keywordOptions = useMemo(() => {
    const set = new Set();
    for (const a of articles) {
      if (Array.isArray(a?.Topic)) a.Topic.filter(Boolean).forEach((k) => set.add(k));
      if (a?.Keywords) {
        a.Keywords.split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((k) => set.add(k));
      }
    }
    return ["All", ...Array.from(set).sort()];
  }, [articles]);

  const normalizeRegionArray = (row) => {
    const reg = row?.Region ?? row?.region;
    const arr = Array.isArray(reg) ? reg : reg ? [reg] : [];
    return arr
      .map((r) => REGION_NORMALIZE[String(r || "").trim().toLowerCase()])
      .filter(Boolean);
  };

  // ---------------- Apply filters to articles ----------------
  const filteredArticles = useMemo(() => {
    let list = articles;

    if (keyword !== "All") {
      list = list.filter((a) => {
        const topicList = Array.isArray(a?.Topic) ? a.Topic : [];
        const kwList = a?.Keywords
          ? a.Keywords.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        const combined = [...topicList, ...kwList].map((s) => s.toLowerCase());
        return combined.includes(keyword.toLowerCase());
      });
    }

    if (country !== "All") {
      list = list.filter((a) => normalizeRegionArray(a).includes(country));
    }

    return list;
  }, [articles, keyword, country]);

  // ---------------- Region counts (from filtered) ----------------
  const regionCounts = useMemo(() => {
    const out = {
      Singapore: 0, Malaysia: 0, Indonesia: 0, Vietnam: 0, Philippines: 0,
      Thailand: 0, Cambodia: 0, Laos: 0, Myanmar: 0, Brunei: 0,
    };
    for (const row of filteredArticles) {
      for (const canon of normalizeRegionArray(row)) {
        if (Object.prototype.hasOwnProperty.call(out, canon)) out[canon] += 1;
      }
    }
    return out;
  }, [filteredArticles]);

  // ---------------- Latest 3 (follows filters) ----------------
// ---------------- Latest 3 (follows filters) ----------------
  const latest3 = useMemo(() => {
    if (!Array.isArray(filteredArticles) || filteredArticles.length === 0) return [];
    const getDate = (a) =>
      new Date(
        a.inserted_at || a.InsertedAt || a.published || a.Published || a.PublishedAt || 0
      );
    return [...filteredArticles]
      .filter((a) => a && (a.title || a.Title))
      .sort((a, b) => getDate(b) - getDate(a))
      .slice(0, 3)
      .map((a) => ({
        id: a.id || a.Link,
        dateLabel: new Date(
          a.inserted_at || a.InsertedAt || a.published || a.Published || a.PublishedAt || 0
        ).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
        title: a.title || a.Title || "(untitled)",
        source: a.source || a.Source || "",
        link: a.link || a.Link || null,      // <— add link here
      }));
  }, [filteredArticles]);


  // ---------------- Volume (follows filters) ----------------
  const volume14 = useMemo(() => {
    const list = filteredArticles;
    if (!Array.isArray(list)) return [];
    const getDate = (a) =>
      new Date(
        a.inserted_at || a.InsertedAt || a.published || a.Published || a.PublishedAt || 0
      );
    const counts = new Map(); // yyyy-mm-dd -> count
    for (const a of list) {
      const dt = getDate(a);
      if (isNaN(+dt)) continue;
      const key =
        dt.getFullYear() +
        "-" +
        String(dt.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(dt.getDate()).padStart(2, "0");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const out = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
      out.push({
        d: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        v: counts.get(key) || 0,
      });
    }
    return out;
  }, [filteredArticles]);

  // ---------------- Events (REAL) ----------------
  // Filter by country and show a scrollable list. Keep a larger cap so scroll feels useful.
  const filteredEvents = useMemo(() => {
    let list = Array.isArray(events) ? events : [];
    if (country !== "All") {
      list = list.filter((e) => (e.region || "").trim() === country);
    }
    list = [...list].sort((a, b) => {
      const da = a?.starts_on ? new Date(a.starts_on).getTime() : 0;
      const db = b?.starts_on ? new Date(b.starts_on).getTime() : 0;
      return da - db;
    });
    return list.slice(0, 25);
  }, [events, country]);

  // Map click toggle
  const handleMapSelect = (name) => {
    setCountry((prev) => (prev === name ? "All" : name));
  };

  // A shared card height so Events ≈ Map height; tweak if needed.
  const CARD_TARGET_HEIGHT = 480; // px

  return (
    <div className="dash-wrap dash-layout-alt">
      {/* Row 1 – Events (scrollable) and Map */}
      <section className="card events" data-area="events" style={{ minHeight: CARD_TARGET_HEIGHT }}>
        <div className="card-head">
          <h3>Upcoming Energy Events</h3>
        </div>

        <ul
          className="events-list"
          style={{
            // make inner list scroll to match map height area
            maxHeight: CARD_TARGET_HEIGHT , // head padding allowance
            overflowY: "auto",
            paddingRight: 8,
          }}
        >
          {filteredEvents.length === 0 ? (
            <li className="event-row">
              <div style={{ padding: "10px 4px", color: "#5b6f8b" }}>
                No upcoming events{country !== "All" ? ` for ${country}` : ""}.
              </div>
            </li>
          ) : (
            filteredEvents.map((e, i) => {
              const dateLabel = e?.starts_on
                ? new Date(e.starts_on).toLocaleDateString("en-US", {
                    month: "short",
                    day: "2-digit",
                  })
                : "TBC";

              const Title = e.title || "(Untitled event)";
              const Region = e.region || e.city || e.source || "";
              const Link = e.link;

              return (
                <li key={e.id ?? i} className="event-row">
                  <div className="event-date">{dateLabel}</div>
                  <div className="event-meta">
                    {Link ? (
                      <a
                        href={Link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="event-title"
                        style={{
                          textDecoration: "none",
                          color: "inherit",
                          fontWeight: 600,
                          transition: "color 0.15s ease, text-decoration-color 0.15s ease",
                        }}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.color = "#1e63ff";
                          ev.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.color = "inherit";
                          ev.currentTarget.style.textDecoration = "none";
                        }}
                      >
                        {Title}
                      </a>
                    ) : (
                      <div className="event-title">{Title}</div>
                    )}
                    <div className="event-region">{Region}</div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="card hero-map" data-area="map" style={{ minHeight: CARD_TARGET_HEIGHT }}>
        <div className="card-head"><h2>Regional Activity</h2></div>

        {/* compact filter line under the heading */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "6px 18px 0",
            color: "#5b6f8b",
            fontSize: 13,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong style={{ color: "#0b2a4a" }}>Total articles:</strong>{" "}
            {filteredArticles.length}
          </span>

          <div className="filter" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#0b2a4a" }}>Country:</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e3e9f5",
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {CANON_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="filter" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontWeight: 600, color: "#0b2a4a" }}>Keyword:</label>
            <select
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e3e9f5",
                background: "#fff",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {keywordOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="map-canvas">
          <ASEANMap
            counts={regionCounts}
            selected={country === "All" ? null : country}
            onSelectRegion={handleMapSelect}
          />
          <div className="map-note">Click a country to filter (click again to clear)</div>
        </div>
      </section>

      {/* Row 2 – Latest & Volume */}
      <section className="card latest" data-area="latest">
        <div className="card-head"><h3>Latest Articles</h3></div>

        {latest3.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "#5b6f8b" }}>Articles loading…</div>
        ) : (
          <ul className="latest-list">
            {latest3.map((a, i) => (
             
              <li key={a.id ?? i} className="latest-row">
                <div className="latest-date">{a.dateLabel}</div>
                <div className="latest-title">
                  {a.link ? (
                    <a
                      className="dash-latest-link"
                      href={a.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {a.title}
                    </a>
                  ) : (
                    a.title
                  )}
                  {a.source && (
                    <span style={{ color: "#5b6f8b", fontSize: "0.85rem" }}>
                      {" "}– {a.source}
                    </span>
                  )}
                </div>
              </li>

            ))}
          </ul>
        )}

        <div className="see-all-link" onClick={() => (window.location.href = "/")}>
          See all news →
        </div>
      </section>

      <section className="card volume" data-area="volume">
        <div className="card-head"><h3>News Volume (Past 14 Days)</h3></div>

        {volume14.length === 0 ? (
          <div style={{ padding: "14px 16px", color: "#5b6f8b" }}>Loading chart…</div>
        ) : (
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={volume14} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopOpacity={0.35} />
                    <stop offset="100%" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e7f0ff" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: "#5b6f8b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#5b6f8b" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12 }} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#2b6ae6"
                  strokeWidth={2}
                  fill="url(#fillBlue)"
                  isAnimationActive={true}
                  animationDuration={900}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
