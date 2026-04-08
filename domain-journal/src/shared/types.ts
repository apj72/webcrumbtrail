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

export interface OpenAICompatibleSettings {
  baseUrl: string;
  model: string;
  /** Stored in chrome.storage.local; never synced */
  apiKey: string;
}

export interface SettingsRecord {
  version: number;
  domainRules: DomainRule[];
  /** Minutes between counted visits for the same page (debounce window). */
  visitDedupeMinutes: number;
  /** Master switch: hide summarisation UI and block requests. */
  summarizationEnabled: boolean;
  /** Allow logging in incognito when user opts in (requires incognito permission). */
  allowIncognitoLogging: boolean;
  openaiCompatible: OpenAICompatibleSettings;
}

export const DEFAULT_SETTINGS: SettingsRecord = {
  version: 1,
  domainRules: [
    { id: "ex1", pattern: "redhat.atlassian.net", enabled: true },
    { id: "ex2", pattern: "*.sharepoint.com", enabled: true },
    { id: "ex3", pattern: "docs.redhat.com", enabled: true },
  ],
  visitDedupeMinutes: 5,
  summarizationEnabled: true,
  allowIncognitoLogging: false,
  openaiCompatible: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    apiKey: "",
  },
};
