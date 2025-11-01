// front/src/App.jsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./auth/useSession";

// Pages
import Login from "./pages/Login.jsx";
import Home from "./pages/Home.jsx";
import Bookmarks from "./pages/Bookmarks.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Header from "./components/Header.jsx";

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

/* ---------------- Helpers: Events (NEW) ---------------- */
async function fetchEventsTryBoth() {
  for (const base of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
    try {
      const res = await fetch(`${base}/events`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[ENGIE] Loaded events from backend: ${base}`);
        return Array.isArray(data) ? data : [];
      } else {
        console.warn(`[ENGIE] ${base}/events responded ${res.status}`);
      }
    } catch (e) {
      console.warn(`[ENGIE] fetch failed from ${base}/events`, e);
    }
  }
  return [];
}

async function triggerRefreshEventsTryBoth() {
  for (const base of ["http://localhost:8000", "http://127.0.0.1:8000"]) {
    try {
      const res = await fetch(`${base}/refresh/events`, { method: "POST" });
      if (res.ok) {
        console.log(`[ENGIE] Events refresh triggered via ${base}/refresh/events`);
        return true;
      } else {
        console.warn(`[ENGIE] ${base}/refresh/events responded ${res.status}`);
      }
    } catch (e) {
      console.warn(`[ENGIE] refresh events failed via ${base}/refresh/events`, e);
    }
  }
  return false;
}

/* ---------------- Main App ---------------- */
export default function App() {
  const { session, loading } = useSession();
  const location = useLocation();

  const [articles, setArticles] = useState([]);
  const [events, setEvents] = useState([]); // NEW
  const [refreshing, setRefreshing] = useState(false);

  const isDashboard = location.pathname === "/dashboard";
  const onLoginPage = location.pathname === "/login";

  // Initial load: fetch both articles and events
  useEffect(() => {
    (async () => {
      const [a, e] = await Promise.all([
        fetchArticlesTryBoth(),
        fetchEventsTryBoth(),
      ]);
      setArticles(a);
      setEvents(e);
    })();
  }, []);

  // Bookmark toggle logic
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

  // Refresh button: refresh both news and events, then re-fetch both
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await triggerRefreshTryBoth();          // news ETL
      await triggerRefreshEventsTryBoth();    // events ETL
      const [a, e] = await Promise.all([
        fetchArticlesTryBoth(),
        fetchEventsTryBoth(),
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

              {/* Dashboard gets events */}
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
