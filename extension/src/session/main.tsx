import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { classifyTabUrl, normalizeTabUrlForDedupe } from "../lib/tab-session/classify-tab";
import { getDB, listSessionSnapshotsDesc, putSessionSnapshot, deleteSessionSnapshot } from "../lib/storage/idb";
import type { SessionSnapshotRecord, SessionTabSnapshot } from "../shared/types";
import "../ui/styles.css";

type LiveTabRow = {
  tabId: number;
  windowId: number;
  windowFocused: boolean;
  index: number;
  title: string;
  url: string;
  pinned: boolean;
  audible: boolean;
  active: boolean;
  groupId: string;
  groupLabel: string;
  sortOrder: number;
};

function snapshotToRows(tabs: SessionTabSnapshot[]): LiveTabRow[] {
  return tabs.map((t) => ({
    tabId: t.tabId,
    windowId: t.windowId,
    windowFocused: t.windowFocused,
    index: t.tabIndex,
    title: t.title,
    url: t.url,
    pinned: t.pinned,
    audible: t.audible,
    active: t.active,
    groupId: t.groupId,
    groupLabel: t.groupLabel,
    sortOrder: t.sortOrder,
  }));
}

async function fetchLiveTabRows(): Promise<LiveTabRow[]> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  const rows: LiveTabRow[] = [];
  for (const w of windows) {
    if (w.type !== "normal" || !w.tabs) continue;
    const wid = w.id ?? -1;
    for (const tab of w.tabs) {
      if (tab.id == null) continue;
      const url = tab.url ?? tab.pendingUrl ?? "";
      const g = classifyTabUrl(url);
      rows.push({
        tabId: tab.id,
        windowId: wid,
        windowFocused: w.focused ?? false,
        index: tab.index ?? 0,
        title: tab.title ?? "",
        url,
        pinned: tab.pinned ?? false,
        audible: tab.audible ?? false,
        active: tab.active ?? false,
        groupId: g.id,
        groupLabel: g.label,
        sortOrder: g.sortOrder,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const gl = a.groupLabel.localeCompare(b.groupLabel);
    if (gl !== 0) return gl;
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.index - b.index;
  });
  return rows;
}

function groupRows(rows: LiveTabRow[]): { groupId: string; label: string; sortOrder: number; tabs: LiveTabRow[] }[] {
  const map = new Map<string, { sortOrder: number; label: string; tabs: LiveTabRow[] }>();
  for (const row of rows) {
    let g = map.get(row.groupId);
    if (!g) {
      g = { sortOrder: row.sortOrder, label: row.groupLabel, tabs: [] };
      map.set(row.groupId, g);
    }
    g.tabs.push(row);
  }
  return [...map.entries()]
    .map(([groupId, v]) => ({ groupId, label: v.label, sortOrder: v.sortOrder, tabs: v.tabs }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

function duplicateExtraTabIds(rows: LiveTabRow[], allowClosePinned: boolean): number[] {
  const byNorm = new Map<string, LiveTabRow[]>();
  for (const r of rows) {
    if (!allowClosePinned && r.pinned) continue;
    const k = normalizeTabUrlForDedupe(r.url);
    if (!k) continue;
    let arr = byNorm.get(k);
    if (!arr) {
      arr = [];
      byNorm.set(k, arr);
    }
    arr.push(r);
  }
  const out: number[] = [];
  for (const arr of byNorm.values()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) =>
      a.windowId !== b.windowId ? a.windowId - b.windowId : a.index - b.index,
    );
    for (let i = 1; i < sorted.length; i++) out.push(sorted[i].tabId);
  }
  return out;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function App() {
  const [liveRows, setLiveRows] = useState<LiveTabRow[]>([]);
  const [historical, setHistorical] = useState<SessionSnapshotRecord | null>(null);
  const [snapshots, setSnapshots] = useState<SessionSnapshotRecord[]>([]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [allowClosePinned, setAllowClosePinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isLive = historical == null;
  const displayRows = isLive ? liveRows : snapshotToRows(historical.tabs);
  const groups = useMemo(() => groupRows(displayRows), [displayRows]);

  const refreshSnapshots = useCallback(async () => {
    try {
      const db = await getDB();
      const list = await listSessionSnapshotsDesc(db, 80);
      setSnapshots(list);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshLive = useCallback(async () => {
    setLoadError(null);
    try {
      const rows = await fetchLiveTabRows();
      setLiveRows(rows);
      setExpanded(new Set(groupRows(rows).map((g) => g.groupId)));
      setSelected(new Set());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshLive();
    void refreshSnapshots();
  }, [refreshLive, refreshSnapshots]);

  const toggleTab = (tabId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const toggleGroup = (tabs: LiveTabRow[]) => {
    const selectable = tabs.filter((t) => allowClosePinned || !t.pinned).map((t) => t.tabId);
    if (selectable.length === 0) return;
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = selectable.every((id) => next.has(id));
      if (allOn) for (const id of selectable) next.delete(id);
      else for (const id of selectable) next.add(id);
      return next;
    });
  };

  const selectDuplicates = () => {
    if (!isLive) return;
    const extras = duplicateExtraTabIds(liveRows, allowClosePinned);
    setSelected(new Set(extras));
    setMsg(extras.length ? `Selected ${extras.length} duplicate tab(s) (same URL).` : "No duplicate URLs found among selectable tabs.");
  };

  const clearSelection = () => {
    setSelected(new Set());
    setMsg(null);
  };

  const closeableSelectedIds = useMemo(() => {
    const ids = [...selected];
    if (isLive) {
      return ids.filter((id) => {
        const row = liveRows.find((r) => r.tabId === id);
        if (!row) return false;
        if (!allowClosePinned && row.pinned) return false;
        return true;
      });
    }
    return [];
  }, [selected, isLive, liveRows, allowClosePinned]);

  const closeSelected = async () => {
    if (!isLive || closeableSelectedIds.length === 0) return;
    const n = closeableSelectedIds.length;
    if (!confirm(`Close ${n} tab${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await chrome.tabs.remove(closeableSelectedIds);
      setSelected(new Set());
      await refreshLive();
      setMsg(`Closed ${n} tab(s).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const logSnapshot = async () => {
    if (!isLive || liveRows.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const db = await getDB();
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
      const windowCount = windows.filter((w) => w.type === "normal").length;
      const record: SessionSnapshotRecord = {
        id: crypto.randomUUID(),
        captured_at: Date.now(),
        tab_count: liveRows.length,
        window_count: windowCount,
        tabs: liveRows.map((r) => ({
          windowId: r.windowId,
          windowFocused: r.windowFocused,
          tabIndex: r.index,
          tabId: r.tabId,
          title: r.title,
          url: r.url,
          groupId: r.groupId,
          groupLabel: r.groupLabel,
          sortOrder: r.sortOrder,
          pinned: r.pinned,
          audible: r.audible,
          active: r.active,
        })),
      };
      await putSessionSnapshot(db, record);
      await refreshSnapshots();
      setMsg(`Logged snapshot (${record.tab_count} tabs, ${record.window_count} windows).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openSnapshot = (snap: SessionSnapshotRecord) => {
    setHistorical(snap);
    setSelected(new Set());
    setMsg(null);
    setExpanded(new Set(groupRows(snapshotToRows(snap.tabs)).map((g) => g.groupId)));
  };

  const deleteSnap = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this saved snapshot from local storage?")) return;
    try {
      const db = await getDB();
      await deleteSessionSnapshot(db, id);
      if (historical?.id === id) {
        setHistorical(null);
        void refreshLive();
      }
      await refreshSnapshots();
      setMsg("Snapshot deleted.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const backToLive = () => {
    setHistorical(null);
    setSelected(new Set());
    setMsg(null);
    void refreshLive();
  };

  const toggleExpanded = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Session overview</h1>
        {!isLive && (
          <span className="badge warn" style={{ fontSize: 12 }}>
            Snapshot {formatTime(historical!.captured_at)}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {!isLive ? (
            <button type="button" onClick={backToLive}>
              Back to live tabs
            </button>
          ) : (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => void refreshLive()}>
                Refresh
              </button>
              <button type="button" className="secondary" disabled={busy || liveRows.length === 0} onClick={() => void logSnapshot()}>
                Log snapshot
              </button>
            </>
          )}
          <button type="button" className="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
          </button>
        </div>
      </header>

      <section className="card" style={{ marginBottom: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--muted)" }}>
          All <strong>normal</strong> browser windows are listed, grouped by site/type (Jira, Google Docs, Red Hat docs, etc.). Select tabs to close in bulk, or log a snapshot for later review. Data stays in local IndexedDB.
        </p>
        {isLive && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <input
                type="checkbox"
                checked={allowClosePinned}
                onChange={(e) => setAllowClosePinned(e.target.checked)}
              />
              Allow closing pinned tabs
            </label>
            <button type="button" className="secondary" disabled={busy} onClick={clearSelection}>
              Clear selection
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={selectDuplicates}>
              Select duplicate URLs
            </button>
            <button type="button" disabled={busy || closeableSelectedIds.length === 0} onClick={() => void closeSelected()}>
              Close selected ({closeableSelectedIds.length})
            </button>
          </div>
        )}
        {loadError && <p style={{ color: "var(--danger)", fontSize: 13, margin: "8px 0 0" }}>{loadError}</p>}
        {msg && (
          <p style={{ fontSize: 13, margin: "8px 0 0", color: "var(--ok)" }}>{msg}</p>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 240px) 1fr", gap: 16, alignItems: "start" }}>
        <aside className="card" style={{ position: "sticky", top: 12 }}>
          <h2 style={{ marginTop: 0, fontSize: 14 }}>Saved snapshots</h2>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 0 }}>
            Newest first. Open to view; delete frees space only (does not close tabs).
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: "70vh", overflow: "auto" }}>
            {snapshots.length === 0 && <li style={{ fontSize: 12, color: "var(--muted)" }}>None yet — use Log snapshot.</li>}
            {snapshots.map((s) => (
              <li
                key={s.id}
                style={{
                  fontSize: 12,
                  padding: "6px 4px",
                  borderBottom: "1px solid var(--border)",
                  background: historical?.id === s.id ? "rgba(59,130,246,0.12)" : undefined,
                  cursor: "pointer",
                }}
              >
                <button
                  type="button"
                  onClick={() => openSnapshot(s)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{formatTime(s.captured_at)}</div>
                  <div style={{ color: "var(--muted)" }}>
                    {s.tab_count} tabs · {s.window_count} windows
                  </div>
                </button>
                <button
                  type="button"
                  className="secondary"
                  style={{ marginTop: 4, fontSize: 11, padding: "0.2rem 0.45rem" }}
                  onClick={(e) => void deleteSnap(s.id, e)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 0 }}>
            {displayRows.length} tab{displayRows.length === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}
            {isLive ? "" : " (historical)"}
          </p>
          {groups.map((g) => {
            const isOpen = expanded.has(g.groupId);
            const selectableIds = g.tabs.filter((t) => allowClosePinned || !t.pinned).map((t) => t.tabId);
            const allSelected =
              selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
            const someSelectableSelected =
              selectableIds.some((id) => selected.has(id)) && !allSelected;
            return (
              <section
                key={g.groupId}
                className="card"
                style={{ marginBottom: 12, padding: "10px 12px" }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: isOpen ? 8 : 0,
                  }}
                >
                  <button
                    type="button"
                    className="secondary"
                    style={{ padding: "0.25rem 0.5rem", fontSize: 12 }}
                    onClick={() => toggleExpanded(g.groupId)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "▼" : "▶"}
                  </button>
                  <strong style={{ fontSize: 14 }}>{g.label}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>({g.tabs.length})</span>
                  {isLive && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableIds.length === 0}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelectableSelected;
                        }}
                        onChange={() => toggleGroup(g.tabs)}
                      />
                      Select group
                    </label>
                  )}
                </div>
                {isOpen && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                        {isLive && <th style={{ padding: "4px 6px", width: 36 }} />}
                        <th style={{ padding: "4px 6px" }}>Title</th>
                        <th style={{ padding: "4px 6px", minWidth: 200 }}>URL</th>
                        <th style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>Window</th>
                        <th style={{ padding: "4px 6px" }}>Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.tabs.map((t) => {
                        const canSelect = isLive && (allowClosePinned || !t.pinned);
                        return (
                          <tr key={`${t.tabId}-${t.windowId}-${t.index}`} style={{ borderBottom: "1px solid var(--border)" }}>
                            {isLive && (
                              <td style={{ padding: "6px" }}>
                                <input
                                  type="checkbox"
                                  disabled={!canSelect}
                                  checked={selected.has(t.tabId)}
                                  onChange={() => toggleTab(t.tabId)}
                                  title={!canSelect ? "Enable “Allow closing pinned tabs” to select pinned rows." : undefined}
                                />
                              </td>
                            )}
                            <td style={{ padding: "6px", verticalAlign: "top", maxWidth: 280 }}>
                              {t.title || "(no title)"}
                              {t.active && <span className="badge ok" style={{ marginLeft: 6, fontSize: 10 }}>active</span>}
                            </td>
                            <td className="mono" style={{ padding: "6px", verticalAlign: "top", wordBreak: "break-all", fontSize: 11 }}>
                              {t.url || "—"}
                            </td>
                            <td style={{ padding: "6px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                              {t.windowId}
                              {t.windowFocused ? " · focused" : ""}
                            </td>
                            <td style={{ padding: "6px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                              {t.pinned && <span className="badge warn" style={{ fontSize: 10 }}>pinned</span>}
                              {t.audible && <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>audio</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
