/** Domain allowlist entry: exact host or wildcard like `*.sharepoint.com`. */
export interface DomainRule {
  id: string;
  /** Host pattern: `docs.redhat.com` or `*.sharepoint.com` */
  pattern: string;
  enabled: boolean;
}

export type SummaryStatus = "not_requested" | "queued" | "completed" | "failed";

export interface PageRecord {
  id: string;
  canonical_url: string;
  original_url: string;
  domain: string;
  title: string;
  first_seen_at: number;
  last_seen_at: number;
  visit_count: number;
  content_hash: string | null;
  /** Short headline from manual ChatGPT journal flow. */
  summary_title?: string | null;
  latest_summary: string | null;
  latest_summary_updated_at: number | null;
  summary_status: SummaryStatus;
}

export interface VisitEvent {
  id: string;
  page_id: string;
  visited_at: number;
  title_at_visit: string;
}

/** One tab row stored in a session overview snapshot. */
export interface SessionTabSnapshot {
  windowId: number;
  windowFocused: boolean;
  tabIndex: number;
  tabId: number;
  title: string;
  url: string;
  groupId: string;
  groupLabel: string;
  sortOrder: number;
  pinned: boolean;
  audible: boolean;
  active: boolean;
}

/** Point-in-time capture of all normal windows/tabs from Session overview. */
export interface SessionSnapshotRecord {
  id: string;
  captured_at: number;
  tab_count: number;
  window_count: number;
  tabs: SessionTabSnapshot[];
}

export interface OpenAICompatibleSettings {
  baseUrl: string;
  model: string;
  /** Stored in chrome.storage.local; never synced */
  apiKey: string;
}

/** Which backend handles “Request API summary”. */
export type SummarizationProvider = "openai" | "ollama" | "gemini";

/** Google AI Studio / Gemini API (generateContent). Key from https://aistudio.google.com/apikey */
export interface GeminiSettings {
  model: string;
  /** Stored in chrome.storage.local; never synced */
  apiKey: string;
}

export interface OllamaLocalSettings {
  baseUrl: string;
  model: string;
}

export interface SettingsRecord {
  version: number;
  domainRules: DomainRule[];
  /**
   * Full URL prefixes: if a tab URL starts with one of these (after trim), no visit is recorded.
   * Useful for auth/session hops (e.g. Red Hat Customer Portal primer).
   */
  urlLoggingExcludePrefixes: string[];
  /** Minutes between counted visits for the same page (debounce window). */
  visitDedupeMinutes: number;
  /** Master switch: hide summarisation UI and block requests. */
  summarizationEnabled: boolean;
  /** Allow logging in incognito when user opts in (requires incognito permission). */
  allowIncognitoLogging: boolean;
  /** Active provider for API summarisation; OpenAI and Ollama settings are stored separately. */
  summarizationProvider: SummarizationProvider;
  openaiCompatible: OpenAICompatibleSettings;
  ollamaLocal: OllamaLocalSettings;
  gemini: GeminiSettings;
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  version: 1,
  domainRules: [
    { id: "ex1", pattern: "redhat.atlassian.net", enabled: true },
    { id: "ex2", pattern: "*.sharepoint.com", enabled: true },
    { id: "ex3", pattern: "docs.redhat.com", enabled: true },
  ],
  urlLoggingExcludePrefixes: [
    "https://access.redhat.com/services/primer/session/scribe/?redirectTo=",
  ],
  visitDedupeMinutes: 5,
  summarizationEnabled: true,
  allowIncognitoLogging: false,
  summarizationProvider: "openai",
  openaiCompatible: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
  },
  ollamaLocal: {
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
  },
  gemini: {
    model: "gemini-2.0-flash",
    apiKey: "",
  },
};

export function summarizationProviderLabel(p: SummarizationProvider): string {
  switch (p) {
    case "ollama":
      return "Ollama (local)";
    case "gemini":
      return "Google Gemini";
    default:
      return "OpenAI / compatible API";
  }
}
