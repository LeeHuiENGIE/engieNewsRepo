// src/pages/Login.jsx
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import "./Login.css";
import engieLogo from "../assets/engieLogo.png";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPw, setShowPw] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      // Step 1: get email for username
      const { data, error: rpcErr } = await supabase.rpc(
        "get_email_for_username",
        { u: username.trim() }
      );
      if (rpcErr || !data) {
        setError("Invalid username");
        return;
      }

      // Step 2: sign in with password
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: data,
        password,
      });

      if (signErr) {
        setError(signErr.message || "Sign-in failed");
      } else {
        setInfo("Signed in! Redirecting…");
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError("Unexpected error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page center">
      <div className="login-card" role="dialog" aria-labelledby="login-title">
        {/* Top logo */}
        <div className="login-logo">
          <img src={engieLogo} alt="ENGIE" />
        </div>

        {/* Title */}
        <h1 id="login-title" className="login-title">
          ENGIE News Repository <span>3.0</span>
        </h1>
        <p className="login-sub">
          Sign in with your username.
          <br />
          Please approach the best intern for one hehe.
        </p>

        {/* Form */}
        <form onSubmit={signIn} className="login-form" noValidate>
          {/* Username with leading icon */}
          <div className="input-field" aria-live="polite">
            <span
              aria-hidden="true"
              style={{
                display: "inline-grid",
                placeItems: "center",
                marginRight: 10,
                opacity: 0.6,
              }}
              title="Username"
            >
              {/* user icon (thin outline style) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="7" r="4" />
                <path d="M5.5 21a7 7 0 0 1 13 0" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              aria-label="Username"
            />
          </div>

          {/* Password with lock icon + subtle eye toggle */}
          <div className="input-field" aria-live="polite">
            <span
              aria-hidden="true"
              style={{
                display: "inline-grid",
                placeItems: "center",
                marginRight: 10,
                opacity: 0.6,
              }}
              title="Password"
            >
              {/* lock icon (thin outline style) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>

            <input
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-label="Password"
              style={{ flex: 1 }}
            />

            <button
              type="button"
              className="pw-toggle subtle-eye"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              title={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? (
                // eye-off icon
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a19.86 19.86 0 0 1 5.06-5.94M1 1l22 22" />
                  <path d="M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88" />
                </svg>
              ) : (
                // eye icon
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {info && (
            <div className="alert ok" role="status">
              {info}
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={busy} className="btn-submit">
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <small>© ENGIE News Repository • Built by Chan Jin Kai :-)</small>
        </div>
      </div>
    </div>
  );
}
