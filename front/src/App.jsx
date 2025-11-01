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

/* Optional admin ETL backend:
   - If VITE_API_BASE is set, Refresh will POST to it.
   - Articles will prefer backend first (same as your old local flow). */
const API_BASE  = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const API_TOKEN = import.meta.env.VITE_BACKEND_TOKEN || "";
console.log("[ENGIE] API_BASE =", API_BASE || "(none)");

/* ---------------- Articles: BACKEND → Supabase → local.json ---------------- */
async function fetchArticlesBackendFirst() {
  const saved = JSON.parse(localStorage.getItem("bookmarks") || "{}");

  // 1) Backend (mirrors your local working flow)
  if (API_BASE) {
    try {
      const r = await fetch(`${API_BASE}/articles`, { credentials: "omit" });
      if (r.ok) {
        const raw = await r.json();
        console.log("[ENGIE] articles from backend", { count: raw?.length ?? 0 });
        return (raw || []).map((d) => ({
          ...d,
          id: d.Link || d.id,
          Bookmarked: !!saved[d.Link || d.id],
        }));
      } else {
        console.warn("[ENGIE] backend /articles status", r.status);
      }
    } catch (e) {
      console.warn("[ENGIE] backend /articles failed", e);
    }
  }

  // 2) Supabase direct
  try {
    const run = async (col) => {
      let q = supabase.from("news").select("*");
      if (col) q = q.order(col, { ascending: false });
      const { data, error } = await q;
      console.log("[ENGIE] news select", {
        orderCol: col || "(none)",
        error: error?.message || null,
        rows: data?.length ?? null,
      });
      if (error) throw error;
      return data || [];
    };

    let rows = await run("inserted_at");
    if (!rows.length) rows = await run("published");
    if (!rows.length) rows = await run(undefined);

    if (rows.length) {
      return rows.map((d) => ({
        ...d,
        id: d.Link || d.id,
        Bookmarked: !!saved[d.Link || d.id],
      }));
    }
  } catch (e) {
    console.warn("[ENGIE] supabase news failed", e?.message || e);
  }

  // 3) Local bundle fallback
  try {
    const res = await fetch("/articles.json");
    const raw = await res.json();
    console.log("[ENGIE] articles from /articles.json", { count: raw?.length ?? 0 });
    return (raw || []).map((d) => ({
      ...d,
      id: d.Link,
      Bookmarked: !!saved[d.Link],
    }));
  } catch (e) {
    console.error("[ENGIE] /articles.json failed", e);
    return [];
  }
}

/* ---------------- Events: straight from Supabase (server-side filter) ------- */
async function fetchEventsFromSupabase() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .gte("starts_on", today)
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
function authHeaders() {
  return API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : undefined;
}

async function maybeTriggerNewsRefresh() {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/refresh`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "omit",
      mode: "cors",
    });
    if (res.ok) {
      console.log("[ENGIE] refresh news OK");
      return true;
    }
    console.warn("[ENGIE] refresh news status", res.status);
  } catch (e) {
    console.warn("[ENGIE] refresh news failed", e);
  }
  return false;
}

async function maybeTriggerEventsRefresh() {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/refresh/events`, {
      method: "POST",
      headers: authHeaders(),
      credentials: "omit",
      mode: "cors",
    });
    if (res.ok) {
      console.log("[ENGIE] refresh events OK");
      return true;
    }
    console.warn("[ENGIE] refresh events status", res.status);
  } catch (e) {
    console.warn("[ENGIE] refresh events failed", e);
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
        fetchArticlesBackendFirst(),
        fetchEventsFromSupabase(),
      ]);
      console.log("[ENGIE] loaded counts", { articles: a.length, events: e.length });
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
        fetchArticlesBackendFirst(),
        fetchEventsFromSupabase(),
      ]);
      console.log("[ENGIE] refreshed counts", { articles: a.length, events: e.length });
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
