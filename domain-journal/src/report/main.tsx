import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PageRecord, SummaryStatus, VisitEvent } from "../shared/types";
import { getDB, listVisitsForPage } from "../lib/storage/idb";
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

function App() {
  const [pages, setPages] = useState<PageRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [summaryFilter, setSummaryFilter] = useState<SummaryStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_seen_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visits, setVisits] = useState<VisitEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll("pages");
    setPages(all);
  }, []);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const selected = useMemo(() => pages.find((p) => p.id === selectedId) ?? null, [pages, selectedId]);

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
      if (q && !p.title.toLowerCase().includes(q) && !p.canonical_url.toLowerCase().includes(q)) return false;
      if (df && p.domain !== df) return false;
      if (summaryFilter && p.summary_status !== summaryFilter) return false;
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
  }, [pages, search, domainFilter, summaryFilter, dateFrom, dateTo, sortKey, sortDir]);

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
    a.download = `domain-journal-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    const csv = pagesToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `domain-journal-pages-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openOriginal = (url: string) => {
    void chrome.tabs.create({ url });
  };

  const requestSummary = async (refresh: boolean) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setMsg("No active tab.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await chrome.runtime.sendMessage({
        type: "REQUEST_SUMMARY",
        tabId: tab.id,
        refresh,
      });
      setMsg(r?.ok ? "Summary saved." : r?.error ?? "Failed");
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
    <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", minHeight: "100vh" }}>
      <div style={{ padding: 16, borderRight: selected ? "1px solid var(--border)" : undefined }}>
        <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Domain Journal</h1>
          <button type="button" className="secondary" onClick={() => void chrome.runtime.openOptionsPage()}>
            Settings
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or URL" style={{ width: "100%" }} />
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
          <label>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: "100%" }} />
          </label>
          <label>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: "100%" }} />
          </label>
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
                <th style={{ padding: "6px 8px" }}>Title</th>
                <th style={{ padding: "6px 8px" }}>Domain</th>
                <th style={{ padding: "6px 8px" }}>Visits</th>
                <th style={{ padding: "6px 8px" }}>Last seen</th>
                <th style={{ padding: "6px 8px" }}>Summary</th>
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
                  <td style={{ padding: "8px", maxWidth: 280 }}>{p.title || "(no title)"}</td>
                  <td style={{ padding: "8px" }}>{p.domain}</td>
                  <td style={{ padding: "8px" }}>{p.visit_count}</td>
                  <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{formatTime(p.last_seen_at)}</td>
                  <td style={{ padding: "8px" }}>
                    <span className={`badge ${statusClass(p.summary_status)}`}>{p.summary_status}</span>
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
          <button type="button" className="secondary" style={{ marginBottom: 12 }} onClick={() => setSelectedId(null)}>
            Close detail
          </button>
          <h2 style={{ marginTop: 0, fontSize: 16 }}>{selected.title}</h2>
          <p className="mono" style={{ fontSize: 11 }}>
            {selected.canonical_url}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            First: {formatTime(selected.first_seen_at)} · Last: {formatTime(selected.last_seen_at)} · Visits:{" "}
            {selected.visit_count}
          </p>
          <p>
            <span className={`badge ${statusClass(selected.summary_status)}`}>{selected.summary_status}</span>
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            <button type="button" onClick={() => openOriginal(selected.canonical_url)}>
              Open in new tab
            </button>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
              Open the page in a tab, then use the buttons below to summarise the active tab (must be that page).
            </p>
            <button type="button" disabled={busy} onClick={() => void requestSummary(false)}>
              Request summary (active tab)
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void requestSummary(true)}>
              Refresh summary (active tab)
            </button>
          </div>
          {msg && <p style={{ fontSize: 12, color: "var(--ok)" }}>{msg}</p>}

          {selected.latest_summary && (
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Latest summary</h3>
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
              {selected.latest_summary_updated_at && (
                <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 0 }}>
                  Updated {formatTime(selected.latest_summary_updated_at)}
                </p>
              )}
            </div>
          )}

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
