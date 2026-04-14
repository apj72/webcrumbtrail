import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  OLLAMA_ORIGINS_DOC_URL,
  OLLAMA_ORIGINS_FOR_EXTENSIONS,
  OLLAMA_ORIGINS_PERMISSIVE,
} from "../lib/ollama-origins-hint";
import type { DomainRule, SettingsRecord } from "../shared/types";
import "../ui/styles.css";

function App() {
  const [s, setS] = useState<SettingsRecord | null>(null);
  const [saved, setSaved] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then((r: SettingsRecord) => setS(r));
  }, []);

  const save = async () => {
    if (!s) return;
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: s });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testConnection = async () => {
    if (!s) return;
    setTestBusy(true);
    setTestMsg(null);
    setTestOk(null);
    try {
      await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: s });
      const r = await chrome.runtime.sendMessage({ type: "TEST_LLM_CONNECTION" });
      if (r?.ok) {
        setTestOk(true);
        setTestMsg(
          `Connected (${r.provider ?? "API"}). Model replied: ${r.preview ? JSON.stringify(r.preview) : "(empty)"}`,
        );
      } else {
        setTestOk(false);
        setTestMsg(r?.error ?? "Test failed.");
      }
    } catch (e) {
      setTestOk(false);
      setTestMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setTestBusy(false);
    }
  };

  const addRule = () => {
    if (!s) return;
    const rule: DomainRule = {
      id: crypto.randomUUID(),
      pattern: "",
      enabled: true,
    };
    setS({ ...s, domainRules: [...s.domainRules, rule] });
  };

  const updateRule = (id: string, patch: Partial<DomainRule>) => {
    if (!s) return;
    setS({
      ...s,
      domainRules: s.domainRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (id: string) => {
    if (!s) return;
    setS({ ...s, domainRules: s.domainRules.filter((r) => r.id !== id) });
  };

  if (!s) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginTop: 0, fontSize: 22 }}>WebCrumbTrail settings</h1>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Domain allowlist</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Exact hostnames (e.g. <code>docs.redhat.com</code>) or wildcard subdomains (<code>*.sharepoint.com</code>). Only matching pages are logged.
        </p>
        {s.domainRules.map((r) => (
          <div
            key={r.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 8,
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <input
              value={r.pattern}
              placeholder="domain or *.domain.com"
              onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={(e) => updateRule(r.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button type="button" className="secondary" onClick={() => removeRule(r.id)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={addRule}>
          Add domain
        </button>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Visit logging</h2>
        <label>
          Dedupe window (minutes)
          <input
            type="number"
            min={0}
            step={1}
            value={s.visitDedupeMinutes}
            onChange={(e) => setS({ ...s, visitDedupeMinutes: Number(e.target.value) })}
            style={{ width: "100%", maxWidth: 120 }}
          />
        </label>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>
          A new visit is counted when the URL changes, or after this many minutes on the same page.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={s.allowIncognitoLogging}
            onChange={(e) => setS({ ...s, allowIncognitoLogging: e.target.checked })}
          />
          Allow logging in private/incognito windows (enable extension in incognito in the browser too)
        </label>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Summarisation</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={s.summarizationEnabled}
            onChange={(e) => setS({ ...s, summarizationEnabled: e.target.checked })}
          />
          Enable summarisation features
        </label>
        <p style={{ color: "var(--muted)", fontSize: 12 }}>
          When off, no API summary requests are sent. Manual ChatGPT copy/paste in the popup is unchanged.
        </p>

        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 12 }}>
          <legend style={{ padding: "0 6px", fontSize: 14 }}>API summary provider</legend>
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 0 }}>
            Choose which backend receives <strong>Request API summary</strong>. All provider blocks are saved so you can switch anytime.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="radio"
              name="prov"
              checked={s.summarizationProvider === "openai"}
              onChange={() => setS({ ...s, summarizationProvider: "openai", summarizationEnabled: true })}
            />
            OpenAI (cloud API)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <input
              type="radio"
              name="prov"
              checked={s.summarizationProvider === "gemini"}
              onChange={() => setS({ ...s, summarizationProvider: "gemini", summarizationEnabled: true })}
            />
            Google Gemini (Google AI / AI Studio)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="radio"
              name="prov"
              checked={s.summarizationProvider === "ollama"}
              onChange={() => setS({ ...s, summarizationProvider: "ollama", summarizationEnabled: true })}
            />
            Ollama (local — <code>127.0.0.1</code>)
          </label>
        </fieldset>

        {s.summarizationProvider === "openai" && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>OpenAI / OpenAI-compatible (cloud)</h3>
            <label>OpenAI-compatible base URL</label>
            <input
              style={{ width: "100%" }}
              value={s.openaiCompatible.baseUrl}
              onChange={(e) =>
                setS({
                  ...s,
                  openaiCompatible: { ...s.openaiCompatible, baseUrl: e.target.value },
                })
              }
            />
            <label style={{ marginTop: 12 }}>Model</label>
            <input
              style={{ width: "100%" }}
              value={s.openaiCompatible.model}
              onChange={(e) =>
                setS({
                  ...s,
                  openaiCompatible: { ...s.openaiCompatible, model: e.target.value },
                })
              }
            />
            <label style={{ marginTop: 12 }}>API key (stored locally)</label>
            <input
              style={{ width: "100%" }}
              type="password"
              autoComplete="off"
              value={s.openaiCompatible.apiKey}
              onChange={(e) =>
                setS({
                  ...s,
                  openaiCompatible: { ...s.openaiCompatible, apiKey: e.target.value },
                })
              }
            />
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
              Page text is sent to this endpoint when you request an API summary. Use your OpenAI key for api.openai.com or another compatible host.
            </p>
          </div>
        )}

        {s.summarizationProvider === "gemini" && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Google Gemini</h3>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Create an API key in{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>
              . Page text is sent to Google's generateContent API when you request a summary.
            </p>
            <label style={{ marginTop: 12 }}>Model id</label>
            <input
              style={{ width: "100%" }}
              placeholder="gemini-2.0-flash"
              value={s.gemini.model}
              onChange={(e) =>
                setS({
                  ...s,
                  gemini: { ...s.gemini, model: e.target.value },
                })
              }
            />
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Use the model name from the docs (e.g. <code>gemini-2.0-flash</code>, <code>gemini-1.5-pro</code>). Do not include the{" "}
              <code>models/</code> prefix.
            </p>
            <label style={{ marginTop: 12 }}>API key (stored locally)</label>
            <input
              style={{ width: "100%" }}
              type="password"
              autoComplete="off"
              value={s.gemini.apiKey}
              onChange={(e) =>
                setS({
                  ...s,
                  gemini: { ...s.gemini, apiKey: e.target.value },
                })
              }
            />
          </div>
        )}

        {s.summarizationProvider === "ollama" && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Ollama (local)</h3>
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              Install from{" "}
              <a href="https://ollama.com" target="_blank" rel="noreferrer">
                ollama.com
              </a>
              , run the app, then <code>ollama pull &lt;model&gt;</code>. No API key is used.
            </p>
            <button
              type="button"
              className="secondary"
              style={{ marginBottom: 12 }}
              onClick={() =>
                setS({
                  ...s,
                  summarizationProvider: "ollama",
                  summarizationEnabled: true,
                  ollamaLocal: {
                    baseUrl: "http://127.0.0.1:11434/v1",
                    model: "llama3.2",
                  },
                })
              }
            >
              Reset Ollama fields to defaults
            </button>
            <label>Ollama OpenAI-compatible base URL</label>
            <input
              style={{ width: "100%" }}
              value={s.ollamaLocal.baseUrl}
              onChange={(e) =>
                setS({
                  ...s,
                  ollamaLocal: { ...s.ollamaLocal, baseUrl: e.target.value },
                })
              }
            />
            <label style={{ marginTop: 12 }}>Model name</label>
            <input
              style={{ width: "100%" }}
              value={s.ollamaLocal.model}
              onChange={(e) =>
                setS({
                  ...s,
                  ollamaLocal: { ...s.ollamaLocal, model: e.target.value },
                })
              }
            />
            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
              Must match <code>ollama list</code> (e.g. <code>llama3.2</code> or <code>llama3.2:latest</code>).
            </p>
            <p style={{ color: "var(--ok)", fontSize: 12 }}>
              Traffic stays on your machine; nothing is sent to OpenAI when this provider is selected.
            </p>
            <p style={{ color: "var(--muted)", fontSize: 12, borderLeft: "3px solid var(--border)", paddingLeft: 10 }}>
              <strong>403 from Ollama?</strong> For the default URL (<code>127.0.0.1:11434</code> or <code>localhost:11434</code>), WebCrumbTrail sets{" "}
              <code>Origin</code> to an address Ollama already allows. Reload the extension after <code>npm run build</code>. If your port is not{" "}
              <code>11434</code>, set <code>OLLAMA_ORIGINS</code> on Ollama (see below).
            </p>
            <p style={{ color: "var(--muted)", fontSize: 12, borderLeft: "3px solid var(--border)", paddingLeft: 10, marginTop: 8 }}>
              <strong>Most reliable (bypasses the macOS app + launchctl):</strong> quit the Ollama menu bar app completely, then in Terminal run:{" "}
              <code style={{ wordBreak: "break-all" }}>
                OLLAMA_ORIGINS=&apos;{OLLAMA_ORIGINS_PERMISSIVE}&apos; ollama serve
              </code>{" "}
              and leave that process running. Test from another terminal with{" "}
              <strong>Test API connection</strong> below.
            </p>
            <p style={{ color: "var(--muted)", fontSize: 12, borderLeft: "3px solid var(--border)", paddingLeft: 10, marginTop: 8 }}>
              <strong>This extension’s Origin</strong> (if wildcards fail on your Ollama version, add it verbatim to <code>OLLAMA_ORIGINS</code>, comma-separated):{" "}
              <code style={{ wordBreak: "break-all", display: "block", marginTop: 6 }}>
                chrome-extension://{chrome.runtime?.id ?? "…"}
              </code>
            </p>
            <p style={{ color: "var(--muted)", fontSize: 12, borderLeft: "3px solid var(--border)", paddingLeft: 10, marginTop: 8 }}>
              <strong>Menu bar app instead:</strong> quit Ollama,{" "}
              <code style={{ wordBreak: "break-all" }}>launchctl setenv OLLAMA_ORIGINS &apos;{OLLAMA_ORIGINS_PERMISSIVE}&apos;</code>, reopen Ollama, verify{" "}
              <code>launchctl getenv OLLAMA_ORIGINS</code>. Then narrow to{" "}
              <code style={{ wordBreak: "break-all" }}>{OLLAMA_ORIGINS_FOR_EXTENSIONS}</code> or the exact origin above.{" "}
              <a href={OLLAMA_ORIGINS_DOC_URL} target="_blank" rel="noreferrer">
                Ollama FAQ
              </a>
              .
            </p>
          </div>
        )}

        <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 16 }}>
          Requesting an API summary sends visible page text from your browser to the active provider above. No automatic uploads occur.
        </p>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <button type="button" className="secondary" disabled={testBusy} onClick={() => void testConnection()}>
            {testBusy ? "Testing…" : "Test API connection"}
          </button>
          <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8, marginBottom: 4 }}>
            Saves settings first, then sends a tiny test message to the <strong>selected</strong> provider (OpenAI, Gemini, or Ollama).
          </p>
          {testMsg && (
            <p
              style={{
                fontSize: 12,
                color: testOk === false ? "var(--danger)" : "var(--ok)",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {testMsg}
            </p>
          )}
        </div>
      </section>

      <button type="button" onClick={() => void save()}>
        Save settings
      </button>
      {saved && (
        <span style={{ marginLeft: 12, color: "var(--ok)", fontSize: 14 }}>Saved.</span>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
