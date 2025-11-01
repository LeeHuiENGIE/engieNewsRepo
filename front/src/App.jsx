// front/src/App.jsx
// front/src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./auth/useSession";
import { supabase } from "./lib/supabaseClient";

// Pages
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Bookmarks from "./pages/Bookmarks.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";

/* Optional admin ETL backend.
   If set, Refresh will POST to it, and articles can fall back to it. */
const API_BASE = import.meta.env.VITE_API_BASE || "";

/* ------------ Helpers: Articles (Supabase first, backend fallback) ------------ */
async function fetchArticlesSupabaseOnly() {
  const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");

  const run = async (orderCol) => {
    let q = supabase.from("news").select("*");
    if (orderCol) q = q.order(orderCol, { ascending: false });
    const { data, error } = await q;
    console.log("[ENGIE] news select", {
      orderCol: orderCol || "(none)",
      error: error?.message || null,
      rows: data?.length ?? null,
    });
    if (error) throw error;
    return (data || []).map((d) => ({
      ...d,
      id: d.Link || d.id,
      Bookmarked: !!saved[d.Link || d.id],
    }));
  };

  try {
    let rows = await run("inserted_at");
    if (!rows.length) {
      rows = await run("published");
    }
    if (!rows.length) {
      rows = await run(undefined);
    }
    return rows;
  } catch (err) {
    console.error("[ENGIE] Supabase articles fetch failed:", err?.message || err);
    return [];
  }
}

async function fetchArticlesBackendOnly() {
  const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");
  try {
    const res = await fetch(`${API_BASE}/articles`, { credentials: "omit" });
    if (!res.ok) throw new Error(String(res.status));
    const raw = await res.json();
    console.log(`[ENGIE] Loaded articles from backend: ${API_BASE}`);
    return (raw || []).map((d) => ({
      ...d,
      id: d.Link || d.id,
      Bookmarked: !!saved[d.Link || d.id],
    }));
  } catch (e) {
    console.warn("[ENGIE] backend /articles failed:", e?.message || e);
    return [];
  }
}

// Final hybrid used by the app
async function fetchArticlesHybrid() {
  // 1) Try Supabase directly
  const a = await fetchArticlesSupabaseOnly();
  if (a.length > 0) return a;

  // 2) If empty and backend exists, fall back to backend (bypasses RLS)
  if (API_BASE) {
    const b = await fetchArticlesBackendOnly();
    if (b.length > 0) return b;
  }

  // 3) Final fallback: bundled JSON (keeps UI populated)
  try {
    const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");
    const res = await fetch("/articles.json");
    const raw = await res.json();
    console.log("[ENGIE] Loaded articles from local:/articles.json (fallback)");
    return (raw || []).map((d) => ({
      ...d,
      id: d.Link,
      Bookmarked: !!saved[d.Link],
    }));
  } catch (e) {
    console.error("[ENGIE] Fallback /articles.json failed:", e);
    return [];
  }
}

/* ---------------- Helpers: Events (direct from Supabase) ---------------- */
async function fetchEventsFromSupabase() {
  try {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("starts_on", { ascending: true });

    console.log("[ENGIE] events select", {
      error: error?.message || null,
      rows: data?.length ?? null,
    });

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

  useEffect(() => {
    (async () => {
      const [a, e] = await Promise.all([
        fetchArticlesHybrid(),
        fetchEventsFromSupabase(),
      ]);
      setArticles(a);
      setEvents(e);
    })();
  }, []);

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

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await Promise.all([maybeTriggerNewsRefresh(), maybeTriggerEventsRefresh()]);
      const [a, e] = await Promise.all([
        fetchArticlesHybrid(),
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
          <Route
            path="/login"
            element={session ? <Navigate to="/" replace /> : <Login />}
          />
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
