//NewsCard.jsx
// src/components/NewsCard.jsx
// src/components/NewsCard.jsx
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY
);

/* ---------- helpers ---------- */
function timeAgo(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = (Date.now() - t) / 1000;
  const h = Math.floor(diff / 3600);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function displaySource(item) {
  const cap = (name) =>
    name.split(/[-\s]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
  const src = (item.Source || "").replace(/^www\./, "");
  if (src && src !== "news.google.com") return cap(src.replace(/\.[a-z]+$/i, ""));
  try {
    const link = item.Link || "";
    if (link.includes("news.google.com")) {
      const dec = decodeURIComponent(link);
      const start = dec.indexOf("http");
      if (start !== -1) {
        const real = dec.slice(start).split(/[?& ]/)[0];
        const host = new URL(real).hostname.replace(/^www\./, "").replace(/\.[a-z]+$/i, "");
        return cap(host);
      }
    }
    const host = new URL(link).hostname.replace(/^www\./, "").replace(/\.[a-z]+$/i, "");
    return cap(host);
  } catch {
    return "—";
  }
}
async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text || "");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- component ---------- */
export default function NewsCard({
  item,
  onToggleBookmark,
  folderId,            // set only on Bookmarks > Folder page
  enableNotes = false, // true only on Bookmarks > Folder page
}) {
  const publishedIso = item.PublishedAt || item.Published || item.publishedAt;

  const tags = (() => {
    const fromTopic = Array.isArray(item.Topic) ? item.Topic : [];
    if (fromTopic.length) return fromTopic;
    const split = (item.Keywords || "").split(",").map(s => s.trim()).filter(Boolean);
    const seen = new Set(), unique = [];
    for (const t of split) {
      const k = t.toLowerCase();
      if (!seen.has(k)) { seen.add(k); unique.push(t); }
    }
    return unique.slice(0, 4);
  })();

  // bookmark modal state
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkHash, setLinkHash] = useState(item._link_hash || null);
  const [alreadyIn, setAlreadyIn] = useState(new Set());
  const [isBookmarked, setIsBookmarked] = useState(!!item.Bookmarked);

  // notes state (folder view only)
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const noteBtnRef = useRef(null);
  const [notePos, setNotePos] = useState({ left: 0, top: 0, width: 520 });

  // confirm-remove mini dialog
  const [confirmRemove, setConfirmRemove] = useState(null);

  // hover tint
  const [hoverCard, setHoverCard] = useState(false);

  async function getLinkHash() {
    if (linkHash) return linkHash;
    let { data: row } = await supabase.from("news").select("link_hash").eq("link", item.Link || "").maybeSingle();
    const h = row?.link_hash || (await sha256Hex(item.Link || ""));
    setLinkHash(h);
    return h;
  }

  async function loadFolders() {
    const { data, error } = await supabase.from("folders").select("id,name,owner,visibility").order("name", { ascending: true });
    if (!error) setFolders(data || []);
  }

  async function loadAlreadyIn(currentHash) {
    const { data, error } = await supabase.from("bookmarks").select("folder_id").eq("article_link_hash", currentHash);
    if (!error) {
      const folderIds = new Set((data || []).map(r => r.folder_id));
      setAlreadyIn(folderIds);
      setIsBookmarked(folderIds.size > 0);
    }
  }

  async function ensureFolder(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return null;
    const { data: { user } = {} } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase.from("folders").insert([{ name: trimmed, owner: user.id, visibility: "team" }]).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function addToFolder(folderIdToAdd) {
    if (!folderIdToAdd || !linkHash) return;
    setSaving(true);
    try {
      const { data: { user } = {} } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error: insErr } = await supabase
        .from("bookmarks")
        .insert([{ folder_id: folderIdToAdd, article_link_hash: linkHash, created_by: user.id }]);
      if (insErr && !String(insErr.message || "").includes("duplicate")) throw insErr;
      setAlreadyIn(prev => {
        const next = new Set(prev);
        next.add(folderIdToAdd);
        setIsBookmarked(true);
        return next;
      });
      onToggleBookmark?.(item.id, true);
      setOpen(false);
      setCreating(false);
      setNewFolderName("");
    } catch (e) {
      console.error("Add to folder failed:", e);
      alert("Failed to add to folder.");
    } finally {
      setSaving(false);
    }
  }

  async function removeFromFolder(folderIdToRemove) {
    if (!folderIdToRemove || !linkHash) return;
    await supabase.from("bookmarks").delete().eq("folder_id", folderIdToRemove).eq("article_link_hash", linkHash);
    setAlreadyIn(prev => {
      const next = new Set(prev);
      next.delete(folderIdToRemove);
      const stillBookmarked = next.size > 0;
      setIsBookmarked(stillBookmarked);
      onToggleBookmark?.(item.id, stillBookmarked);
      return next;
    });
  }

  async function onBookmarkClick() {
    if (open) { setOpen(false); setCreating(false); return; }
    await loadFolders();
    const h = await getLinkHash();
    await loadAlreadyIn(h);
    setOpen(true);
  }

  /* ---------- NOTES (folder view only) ---------- */
  async function upsertNote(text) {
    const h = await getLinkHash();
    setNoteSaving(true);
    setNoteError("");
    try {
      let { error } = await supabase
        .from("folder_notes")
        .upsert([{ folder_id: folderId, article_link_hash: h, note: text }], { onConflict: "folder_id,article_link_hash" });
      if (error) {
        const { data: { user } = {} } = await supabase.auth.getUser();
        const retry = await supabase
          .from("folder_notes")
          .upsert([{ folder_id: folderId, article_link_hash: h, note: text, created_by: user?.id }], { onConflict: "folder_id,article_link_hash" });
        if (retry.error) throw retry.error;
      }
    } catch (e) {
      console.error("[folder_notes] upsert failed:", e?.message || e);
      setNoteError("Save failed");
    } finally {
      setNoteSaving(false);
    }
  }

  async function openNotePopover() {
    if (!enableNotes || !folderId) return;
    const width = 560, margin = 12;
    const rect = noteBtnRef.current?.getBoundingClientRect();
    let left = rect ? rect.left - (width - rect.width) / 2 : 100;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = rect ? rect.bottom + 10 : 110;
    if (top + 280 > window.innerHeight) top = Math.max(margin, (rect ? rect.top - 290 : 80));
    setNotePos({ left, top, width });
    setNoteOpen(true);
    setNoteLoading(true);
    setNoteError("");

    const h = await getLinkHash();
    const { data, error } = await supabase
      .from("folder_notes")
      .select("id, note")
      .eq("folder_id", folderId)
      .eq("article_link_hash", h)
      .maybeSingle();
    setNoteText(!error && data?.note ? data.note : "");
    setNoteLoading(false);
  }

  useEffect(() => {
    if (!noteOpen || !enableNotes || !folderId) return;
    const t = setTimeout(() => { upsertNote(noteText); }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteText, noteOpen, folderId, enableNotes]);

  async function closeNotePopover() {
    await upsertNote(noteText);
    setNoteOpen(false);
  }

  /* ---------- RENDER ---------- */
  return (
    <div
      className="card"
      onMouseEnter={() => setHoverCard(true)}
      onMouseLeave={() => setHoverCard(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        transition: "background-color .18s ease, box-shadow .18s ease",
        backgroundColor: hoverCard ? "#89b8eeff" : "#fff",
      }}
    >
      {/* TOP-RIGHT BUTTON STACK */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-end",
          zIndex: 2,
        }}
      >
        <button
          onClick={onBookmarkClick}
          disabled={saving}
          title={isBookmarked ? "In folders — click to manage" : "Add to folder"}
          aria-pressed={isBookmarked ? "true" : "false"}
          className="btn"
          style={{ padding: "6px 10px", borderRadius: 8, lineHeight: 1 }}
        >
          {isBookmarked ? "🔖" : "☆"}
        </button>

        {enableNotes && folderId && (
          <button
            ref={noteBtnRef}
            className="btn"
            onClick={() => (noteOpen ? closeNotePopover() : openNotePopover())}
            title="Add a note for this folder"
            style={{ padding: "6px 10px", borderRadius: 8, lineHeight: 1 }}
          >
            📝
          </button>
        )}
      </div>

      {/* HEAD: TITLE ONLY (no summary here to avoid side-by-side layout) */}
      <div className="card-head" style={{ paddingRight: 42 }}>
        <a href={item.Link} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
          <div className="title">{item.Title}</div>
        </a>
      </div>

      {/* SUMMARY BELOW THE HEAD (stacked) */}
      <div className="summary">{item.Summary}</div>

      {/* FOOTER pinned to bottom */}
      <div className="card-foot" style={{ marginTop: "auto" }}>
        {/* Row 1: Region (left) — Source (right) */}
        <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div className="text-sm" style={{ flex: "1 1 auto", minWidth: 0 }}>
            <strong className="text-black">Region:</strong> {item.Region || "Global"}
          </div>
          <div
            className="source"
            style={{ flex: "0 0 auto", marginLeft: "auto", textAlign: "right", whiteSpace: "nowrap", color: "#5b6780", fontWeight: 500 }}
          >
            {displaySource(item)}
          </div>
        </div>

        {/* Row 2: tags (left) — time (right) */}
        <div style={{ display: "flex", width: "100%", alignItems: "center", gap: 12 }}>
          <div className="tags" style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: "1 1 auto", minWidth: 0 }}>
            {tags.map((t, i) => (
              <span key={`${t}-${i}`} className="chip">{t}</span>
            ))}
          </div>
          <span className="ago" style={{ flex: "0 0 auto", marginLeft: "auto", whiteSpace: "nowrap", color: "#2f5ea8", fontWeight: 500 }}>
            {timeAgo(publishedIso)}
          </span>
        </div>
      </div>

      {/* ADD-TO-FOLDER MODAL */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) { setOpen(false); setCreating(false); } }}
        >
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 26, width: 420, maxHeight: "80vh", overflow: "auto", boxShadow: "0 12px 40px rgba(10,20,60,.22)", position: "relative" }}
          >
            <h3 style={{ marginBottom: 14 }}>Add to folder</h3>
            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              {(folders || []).map((f) => {
                const inThis = alreadyIn.has(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => (inThis ? setConfirmRemove({ id: f.id, name: f.name }) : addToFolder(f.id))}
                    disabled={saving}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: inThis ? "#f3f4f8" : "#eef3ff", border: "1px solid #dcdfea", borderRadius: 10, padding: "10px 12px", cursor: "pointer" }}
                    title={inThis ? "Click to remove from this folder" : "Click to add to this folder"}
                  >
                    <span>{f.name}</span>
                    {inThis && (
                      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#e7e9f2", border: "1px solid #d1d6e6" }}>
                        Already in
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {!creating ? (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <button className="btn" onClick={() => setCreating(true)}>+ Create new folder</button>
                <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #dcdfea", borderRadius: 8 }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") { const id = await ensureFolder(newFolderName); if (id) await addToFolder(id); }
                    if (e.key === "Escape") { setCreating(false); setNewFolderName(""); }
                  }}
                />
                <button className="btn primary" onClick={async () => { const id = await ensureFolder(newFolderName); if (id) await addToFolder(id); }} disabled={!newFolderName.trim() || saving}>
                  Create
                </button>
              </div>
            )}

            {confirmRemove && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.65)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12 }}>
                <div role="dialog" aria-modal="true" style={{ background: "#fff", border: "1px solid #e5e7f2", borderRadius: 12, padding: 18, width: 340, boxShadow: "0 10px 28px rgba(20,30,80,.18)", textAlign: "center" }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Remove from “{confirmRemove.name}”?</div>
                  <div style={{ fontSize: 14, color: "#5b6780", marginBottom: 14 }}>This article will no longer be in this folder.</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button className="btn" onClick={() => setConfirmRemove(null)}>Cancel</button>
                    <button className="btn" style={{ background: "#c62828", color: "#fff" }} onClick={async () => { await removeFromFolder(confirmRemove.id); setConfirmRemove(null); }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* NOTE POPOVER (folder view only) */}
      {enableNotes && folderId && noteOpen && (
        <div style={{ position: "fixed", left: `${notePos.left}px`, top: `${notePos.top}px`, width: `${notePos.width}px`, zIndex: 1001 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e6f3", borderRadius: 12, boxShadow: "0 14px 44px rgba(16,30,80,.22)", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>Folder note</div>
              <div style={{ fontSize: 12, color: noteError ? "#c62828" : "#5b6780" }}>
                {noteError ? noteError : noteSaving ? "Saving…" : "Auto-save"}
              </div>
            </div>
            <textarea
              autoFocus
              placeholder="Write a short note for teammates…"
              value={noteLoading ? "" : noteText}
              onChange={(e) => setNoteText(e.target.value)}
              style={{ width: "100%", minHeight: 160, padding: "10px 12px", border: "1px solid #dcdfea", borderRadius: 10, outline: "none", resize: "vertical", background: noteLoading ? "#f7f8fc" : "#fff" }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: "#5b6780" }}>
              Only visible in this folder. Removing the bookmark also removes this note.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button className="btn" onClick={closeNotePopover}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
