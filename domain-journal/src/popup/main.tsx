import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../ui/styles.css";

type Status = {
  allowed: boolean;
  canonical_url: string;
  page: {
    id: string;
    visit_count: number;
    first_seen_at: number;
    last_seen_at: number;
    summary_status: string;
    title: string;
  } | null;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return;
    setTabId(tab.id);
    const s = await chrome.runtime.sendMessage({
      type: "GET_PAGE_STATUS",
      url: tab.url,
    });
    setStatus(s);
  };

  useEffect(() => {
    void load();
  }, []);

  const openReport = () => {
    const url = chrome.runtime.getURL("report.html");
    void chrome.tabs.create({ url });
  };

  const openSettings = () => {
    void chrome.runtime.openOptionsPage();
  };

  const requestSummary = async (refresh: boolean) => {
    if (tabId == null) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await chrome.runtime.sendMessage({
        type: "REQUEST_SUMMARY",
        tabId,
        refresh,
      });
      if (r?.ok) setMsg("Summary saved.");
      else setMsg(r?.error ?? "Failed.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const w = 360;
  const bodyStyle: React.CSSProperties = {
    width: w,
    minHeight: 200,
    padding: 12,
  };

  if (!status) {
    return (
      <div style={bodyStyle}>
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  const p = status.page;

  return (
    <div style={bodyStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>Domain Journal</strong>
        <button type="button" className="secondary" style={{ padding: "0.25rem 0.5rem", fontSize: 12 }} onClick={openSettings}>
          Settings
        </button>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ marginBottom: 6 }}>
          <span className="badge">{status.allowed ? "Tracked domain" : "Not on allowlist"}</span>
        </div>
        <div className="mono" style={{ marginBottom: 8 }}>
          {status.canonical_url}
        </div>
        {status.allowed && p && (
          <>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{p.title}</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              Visits: {p.visit_count} · First: {formatTime(p.first_seen_at)}
              <br />
              Last: {formatTime(p.last_seen_at)}
              <br />
              Summary: {p.summary_status}
            </div>
          </>
        )}
        {status.allowed && !p && (
          <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>Not logged yet — navigate or reload once.</p>
        )}
      </div>

      {msg && (
        <p style={{ fontSize: 12, color: msg.startsWith("Failed") ? "var(--danger)" : "var(--ok)" }}>{msg}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" disabled={busy || !status.allowed || tabId == null} onClick={() => void requestSummary(false)}>
          Request summary
        </button>
        <button type="button" className="secondary" disabled={busy || !status.allowed || tabId == null} onClick={() => void requestSummary(true)}>
          Refresh summary
        </button>
        <button type="button" className="secondary" onClick={openReport}>
          Open report viewer
        </button>
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
        Summaries use visible page text and may be sent to your configured API.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
