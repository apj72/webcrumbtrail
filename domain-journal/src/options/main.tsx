import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { DomainRule, SettingsRecord } from "../shared/types";
import "../ui/styles.css";

function App() {
  const [s, setS] = useState<SettingsRecord | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).then((r: SettingsRecord) => setS(r));
  }, []);

  const save = async () => {
    if (!s) return;
    await chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", settings: s });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      <h1 style={{ marginTop: 0, fontSize: 22 }}>Domain Journal settings</h1>

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
          When off, no summary requests are sent and UI hides provider options where possible.
        </p>
        <label style={{ marginTop: 12 }}>OpenAI-compatible base URL</label>
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
        <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 8 }}>
          Requesting a summary sends visible page text from your browser to the API above. No automatic uploads occur.
        </p>
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
