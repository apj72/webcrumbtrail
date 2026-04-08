import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { parseChatGptJournalReply } from "../lib/chatgpt-journal";
import type { SettingsRecord, SummarizationProvider } from "../shared/types";
import "../ui/styles.css";

type PageLite = {
  id: string;
  visit_count: number;
  first_seen_at: number;
  last_seen_at: number;
  summary_status: string;
  title: string;
  summary_title?: string | null;
  latest_summary?: string | null;
  latest_summary_updated_at?: number | null;
};

type Status = {
  allowed: boolean;
  canonical_url: string;
  page: PageLite | null;
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [tabId, setTabId] = useState<number | null>(null);
  /** Current tab URL (for allowlist helper: only http(s) can be added). */
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [summaryTitle, setSummaryTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pastedReply, setPastedReply] = useState("");
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [apiProvider, setApiProvider] = useState<SummarizationProvider>("openai");

  const loadSettings = async () => {
    const st: SettingsRecord = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    setApiProvider(st.summarizationProvider ?? "openai");
  };

  const load = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return;
    setTabId(tab.id);
    setActiveTabUrl(tab.url);
    const s = await chrome.runtime.sendMessage({
      type: "GET_PAGE_STATUS",
      url: tab.url,
    });
    setStatus(s);
    const p = s.page as PageLite | null;
    if (p) {
      setSummaryTitle(p.summary_title ?? "");
      setDescription(p.latest_summary ?? "");
    }
  };

  useEffect(() => {
    void load();
    void loadSettings();
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
      const st: SettingsRecord = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      const prov = st.summarizationProvider ?? "openai";
      const r = await chrome.runtime.sendMessage({
        type: "REQUEST_SUMMARY",
        tabId,
        refresh,
      });
      if (r?.ok) setMsg(prov === "ollama" ? "Ollama summary saved." : "OpenAI / API summary saved.");
      else setMsg(r?.error ?? "Failed.");
      await load();
      setApiProvider(prov);
    } finally {
      setBusy(false);
    }
  };

  const copyChatGptPrompt = async () => {
    if (tabId == null) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await chrome.runtime.sendMessage({ type: "BUILD_CHATGPT_PROMPT", tabId });
      if (!r?.ok || !r.document) {
        setMsg(r?.error ?? "Could not build prompt.");
        return;
      }
      setLastPrompt(r.document);
      await navigator.clipboard.writeText(r.document);
      setMsg("Prompt copied. Paste it into your web chat (e.g. chatgpt.com), then paste the reply below.");
    } finally {
      setBusy(false);
    }
  };

  const fillFromPaste = () => {
    const parsed = parseChatGptJournalReply(pastedReply);
    if (parsed) {
      setSummaryTitle(parsed.summary_title);
      setDescription(parsed.description);
      setMsg("Parsed TITLE / DESCRIPTION from your paste.");
    } else {
      setMsg("Could not parse. Use TITLE: and DESCRIPTION: lines, or type the fields yourself.");
    }
  };

  const saveManualJournal = async () => {
    if (tabId == null) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await chrome.runtime.sendMessage({
        type: "SAVE_MANUAL_JOURNAL",
        tabId,
        summaryTitle,
        description,
      });
      if (r?.ok) {
        setMsg("Saved to WebCrumbTrail.");
        await load();
      } else setMsg(r?.error ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  };

  const w = 400;
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
  const visitsDisplay = p ? Math.max(1, p.visit_count) : 0;
  const hasSummaryContent =
    p && p.summary_status === "completed" && !!(p.latest_summary?.trim() || p.summary_title?.trim());
  const summarisedAt = p?.latest_summary_updated_at;

  const canAddDomain = tabId != null && !!activeTabUrl?.startsWith("http") && !status.allowed;

  let allowlistHostname = "";
  if (activeTabUrl) {
    try {
      allowlistHostname = new URL(activeTabUrl).hostname;
    } catch {
      /* ignore */
    }
  }

  const addDomainAndLog = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url?.startsWith("http")) {
        setMsg("Focus an http(s) tab (the page you want to allowlist), then try again.");
        return;
      }
      const r: {
        ok?: boolean;
        logged?: boolean;
        warning?: string;
        error?: string;
      } = await chrome.runtime.sendMessage({ type: "ADD_DOMAIN_AND_LOG", tabId: tab.id });
      if (r?.ok) {
        if (r.warning) setMsg(r.warning);
        else if (r.logged) setMsg("Domain added to allowlist and this page logged.");
        else setMsg("Domain added to allowlist.");
        await load();
      } else {
        setMsg(r?.error?.trim() ? r.error : "Could not add domain.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={bodyStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong>WebCrumbTrail</strong>
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
            {p.summary_title && (
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Journal title: {p.summary_title}</div>
            )}
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              Visits: {visitsDisplay} · First: {formatTime(p.first_seen_at)}
              <br />
              Last: {formatTime(p.last_seen_at)}
            </div>
          </>
        )}
        {status.allowed && !p && (
          <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>Not logged yet — navigate or reload once.</p>
        )}
        {!status.allowed && canAddDomain && (
          <div style={{ marginTop: 10 }}>
            <button type="button" disabled={busy} onClick={() => void addDomainAndLog()}>
              Add this domain to allowlist &amp; log page
            </button>
            <p style={{ color: "var(--muted)", fontSize: 11, margin: "8px 0 0" }}>
              Adds <span className="mono">{allowlistHostname}</span> to your allowlist and records this visit now.
            </p>
          </div>
        )}
        {!status.allowed && activeTabUrl && !activeTabUrl.startsWith("http") && (
          <p style={{ color: "var(--muted)", fontSize: 12, margin: "8px 0 0" }}>
            Open a normal web page (http/https) to add it to the allowlist.
          </p>
        )}
      </div>

      {status.allowed && p && (
        <div
          style={{
            marginBottom: 10,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: hasSummaryContent ? "rgba(34, 197, 94, 0.08)" : "var(--surface)",
            borderLeft: hasSummaryContent ? "4px solid var(--ok)" : undefined,
          }}
        >
          {hasSummaryContent && summarisedAt ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ok)", marginBottom: 4 }}>Summarised</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Last updated: {formatTime(summarisedAt)}</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Not summarised yet</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Status: {p.summary_status}</div>
            </>
          )}
        </div>
      )}

      {msg && (
        <p style={{ fontSize: 12, color: msg.includes("Failed") || msg.includes("Could not") ? "var(--danger)" : "var(--ok)" }}>{msg}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
          {apiProvider === "ollama"
            ? "Ollama (local) — configured in Settings"
            : "OpenAI / cloud API — configured in Settings"}
        </p>
        <button type="button" disabled={busy || !status.allowed || tabId == null} onClick={() => void requestSummary(false)}>
          {apiProvider === "ollama" ? "Request Ollama summary" : "Request API summary"}
        </button>
        <button type="button" className="secondary" disabled={busy || !status.allowed || tabId == null} onClick={() => void requestSummary(true)}>
          {apiProvider === "ollama" ? "Refresh Ollama summary" : "Refresh API summary"}
        </button>
        <button type="button" className="secondary" onClick={openReport}>
          Open report viewer
        </button>

        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0 8px" }} />
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 4px" }}>
          <strong>Manual journal (web chat)</strong> — no API. Copies visible page text for a browser chat (e.g. chatgpt.com).
        </p>
        <button type="button" className="secondary" disabled={busy || !status.allowed || tabId == null} onClick={() => void copyChatGptPrompt()}>
          Copy prompt for web chat
        </button>
        {lastPrompt && (
          <details style={{ fontSize: 11, color: "var(--muted)" }}>
            <summary>Show last prompt</summary>
            <pre style={{ whiteSpace: "pre-wrap", maxHeight: 120, overflow: "auto", margin: "6px 0 0" }}>{lastPrompt.slice(0, 2000)}</pre>
          </details>
        )}
        <label style={{ marginTop: 4 }}>Paste web chat reply (optional)</label>
        <textarea
          value={pastedReply}
          onChange={(e) => setPastedReply(e.target.value)}
          rows={3}
          placeholder="Or type TITLE: / DESCRIPTION: here…"
          style={{ width: "100%", fontSize: 12 }}
        />
        <button type="button" className="secondary" disabled={busy} onClick={fillFromPaste}>
          Fill fields from pasted reply
        </button>
        <label>Journal title</label>
        <input value={summaryTitle} onChange={(e) => setSummaryTitle(e.target.value)} placeholder="Short title" style={{ width: "100%" }} />
        <label>What the page covers (1–2 sentences)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Description" style={{ width: "100%", fontSize: 12 }} />
        <button type="button" disabled={busy || !status.allowed || tabId == null} onClick={() => void saveManualJournal()}>
          Save manual journal entry
        </button>
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, marginBottom: 0 }}>
        Manual flow stays in your browser chat only. API summary sends page text to {apiProvider === "ollama" ? "your local Ollama" : "your configured API"}.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
