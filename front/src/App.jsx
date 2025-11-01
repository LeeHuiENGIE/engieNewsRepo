// front/src/App.jsx
// front/src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./auth/useSession";

// Supabase client (your code)
import { supabase } from "./lib/supabaseClient.js";

// Pages
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Bookmarks from "./pages/Bookmarks.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";

/* ---------------- Admin-only backend triggers (Render) ----------------
   NOTE: Only used by the Refresh button for admins to run ETL.
   The UI reads data directly from Supabase.
----------------------------------------------------------------------- */
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://engie-news-backend-docker.onrender.com";

async function triggerRefresh() {
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

async function triggerRefreshEvents() {
  try {
    const res = await fetch(`${API_BASE}/refresh/events`, { method: "POST" });
    if (res.ok) {
      console.log(
        `[ENGIE] Events refresh triggered via ${API_BASE}/refresh/events`
      );
      return true;
    }
    console.warn(
      `[ENGIE] ${API_BASE}/refresh/events responded ${res.status}`
    );
  } catch (e) {
    console.warn(`[ENGIE] refresh events failed via ${API_BASE}/refresh/events`, e);
  }
  return false;
}

/* ---------------- Supabase reads (users) ---------------- */
async function fetchArticlesFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      // adjust to your actual timestamp columns; these are used around the app
      .order("PublishedAt", { ascending: false, nullsFirst: false });

    if (error) throw error;

    const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");
    return (data || []).map((d) => ({
      ...d,
      id: d.Link || d.id, // used throughout UI
      Bookmarked: !!saved[d.Link || d.id],
    }));
  } catch (err) {
    console.error("[ENGIE] Supabase articles fetch failed:", err?.message || err);
    return [];
  }
}

async function fetchEventsFromSupabase() {
  try {
    // Show only upcoming events; tweak column names if needed
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("starts_on", today)
      .order("starts_on", { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("[ENGIE] Supabase events fetch failed:", err?.message || err);
    return [];
  }
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

  // Initial load: read both from Supabase
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

  // Bookmark toggle logic (local only)
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

  // Admin Refresh: trigger ETL via Render, then re-read from Supabase
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await triggerRefresh();          // news ETL (admin)
      await triggerRefreshEvents();    // events ETL (admin)

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

              {/* Dashboard uses both articles & events */}
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
