// front/src/App.jsx
// front/src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./auth/useSession";
import { supabase } from "./lib/supabaseClient"; // <-- adjust path only if yours differs

// Pages
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Bookmarks from "./pages/Bookmarks.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";

/* ---------------- Optional admin ETL backend ----------------
   If you set VITE_API_BASE, the Refresh button will call it.
   If not set, Refresh just re-reads from Supabase (no POST). */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ---------------- Helpers: Articles ---------------- */
async function fetchArticlesTryBoth() {
  const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");

  for (const base of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
    try {
      const res = await fetch(`${base}/articles`, { credentials: "omit" });
      if (res.ok) {
        const raw = await res.json();
        const data = (raw || []).map((d) => ({
          ...d,
          id: d.Link || d.id,
          Bookmarked: !!saved[d.Link || d.id],
        }));
        console.log(`[ENGIE] Loaded articles from backend: ${base}`);
        return data;
      } else {
        console.warn(`[ENGIE] ${base}/articles responded ${res.status}`);
      }
    } catch (e) {
      console.warn(`[ENGIE] fetch failed from ${base}/articles`, e);
    }
  }

  // Fallback to local JSON
  try {
    const res = await fetch("/articles.json");
    const raw = await res.json();
    const data = (raw || []).map((d) => ({
      ...d,
      id: d.Link,
      Bookmarked: !!saved[d.Link],
    }));
    console.log("[ENGIE] Loaded articles from local:/articles.json");
    return data;
  } catch (e) {
    console.error("[ENGIE] Failed to load local /articles.json", e);
    return [];
  }
}

async function triggerRefreshTryBoth() {
  for (const base of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
    try {
      const res = await fetch(`${base}/refresh`, { method: "POST" });
      if (res.ok) {
        console.log(`[ENGIE] Refresh triggered via ${base}/refresh`);
        return true;
      } else {
        console.warn(`[ENGIE] ${base}/refresh responded ${res.status}`);
      }
    } catch (e) {
      console.warn(`[ENGIE] refresh failed via ${base}/refresh`, e);
    }
  }
  return false;
}

/* ---------------- Helpers: Events (Supabase) ---------------- */
async function fetchEventsFromSupabase() {
  try {
    // Adjust to your actual events table & columns
    // We assume: table "events" with "starts_on" (date), "region", "title", "link"
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("starts_on", { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("[ENGIE] Supabase events fetch failed:", err?.message || err);
    return [];
  }
}

/* ---------------- Optional: trigger ETL on backend ---------------- */
async function maybeTriggerNewsRefresh() {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/refresh`, { method: "POST" });
    if (res.ok) {
      console.log(`[ENGIE] Refresh triggered via ${API_BASE}/refresh`);
      return true;
    }
    console.warn(`[ENGIE] ${API_BASE}/refresh responded ${res.status}`);
  } catch (e) {
    console.warn(`[ENGIE] refresh failed via ${API_BASE}/refresh`, e);
  }
  return false;
}

async function maybeTriggerEventsRefresh() {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/refresh/events`, { method: "POST" });
    if (res.ok) {
      console.log(`[ENGIE] Events refresh triggered via ${API_BASE}/refresh/events`);
      return true;
    }
    console.warn(`[ENGIE] ${API_BASE}/refresh/events responded ${res.status}`);
  } catch (e) {
    console.warn(`[ENGIE] refresh events failed via ${API_BASE}/refresh/events`, e);
  }
  return false;
}

/* ---------------- Main App ---------------- */
export default function App() {
  const { session, loading } = useSession();
  const location = useLocation();

  const [articles, setArticles] = useState([]);
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const isDashboard = location.pathname === "/dashboard";
  const onLoginPage = location.pathname === "/login";

  // Initial load: pull both from Supabase
  useEffect(() => {
    (async () => {
      const [a, e] = await Promise.all([
        fetchArticlesFromSupabase(),
        fetchEventsFromSupabase(),
      ]);
      setArticles(a);
      setEvents(e);
    })();
  }, []);

  // Bookmark toggle logic (unchanged)
  const toggleBookmark = (id, current) => {
    setArticles((list) => {
      const next = list.map((it) =>
        it.id === id ? { ...it, Bookmarked: !current } : it
      );
      const map = Object.fromEntries(
        next.filter((x) => x.Bookmarked).map((x) => [x.id, true])
      );
      localStorage.setItem("bookmarks", JSON.stringify(map));
      return next;
    });
  };

  // Refresh button: optionally trigger ETL, then re-read both from Supabase
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([maybeTriggerNewsRefresh(), maybeTriggerEventsRefresh()]);
      const [a, e] = await Promise.all([
        fetchArticlesFromSupabase(),
        fetchEventsFromSupabase(),
      ]);
      setArticles(a);
      setEvents(e);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return null;

  return (
    <div>
      {!onLoginPage && session && (
        <Header onRefresh={handleRefresh} refreshing={refreshing} />
      )}

      <main className={`grid ${isDashboard ? "dashboard-page" : ""}`}>
        <Routes>
          {/* Public route */}
          <Route
            path="/login"
            element={session ? <Navigate to="/" replace /> : <Login />}
          />

          {/* Protected routes */}
          {session ? (
            <>
              <Route
                path="/"
                element={
                  <Home
                    session={session}
                    articles={articles}
                    onToggle={toggleBookmark}
                  />
                }
              />

              <Route
                path="/dashboard"
                element={<Dashboard articles={articles} events={events} />}
              />

              <Route
                path="/bookmarks"
                element={
                  <Bookmarks
                    session={session}
                    articles={articles}
                    onToggle={toggleBookmark}
                  />
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/login" replace />} />
          )}
        </Routes>
      </main>
    </div>
  );
}
