import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PageRecord, SettingsRecord, SummaryStatus, SummarizationProvider, VisitEvent } from "../shared/types";
import { getActiveTabInLastFocusedNormalWindow } from "../lib/active-tab";
import { deletePageById, getDB, listVisitsForPage, mergeRollupDuplicatePages } from "../lib/storage/idb";
import { parseChatGptJournalReply } from "../lib/chatgpt-journal";
import { pagesToCsv, importBundle } from "../lib/storage/export-import";
import "../ui/styles.css";

type SortKey = "last_seen_at" | "first_seen_at" | "visit_count" | "domain";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function statusClass(s: SummaryStatus): string {
  if (s === "completed") return "ok";
  if (s === "failed") return "err";
  if (s === "queued") return "warn";
  return "";
}

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

/** `YYYY-MM-DD` in local time (not UTC) for `<input type="date">`. */
function localDateInputValue(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function DateFilterField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultToTodayIfEmpty = () => {
    if (!value) onChange(localDateInputValue());
  };

  const openCalendar = () => {
    defaultToTodayIfEmpty();
    window.setTimeout(() => {
      const el = inputRef.current;
      if (el && typeof el.showPicker === "function") {
        void el.showPicker();
      } else {
        el?.focus();
      }
    }, 0);
  };

  return (
    <label style={{ margin: 0 }}>
      {label}
      <div style={{ display: "flex", gap: 6, alignItems: "stretch", marginTop: 4 }}>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={defaultToTodayIfEmpty}
          onFocus={defaultToTodayIfEmpty}
          style={{ flex: 1, minWidth: 0, width: "100%" }}
        />
        <button
          type="button"
          className="secondary"
          onClick={openCalendar}
          title="Open calendar"
          aria-label={`Open calendar for ${label}`}
          style={{ padding: "0.35rem 0.5rem", flexShrink: 0, lineHeight: 1 }}
        >
          📅
        </button>
      </div>
    </label>
  );
}

function SummaryCell({ p }: { p: PageRecord }) {
  const hasBody = !!(p.latest_summary?.trim() || p.summary_title?.trim());
  const done = p.summary_status === "completed" && hasBody;
  if (done) {
    return (
      <div style={{ maxWidth: 320 }}>
        {p.summary_title && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.summary_title}</div>}
        {p.latest_summary && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{truncateText(p.latest_summary, 220)}</div>
        )}
        {p.latest_summary_updated_at != null && (
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>Updated {formatTime(p.latest_summary_updated_at)}</div>
        )}
      </div>
    );
  }
  return (
    <span className={`badge ${statusClass(p.summary_status)}`} style={{ whiteSpace: "nowrap" }}>
      {p.summary_status}
    </span>
  );
}

function App() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryStatus | "">("");
  const [readingListFilter, setReadingListFilter] = useState<"all" | "later" | "not_later">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visits, setVisits] = useState<VisitEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [pastedReply, setPastedReply] = useState("");
  const [apiProvider, setApiProvider] = useState<SummarizationProvider>("openai");
  /** End ms of last committed Chrome history incremental export (for display). */
  const [historyExportWatermark, setHistoryExportWatermark] = useState<number | null>(null);
  /** Must be turned on before Delete buttons work (default off). */
  const [deleteControlsEnabled, setDeleteControlsEnabled] = useState(false);
  /** Page IDs marked for bulk delete (only used while delete mode is on). */
  const [pendingDeleteIds, setPendingDeleteIds] = useState(() => new Set<string>());
  const selectAllHeaderRef = useRef<HTMLInputElement>(null);

  const loadPages = useCallback(async () => {
    const db = await getDB();
    await mergeRollupDuplicatePages(db);
    const all = await db.getAll("pages");
    setPages(all);
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (!deleteControlsEnabled) setPendingDeleteIds(new Set());
  }, [deleteControlsEnabled]);

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then((st: SettingsRecord) => {
      setApiProvider(st.summarizationProvider ?? "openai");
      setHistoryExportWatermark(st.lastBrowserHistoryExportEndMs ?? null);
    });
  }, []);

  const selected = useMemo(() => pages.find((p) => p.id === selectedId) ?? null, [pages, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setManualTitle(selected.summary_title ?? "");
    setManualDesc(selected.latest_summary ?? "");
    setPastedReply("");
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedId) {
      setVisits([]);
      return;
    }
    void (async () => {
      const db = await getDB();
      const v = await listVisitsForPage(db, selectedId);
      v.sort((a, b) => b.visited_at - a.visited_at);
      setVisits(v);
    })();
  }, [selectedId]);

  const domains = useMemo(() => {
    const d = new Set(pages.map((p) => p.domain));
    return [...d].sort();
  }, [pages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const df = domainFilter.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : null;

    let list = pages.filter((p) => {
      const st = (p.summary_title ?? "").toLowerCase();
      const sm = (p.latest_summary ?? "").toLowerCase();
      if (q && !p.title.toLowerCase().includes(q) && !p.canonical_url.toLowerCase().includes(q) && !st.includes(q) && !sm.includes(q))
        return false;
      if (df && p.domain !== df) return false;
      if (summaryFilter && p.summary_status !== summaryFilter) return false;
      if (readingListFilter === "later" && p.saved_for_later !== true) return false;
      if (readingListFilter === "not_later" && p.saved_for_later === true) return false;
      if (fromTs != null && p.last_seen_at < fromTs) return false;
      if (toTs != null && p.last_seen_at >= toTs) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const mul = sortDir === "asc" ? 1 : -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * mul;
      return ((av as number) - (bv as number)) * mul;
    });
    return list;
  }, [pages, search, domainFilter, summaryFilter, readingListFilter, dateFrom, dateTo, sortKey, sortDir]);

  const filteredIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const allFilteredMarked =
    filtered.length > 0 && filtered.every((p) => pendingDeleteIds.has(p.id));
  const someFilteredMarked = filtered.some((p) => pendingDeleteIds.has(p.id)) && !allFilteredMarked;

  useEffect(() => {
    const el = selectAllHeaderRef.current;
    if (el) el.indeterminate = someFilteredMarked;
  }, [someFilteredMarked, allFilteredMarked, filtered.length]);

  const togglePendingDeleteId = (pageId: string) => {
    if (!deleteControlsEnabled) return;
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (!deleteControlsEnabled) return;
    setPendingDeleteIds((prev) => {
      if (allFilteredMarked) {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...filteredIds]);
    });
  };

  const clearPendingDelete = () => {
    setPendingDeleteIds(new Set());
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result)) as import("../lib/storage/export-import").ExportBundle;
        void importBundle(bundle, "replace").then(() => {
          void loadPages();
          setMsg("Import complete.");
        });
      } catch {
        setMsg("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  };

  const exportJson = async () => {
    const r = await chrome.runtime.sendMessage({ type: "EXPORT_JSON" });
    if (!r?.ok || !r.bundle) return;
    const blob = new Blob([JSON.stringify(r.bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `webcrumbtrail-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    const csv = pagesToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `webcrumbtrail-pages-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportChromeHistoryIncremental = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r: {
        ok?: boolean;
        json?: string;
        commitEndMs?: number;
        itemCount?: number;
        startMs?: number;
        error?: string;
      } = await chrome.runtime.sendMessage({ type: "PREPARE_BROWSER_HISTORY_EXPORT" });
      if (!r?.ok || r.json == null || r.commitEndMs == null || r.startMs == null) {
        setMsg(r?.error ?? "Chrome history export failed.");
        return;
      }
      const blob = new Blob([r.json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const d = new Date(r.commitEndMs);
      const pad = (n: number) => String(n).padStart(2, "0");
      const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}`;
      a.download = `webcrumbtrail-chrome-history-${ts}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      const commit: { ok?: boolean; error?: string } = await chrome.runtime.sendMessage({
        type: "COMMIT_BROWSER_HISTORY_EXPORT",
        endMs: r.commitEndMs,
      });
      if (!commit?.ok) {
        setMsg(
          `Downloaded ${r.itemCount ?? 0} URL(s), but watermark was not saved: ${commit?.error ?? "unknown error"}.`,
        );
        return;
      }
      setHistoryExportWatermark(r.commitEndMs);
      setMsg(
        `Chrome history: ${r.itemCount ?? 0} URL(s) from ${formatTime(r.startMs)} to ${formatTime(r.commitEndMs)}. Watermark saved.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const openOriginal = (url: string) => {
    void chrome.tabs.create({ url });
  };

  /** Prefer last-seen URL, fall back to canonical (normalized). */
  const openStoredPageInNewWindow = (p: PageRecord) => {
    const u = (p.original_url || p.canonical_url).trim();
    if (!/^https?:\/\//i.test(u)) return;
    void chrome.windows.create({ url: u });
  };

  const removePage = async (pageId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!deleteControlsEnabled) return;
    if (
      !confirm(
        `Delete “${title.slice(0, 80)}${title.length > 80 ? "…" : ""}” and its visit history? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const db = await getDB();
      await deletePageById(db, pageId);
      if (selectedId === pageId) setSelectedId(null);
      await loadPages();
      setMsg("Page deleted.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const removeSelectedPages = async () => {
    if (!deleteControlsEnabled || pendingDeleteIds.size === 0) return;
    const ids = [...pendingDeleteIds];
    const titles = ids.map((id) => pages.find((p) => p.id === id)?.title || "(no title)");
    const preview = titles
      .slice(0, 8)
      .map((t) => `• ${t.slice(0, 60)}${t.length > 60 ? "…" : ""}`)
      .join("\n");
    const more = ids.length > 8 ? `\n… and ${ids.length - 8} more` : "";
    if (
      !confirm(
        `Delete ${ids.length} page(s) and their visit histories? This cannot be undone.\n\n${preview}${more}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const db = await getDB();
      for (const pageId of ids) {
        await deletePageById(db, pageId);
      }
      if (selectedId && ids.includes(selectedId)) setSelectedId(null);
      setPendingDeleteIds(new Set());
      await loadPages();
      setMsg(ids.length === 1 ? "Page deleted." : `${ids.length} pages deleted.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestSummary = async (refresh: boolean) => {
    const tab = await getActiveTabInLastFocusedNormalWindow();
    if (!tab?.id) {
      setMsg("No active tab.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const st: SettingsRecord = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      const prov = st.summarizationProvider ?? "openai";
      setApiProvider(prov);
      const r = await chrome.runtime.sendMessage({
        type: "REQUEST_SUMMARY",
        tabId: tab.id,
        refresh,
      });
      setMsg(
        r?.ok
          ? prov === "ollama"
            ? "Ollama summary saved."
            : prov === "gemini"
              ? "Gemini summary saved."
              : "API summary saved."
          : r?.error ?? "Failed",
      );
      await loadPages();
      if (selectedId) {
        const db = await getDB();
        const v = await listVisitsForPage(db, selectedId);
        v.sort((a, b) => b.visited_at - a.visited_at);
        setVisits(v);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr minmax(380px, 460px)" : "1fr", minHeight: "100vh" }}>
      <div style={{ padding: 16, borderRight: selected ? "1px solid var(--border)" : undefined }}>
        <header style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginBottom: 10,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: deleteControlsEnabled ? "rgba(239, 68, 68, 0.06)" : "var(--surface)",
            }}
          >
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                margin: 0,
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={deleteControlsEnabled}
                onChange={(e) => setDeleteControlsEnabled(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              Enable delete
            </label>
            <span style={{ fontSize: 12, color: "var(--muted)", maxWidth: 360 }}>
              {deleteControlsEnabled
                ? "Tick rows to mark them, then use Delete selected. Or delete one row at a time. Turn off when finished."
                : "Row and detail delete controls stay disabled until you turn this on."}
            </span>
            {deleteControlsEnabled && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || filtered.length === 0}
                  style={{ fontSize: 12, padding: "0.35rem 0.65rem" }}
                  onClick={() => toggleSelectAllFiltered()}
                >
                  {allFilteredMarked ? "Unselect table" : "Select all in table"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || pendingDeleteIds.size === 0}
                  style={{ fontSize: 12, padding: "0.35rem 0.65rem" }}
                  onClick={clearPendingDelete}
                >
                  Clear marks
                </button>
                <button
                  type="button"
                  disabled={busy || pendingDeleteIds.size === 0}
                  style={{
                    fontSize: 12,
                    padding: "0.35rem 0.75rem",
                    color: "var(--danger)",
                    borderColor: "var(--danger)",
                    background: "rgba(239, 68, 68, 0.08)",
                  }}
                  onClick={() => void removeSelectedPages()}
                >
                  Delete selected{pendingDeleteIds.size > 0 ? ` (${pendingDeleteIds.size})` : ""}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>WebCrumbTrail</h1>
          <button type="button" className="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL("session.html") })}
          >
            Session overview
          </button>
          <button type="button" className="secondary" onClick={() => void exportJson()}>
            Export JSON
          </button>
          <label className="secondary" style={{ display: "inline-block", padding: "0.45rem 0.85rem", cursor: "pointer" }}>
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </label>
          <button type="button" className="secondary" onClick={exportCsv}>
            Export CSV (filtered)
          </button>
          </div>
          <div
            className="card"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Chrome history backup (incremental)</div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
              Exports the browser’s native history as JSON (all sites). The first export includes from{" "}
              <span className="mono">1 May 2025</span> (local midnight) through now; the next export only adds entries after
              the last successful export. Files are for your own backup (e.g. frequency / load-out tools); WebCrumbTrail does not
              import them.
            </p>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
              Last export end:{" "}
              <strong>{historyExportWatermark != null ? formatTime(historyExportWatermark) : "— (none yet)"}</strong>
            </p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void exportChromeHistoryIncremental()}>
              Download incremental Chrome history (JSON)
            </button>
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <label>
            Search
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, URL, or journal text"
              style={{ width: "100%" }}
            />
          </label>
          <label>
            Domain
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} style={{ width: "100%" }}>
              <option value="">All</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reading list
            <select
              value={readingListFilter}
              onChange={(e) => setReadingListFilter(e.target.value as "all" | "later" | "not_later")}
              style={{ width: "100%" }}
              title='Use “Later only” for your save-for-later / reading list URLs'
            >
              <option value="all">All rows</option>
              <option value="later">Later only (saved without allowlist)</option>
              <option value="not_later">Exclude reading list saves</option>
            </select>
          </label>
          <label>
            Summary status
            <select
              value={summaryFilter}
              onChange={(e) => setSummaryFilter((e.target.value || "") as SummaryStatus | "")}
              style={{ width: "100%" }}
            >
              <option value="">All</option>
              <option value="not_requested">Not requested</option>
              <option value="queued">Queued</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
          </label>
          <DateFilterField label="From" value={dateFrom} onChange={setDateFrom} />
          <DateFilterField label="To" value={dateTo} onChange={setDateTo} />
          <label>
            Sort by
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={{ width: "100%" }}>
              <option value="last_seen_at">Last seen</option>
              <option value="first_seen_at">First seen</option>
              <option value="visit_count">Visit count</option>
              <option value="domain">Domain</option>
            </select>
          </label>
          <label>
            Direction
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as "asc" | "desc")} style={{ width: "100%" }}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>

        <div style={{ overflow: "auto", maxHeight: "calc(100vh - 200px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                {deleteControlsEnabled && (
                  <th style={{ padding: "6px 4px", width: 36, textAlign: "center" }}>
                    <input
                      ref={selectAllHeaderRef}
                      type="checkbox"
                      title="Select or unselect all rows in the current table"
                      checked={allFilteredMarked}
                      onChange={() => toggleSelectAllFiltered()}
                      disabled={busy || filtered.length === 0}
                      style={{ width: 16, height: 16, cursor: busy ? "default" : "pointer" }}
                    />
                  </th>
                )}
                <th style={{ padding: "6px 8px", width: 72 }}>Later</th>
                <th style={{ padding: "6px 8px" }}>Title</th>
                <th style={{ padding: "6px 8px", minWidth: 200 }}>Summary</th>
                <th style={{ padding: "6px 8px" }}>Domain</th>
                <th style={{ padding: "6px 8px" }}>Visits</th>
                <th style={{ padding: "6px 8px" }}>Last seen</th>
                <th style={{ padding: "6px 8px", width: 88 }}>Delete</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                               <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    cursor: "pointer",
                    background: p.id === selectedId ? "rgba(59,130,246,0.12)" : undefined,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {deleteControlsEnabled && (
                    <td style={{ padding: "8px 4px", textAlign: "center", verticalAlign: "top" }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={pendingDeleteIds.has(p.id)}
                        onChange={() => togglePendingDeleteId(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={busy}
                        style={{ width: 16, height: 16, cursor: busy ? "default" : "pointer" }}
                      />
                    </td>
                  )}
                  <td style={{ padding: "8px", textAlign: "center", verticalAlign: "top" }}>
                    {p.saved_for_later === true ? "★" : ""}
                  </td>
                  <td style={{ padding: "8px", maxWidth: 220, verticalAlign: "top" }}>{p.title || "(no title)"}</td>
                  <td style={{ padding: "8px", verticalAlign: "top" }}>
                    <SummaryCell p={p} />
                  </td>
                  <td style={{ padding: "8px", verticalAlign: "top" }}>{p.domain}</td>
                  <td style={{ padding: "8px", verticalAlign: "top" }}>{Math.max(1, p.visit_count)}</td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap", verticalAlign: "top" }}>{formatTime(p.last_seen_at)}</td>
                  <td style={{ padding: "8px", verticalAlign: "top" }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy || !deleteControlsEnabled}
                      style={{ padding: "0.25rem 0.5rem", fontSize: 12 }}
                      onClick={(e) => void removePage(p.id, p.title || "(no title)", e)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p style={{ color: "var(--muted)" }}>No pages match filters.</p>}
        </div>
      </div>

      {selected && (
        <aside style={{ padding: 16, overflow: "auto", maxHeight: "100vh" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
              Close detail
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !deleteControlsEnabled}
              style={{ color: "var(--danger)", borderColor: "var(--danger)" }}
              onClick={(e) => void removePage(selected.id, selected.title || "(no title)", e)}
            >
              Delete this page
            </button>
          </div>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>{selected.title}</h2>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "flex-start",
              marginBottom: 8,
            }}
          >
            <p className="mono" style={{ fontSize: 11, margin: 0, flex: "1 1 220px", wordBreak: "break-word" }}>
              {selected.canonical_url}
            </p>
            <button
              type="button"
              className="secondary"
              style={{ flexShrink: 0 }}
              onClick={() => openStoredPageInNewWindow(selected)}
              disabled={!/^https?:\/\//i.test((selected.original_url || selected.canonical_url).trim())}
            >
              Open in new window
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            First: {formatTime(selected.first_seen_at)} · Last: {formatTime(selected.last_seen_at)} · Visits:{" "}
            {Math.max(1, selected.visit_count)}
          </p>
          {selected.saved_for_later === true && (
            <p style={{ fontSize: 12, marginBottom: 10 }}>
              <span className="badge">Reading list</span>
              <span style={{ color: "var(--muted)", marginLeft: 8 }}>Saved with “Save page to reading list” (no allowlist).</span>
            </p>
          )}
          <p>
            <span className={`badge ${statusClass(selected.summary_status)}`}>{selected.summary_status}</span>
          </p>

          {(selected.summary_title || selected.latest_summary) && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Summary</h3>
              {selected.summary_title && (
                <p style={{ fontWeight: 600, margin: "0 0 8px" }}>{selected.summary_title}</p>
              )}
              {selected.latest_summary && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: 13,
                    margin: 0,
                  }}
                >
                  {selected.latest_summary}
                </pre>
              )}
              {selected.latest_summary_updated_at && (
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 0 }}>
                  Updated {formatTime(selected.latest_summary_updated_at)}
                </p>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
              <strong>API summary</strong> (optional): switch to a tab showing this URL, then:
            </p>
            <button type="button" disabled={busy} onClick={() => void requestSummary(false)}>
              {apiProvider === "ollama"
                ? "Request Ollama summary (active tab)"
                : apiProvider === "gemini"
                  ? "Request Gemini summary (active tab)"
                  : "Request API summary (active tab)"}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void requestSummary(true)}>
              {apiProvider === "ollama"
                ? "Refresh Ollama summary (active tab)"
                : apiProvider === "gemini"
                  ? "Refresh Gemini summary (active tab)"
                  : "Refresh API summary (active tab)"}
            </button>
          </div>
          {msg && <p style={{ fontSize: 12, color: msg.includes("Failed") || msg.includes("Could not") ? "var(--danger)" : "var(--ok)" }}>{msg}</p>}

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginTop: 0, fontSize: 14 }}>Manual journal (web chat)</h3>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 0 }}>
              Open this page in a tab, click the WebCrumbTrail icon, use <strong>Copy prompt for web chat</strong>, then paste the reply here.
            </p>
            <button type="button" className="secondary" style={{ marginBottom: 8 }} onClick={() => openOriginal(selected.canonical_url)}>
              Open this URL in a new tab
            </button>
            <label style={{ marginTop: 8 }}>Paste web chat reply</label>
            <textarea
              value={pastedReply}
              onChange={(e) => setPastedReply(e.target.value)}
              rows={3}
              style={{ width: "100%", fontSize: 12 }}
            />
            <button
              type="button"
              className="secondary"
              style={{ marginTop: 6 }}
              onClick={() => {
                const parsed = parseChatGptJournalReply(pastedReply);
                if (parsed) {
                  setManualTitle(parsed.summary_title);
                  setManualDesc(parsed.description);
                  setMsg("Parsed TITLE / DESCRIPTION.");
                } else setMsg("Could not parse TITLE: / DESCRIPTION: lines.");
              }}
            >
              Fill from pasted reply
            </button>
            <label style={{ marginTop: 8 }}>Journal title</label>
            <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} style={{ width: "100%" }} />
            <label>What the page covers</label>
            <textarea value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} rows={3} style={{ width: "100%", fontSize: 12 }} />
            <button
              type="button"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setMsg(null);
                  const r = await chrome.runtime.sendMessage({
                    type: "SAVE_MANUAL_JOURNAL",
                    pageId: selected.id,
                    summaryTitle: manualTitle,
                    description: manualDesc,
                  });
                  setMsg(r?.ok ? "Saved." : r?.error ?? "Failed");
                  await loadPages();
                  setBusy(false);
                })();
              }}
            >
              Save manual journal entry
            </button>
          </div>

          <h3 style={{ fontSize: 14 }}>Visit timeline</h3>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 12 }}>
            {visits.map((v) => (
              <li key={v.id} style={{ marginBottom: 6 }}>
                {formatTime(v.visited_at)} — {v.title_at_visit}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
