
import { useEffect, useMemo, useRef, useState } from "react";
import NewsCard from "../components/NewsCard.jsx";
import { supabase } from "../lib/supabaseClient";


/* Helpers */
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

async function sha256Hex(text) {
  const enc = new TextEncoder().encode(text || "");
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildArticleIndex(articles) {
  const map = new Map();
  for (const it of articles || []) {
    const link = it.Link || it.link;
    if (!link) continue;
    const hash = await sha256Hex(link);
    map.set(hash, {
      Title: it.Title ?? it.title,
      Link: link,
      Source: it.Source ?? it.source,
      PublishedAt: it.PublishedAt ?? it.published ?? it.publishedAt,
      Summary: it.Summary ?? it.summary,
      Keywords: it.Keywords ?? it.keywords,
      Region: it.Region ?? it.region,
      Topic: Array.isArray(it.Topic) ? it.Topic : Array.isArray(it.topic) ? it.topic : [],
      id: it.id ?? link,
      Bookmarked: true,
      _link_hash: hash,
    });
  }
  return map;
}

/* Try view first; if missing/forbidden, fall back to base table */
async function fetchBookmarksForFolder(folderId) {
  const viewSel = await supabase
    .from("bookmarks_with_usernames")
    .select("id, article_link_hash, created_by, created_by_username, created_at")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (!viewSel.error) return viewSel.data || [];

  console.warn("[Bookmarks] view failed, falling back:", viewSel.error?.message);

  const baseSel = await supabase
    .from("bookmarks")
    .select("id, article_link_hash, created_by, created_at")
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  if (baseSel.error) throw baseSel.error;
  return (baseSel.data || []).map((b) => ({ ...b, created_by_username: null }));
}

/* Optional: fallback username loader (only used if we fell back to base table) */
async function loadUsernamesByIds(ids = []) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return {};
  const { data, error } = await supabase
    .schema("auth")
    .from("users")
    .select("id, raw_user_meta_data")
    .in("id", unique);

  if (error) {
    console.warn("[Bookmarks] auth.users not readable, using short IDs");
    return Object.fromEntries(unique.map((id) => [id, id.slice(0, 8)]));
  }
  const out = {};
  (data || []).forEach((u) => {
    out[u.id] =
      u?.raw_user_meta_data?.username ||
      u?.raw_user_meta_data?.display_name ||
      (u?.id ? u.id.slice(0, 8) : "Unknown");
  });
  unique.forEach((id) => {
    if (!out[id]) out[id] = id.slice(0, 8);
  });
  return out;
}

export default function Bookmarks({ articles, onToggle }) {
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [items, setItems] = useState([]);

  const [me, setMe] = useState(null);
  const [usernames, setUsernames] = useState({}); // fallback cache

  const [region, setRegion] = useState("All");
  const [keyword, setKeyword] = useState("All");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [menuFor, setMenuFor] = useState(null);
  const menuRef = useRef(null);

  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [renameFor, setRenameFor] = useState(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user || null);
    })();
  }, []);

  useEffect(() => {
    if (!selectedFolder) refreshFolders();
  }, [selectedFolder]);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setMenuFor(null);
    }
    if (menuFor) {
      document.addEventListener("mousedown", onDocClick);
      return () => document.removeEventListener("mousedown", onDocClick);
    }
  }, [menuFor]);

  async function refreshFolders() {
    try {
      setLoadingFolders(true);
      const { data, error } = await supabase
        .from("folders_with_counts")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      setFolders(data || []);
      const ownerMap = await loadUsernamesByIds((data || []).map((f) => f.owner));
      setUsernames((prev) => ({ ...prev, ...ownerMap }));
    } catch (e) {
      console.error("Load folders failed:", e);
      setFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return alert("Not authenticated.");
      const { error } = await supabase
        .from("folders")
        .insert([{ name: newFolderName.trim(), owner: userId, visibility: "team" }]);
      if (error) throw error;
      setShowCreateModal(false);
      setNewFolderName("");
      await refreshFolders();
    } catch (e) {
      console.error("Create folder failed:", e);
      alert("Failed to create folder.");
    }
  }

  async function openFolder(folder) {
    try {
      setSelectedFolder(folder);
      setRegion("All");
      setKeyword("All");

      const bms = await fetchBookmarksForFolder(folder.id);
      if (!bms || !bms.length) {
        setItems([]);
        return;
      }

      const missingIds = bms.filter((b) => !b.created_by_username).map((b) => b.created_by);
      if (missingIds.length) {
        const map = await loadUsernamesByIds(missingIds);
        setUsernames((prev) => ({ ...prev, ...map }));
      }

      const idx = await buildArticleIndex(articles);
      const merged = [];
      for (const b of bms) {
        const a = idx.get(b.article_link_hash);
        if (!a) continue;
        merged.push({
          ...a,
          _bookmark: {
            id: b.id,
            created_by: b.created_by,
            created_by_username: b.created_by_username || null,
            created_at: b.created_at,
          },
        });
      }
      merged.sort((a, b) => {
        const ta = a._bookmark?.created_at ? +new Date(a._bookmark.created_at) : 0;
        const tb = b._bookmark?.created_at ? +new Date(b._bookmark.created_at) : 0;
        return tb - ta;
      });
      setItems(merged);
    } catch (e) {
      console.error("Open folder failed:", e);
      alert("Failed to load folder.");
    }
  }

  function backToGrid() {
    setSelectedFolder(null);
    setItems([]);
  }

  async function doDeleteFolder(folder) {
    try {
      setDeleting(true);
      const { error: bErr } = await supabase.from("bookmarks").delete().eq("folder_id", folder.id);
      if (bErr) throw bErr;
      const { error: fErr } = await supabase.from("folders").delete().eq("id", folder.id);
      if (fErr) throw fErr;
      setConfirmDeleteFor(null);
      await refreshFolders();
    } catch (e) {
      console.error("Delete folder failed:", e);
      alert("Failed to delete folder.");
    } finally {
      setDeleting(false);
    }
  }

  async function doRenameFolder(folder) {
    try {
      if (!renameName.trim()) return;
      setRenaming(true);
      const { error } = await supabase.from("folders").update({ name: renameName.trim() }).eq("id", folder.id);
      if (error) throw error;
      setRenameFor(null);
      await refreshFolders();
    } catch (e) {
      console.error("Rename folder failed:", e);
      alert("Failed to rename folder.");
    } finally {
      setRenaming(false);
    }
  }

  const regions = useMemo(() => {
    const r = Array.from(new Set(items.map((it) => it.Region).filter(Boolean))).sort();
    return ["All", ...r];
  }, [items]);

  const keywords = useMemo(() => {
    const all = new Set();
    for (const it of items) {
      if (Array.isArray(it.Topic)) it.Topic.filter(Boolean).forEach((k) => all.add(k));
      if (it.Keywords) it.Keywords.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => all.add(k));
    }
    return ["All", ...Array.from(all).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const regionMatch = (a) => region === "All" || a.Region === region;
    const keywordMatch = (a) => {
      const list = [
        ...(Array.isArray(a.Topic) ? a.Topic : []),
        ...(a.Keywords ? a.Keywords.split(",").map((s) => s.trim()) : []),
      ];
      return keyword === "All" || list.some((k) => k.toLowerCase() === keyword.toLowerCase());
    };
    return items.filter((a) => regionMatch(a) && keywordMatch(a));
  }, [items, region, keyword]);

  const renderFolderCard = (f) => {
    const createdBy =
      me && f.owner === me.id ? "you" : f.owner_username || usernames[f.owner] || (f.owner || "").slice(0, 8);
    return (
      <div
        key={f.id}
        className="card folder-card"
        onClick={() => openFolder(f)}
        title={f.visibility === "team" ? "Team-shared" : "Private"}
        style={{ position: "relative" }}
      >
        <button
          aria-label="Folder menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuFor((cur) => (cur === f.id ? null : f.id));
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            border: "1px solid var(--border)",
            background: "#fff",
            borderRadius: 8,
            padding: "4px 8px",
            cursor: "pointer",
            color: "#1c2430",
          }}
        >
          ⋯
        </button>

        {menuFor === f.id && (
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 36,
              right: 8,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(30,70,140,.12)",
              minWidth: 180,
              zIndex: 20,
            }}
          >
            <button
              onClick={() => {
                setMenuFor(null);
                setRenameFor(f);
                setRenameName(f.name);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#0554caff",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Rename folder
            </button>

            <button
              onClick={() => {
                setMenuFor(null);
                setConfirmDeleteFor(f);
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "#c62828",
                borderBottom: "1px solid var(--border)",
              }}
            >
              Delete folder
            </button>

            <button
              onClick={() => setMenuFor(null)}
              style={{ width: "100%", textAlign: "left", padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer" }}
            >
              Close
            </button>
          </div>
        )}

        <div className="title">{f.name}</div>
        <div className="folder-meta">Created by: {createdBy}</div>
        <div className="folder-count">
          <span>Articles: {f.article_count || 0}</span>
        </div>
      </div>
    );
  };

  if (!selectedFolder) {
    return (
      <>
        <div className="grid-full top-banner">
          <h2>Your Bookmark Folders</h2>
          <p>Folders can be team-shared or private. Click a folder to view its saved articles.</p>
        </div>

        {loadingFolders && <div className="empty grid-full">Loading folders…</div>}
        {!loadingFolders && folders.length === 0 && (
          <div className="empty grid-full">No folders yet. Create your first one.</div>
        )}

        {folders.map(renderFolderCard)}

        <div
          className="card folder-card create-card"
          onClick={() => setShowCreateModal(true)}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 60, fontWeight: 300, color: "#1f3b6e" }}>+</div>
            <div style={{ fontSize: 16, color: "#1f3b6e" }}>Create new folder</div>
          </div>
        </div>

        {showCreateModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 26,
                width: 360,
                maxWidth: "100%",
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(10,20,60,.22)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") createFolder();
                if (e.key === "Escape") setShowCreateModal(false);
              }}
            >
              <h3 style={{ margin: "2px 0 14px 0" }}>Create New Folder</h3>
              <input
                type="text"
                placeholder="Enter folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  marginBottom: 18,
                  border: "1px solid #dcdfea",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "#fbfcff",
                }}
              />
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <button className="btn" onClick={() => setShowCreateModal(false)} style={{ background: "#e7e9f2", color: "#0b1220" }}>
                  Cancel
                </button>
                <button className="btn primary" onClick={createFolder}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmDeleteFor && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 26,
                width: 380,
                maxWidth: "100%",
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(10,20,60,.22)",
              }}
            >
              <h3 style={{ margin: "2px 0 10px 0" }}>Delete folder?</h3>
              <p style={{ margin: "0 0 16px 0", color: "#5b6780", fontSize: 14 }}>
                This will remove <strong>{confirmDeleteFor.name}</strong> and all of its bookmarks.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <button className="btn" onClick={() => setConfirmDeleteFor(null)} style={{ background: "#e7e9f2", color: "#0b1220" }} disabled={deleting}>
                  No
                </button>
                <button className="btn" style={{ background: "#c62828", color: "#fff" }} onClick={() => doDeleteFolder(confirmDeleteFor)} disabled={deleting}>
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {renameFor && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 26,
                width: 360,
                maxWidth: "100%",
                textAlign: "center",
                boxShadow: "0 12px 40px rgba(10,20,60,.22)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRenameFolder(renameFor);
                if (e.key === "Escape") setRenameFor(null);
              }}
            >
              <h3 style={{ margin: "2px 0 14px 0" }}>Rename Folder</h3>
              <input
                type="text"
                placeholder="Enter new name…"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  marginBottom: 18,
                  border: "1px solid #dcdfea",
                  borderRadius: 8,
                  fontSize: 14,
                  background: "#fbfcff",
                }}
              />
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                <button className="btn" onClick={() => setRenameFor(null)} style={{ background: "#e7e9f2", color: "#0b1220" }} disabled={renaming}>
                  Cancel
                </button>
                <button className="btn primary" onClick={() => doRenameFolder(renameFor)} disabled={renaming}>
                  {renaming ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* ===== Folder detail mode ===== */
  const createdByName =
    me && selectedFolder.owner === me.id
      ? "you"
      : selectedFolder.owner_username || usernames[selectedFolder.owner] || (selectedFolder.owner || "").slice(0, 8);

  return (
    <>
      <div className="grid-full top-banner">
        <h2>{selectedFolder.name}</h2>
        <p>
          {selectedFolder.visibility === "team" ? "Team-shared folder" : "Private folder"} · Created by {createdByName}
        </p>

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

        <div style={{ marginTop: 8 }}>
          <button className="btn" onClick={backToGrid}>
            ← Back to folders
          </button>
        </div>
      </div>

      {filtered.map((a) => {
        const uid = a._bookmark?.created_by;
        const uname =
          me && uid === me.id ? "you" : (a._bookmark?.created_by_username || usernames[uid] || (uid || "").slice(0, 8));

        return (
          <div key={a.id}>
            <NewsCard
              item={a}
              onToggleBookmark={onToggle}
              folderId={selectedFolder.id}   // enables notes
              enableNotes={true}             // only in folders page
            />
            {a._bookmark && (
              <div className="bookmark-meta">
                Bookmarked by {uname} · {timeAgo(a._bookmark.created_at)} ({new Date(a._bookmark.created_at).toLocaleString()})
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && <div className="empty grid-full">This folder has no matching articles.</div>}
    </>
  );
}
