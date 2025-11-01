//Header.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY
);

export default function Header({ onRefresh, refreshing }) {
  const navigate = useNavigate();
  const [role, setRole] = useState(null); // store user role

  // --- fetch role on mount ---
  useEffect(() => {
    const fetchUserRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setRole(user.app_metadata?.role || "user");
      } else {
        setRole("user");
      }
    };
    fetchUserRole();
  }, []);

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await supabase.auth.signOut();
      localStorage.clear();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <header className="header">
      <div className="brand">ENGIE • News Repository</div>

      <nav className="nav">
        {/* 🏠 Home */}
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            isActive ? "navlink active" : "navlink"
          }
        >
          Home
        </NavLink>

        {/* 📰 News */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? "navlink active" : "navlink"
          }
        >
          News
        </NavLink>

        {/* 🔖 Bookmarks */}
        <NavLink
          to="/bookmarks"
          className={({ isActive }) =>
            isActive ? "navlink active" : "navlink"
          }
        >
          Bookmarks
        </NavLink>

        {/* 🔍 Search — only for admins */}
        {role === "admin" && (
          <button
            type="button"
            className="btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRefresh?.();
            }}
            disabled={refreshing}
            style={{ marginLeft: 8 }}
          >
            {refreshing ? "Searching…" : "Search"}
          </button>
        )}

        {/* 🚪 Logout */}
        <button
          type="button"
          className="btn logout-btn"
          onClick={handleLogout}
          style={{ marginLeft: 8 }}
        >
          Logout
        </button>
      </nav>
    </header>
  );
}
