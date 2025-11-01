// front/src/api.js
import { API_BASE } from "./config";

// ---- Public reads ----
export async function getArticles() {
  const r = await fetch(`${API_BASE}/articles`);
  if (!r.ok) throw new Error(`articles ${r.status}`);
  return r.json();
}

export async function getEvents() {
  const r = await fetch(`${API_BASE}/events`);
  if (!r.ok) throw new Error(`events ${r.status}`);
  return r.json();
}

// ---- (optional) Admin triggers; wire later if you want buttons ----
// export async function refreshArticles() {
//   const r = await fetch(`${API_BASE}/refresh`, { method: "POST" });
//   if (!r.ok) throw new Error(`refresh articles ${r.status}`);
//   return r.json();
// }
//
// export async function refreshEvents() {
//   const r = await fetch(`${API_BASE}/refresh/events`, { method: "POST" });
//   if (!r.ok) throw new Error(`refresh events ${r.status}`);
//   return r.json();
// }
