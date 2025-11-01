// front/src/pages/Home.jsx
import { useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

import NewsCard from "../components/NewsCard.jsx";

function getDateSafe(a) {
  const d =
    a?.inserted_at ||
    a?.InsertedAt ||
    a?.published ||
    a?.Published ||
    a?.PublishedAt ||
    "";
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : 0;
}

function getRegionsFromRow(a) {
  // Support Region as string or array; fall back to "Global"
  const reg = a?.Region ?? a?.region;
  if (Array.isArray(reg)) return reg.filter(Boolean);
  if (typeof reg === "string" && reg.trim()) return [reg.trim()];
  return ["Global"];
}

function getKeywordsFromRow(a) {
  const out = new Set();
  if (Array.isArray(a?.Topic)) a.Topic.filter(Boolean).forEach((k) => out.add(k));
  if (a?.Keywords)
    a.Keywords.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => out.add(k));
  return Array.from(out);
}

export default function Home({ articles = [], onToggle }) {
  // ---- sort newest first (robust to field name variants)
  const sorted = useMemo(
    () => [...articles].sort((a, b) => getDateSafe(b) - getDateSafe(a)),
    [articles]
  );

  // ---- filter state
  const [region, setRegion] = useState("All");
  const [keyword, setKeyword] = useState("All");

  // ---- build filter options from data
  const regions = useMemo(() => {
    const set = new Set();
    for (const a of sorted) getRegionsFromRow(a).forEach((r) => set.add(r));
    return ["All", ...Array.from(set).sort()];
  }, [sorted]);

  const keywords = useMemo(() => {
    const set = new Set();
    for (const a of sorted) getKeywordsFromRow(a).forEach((k) => set.add(k));
    return ["All", ...Array.from(set).sort()];
  }, [sorted]);

  // ---- apply filters
  const filtered = useMemo(() => {
    return sorted.filter((a) => {
      const regionList = getRegionsFromRow(a);
      const regionOk = region === "All" || regionList.includes(region);

      const kws = getKeywordsFromRow(a).map((k) => k.toLowerCase());
      const kwOk = keyword === "All" || kws.includes(String(keyword).toLowerCase());

      return regionOk && kwOk;
    });
  }, [sorted, region, keyword]);

  return (
    <>
      <div className="grid-full top-banner">
        <h2>ENGIE Energy Updates</h2>
        <p>Latest energy, policy, and sustainability news from around the region.</p>

        <div className="filters">
          <div className="filter">
            <label>Region:</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="filter">
            <label>Keyword:</label>
            <select value={keyword} onChange={(e) => setKeyword(e.target.value)}>
              {keywords.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="total-line">
          <strong>Total articles:</strong> {filtered.length}
        </div>
      </div>

      {filtered.map((a) => (
        <NewsCard key={a.id || a.Link} item={a} onToggleBookmark={onToggle} />
      ))}

      {filtered.length === 0 && (
        <div className="empty grid-full">No articles found.</div>
      )}
    </>
  );
}
