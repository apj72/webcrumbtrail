import { DEFAULT_SETTINGS, type SettingsRecord } from "../../shared/types";

const KEY = "webcrumbtrailSettings";
const LEGACY_KEY = "domainJournalSettings";

export async function loadSettings(): Promise<SettingsRecord> {
  const r = await chrome.storage.local.get([KEY, LEGACY_KEY]);
  const raw = (r[KEY] ?? r[LEGACY_KEY]) as SettingsRecord | undefined;
  if (raw && r[LEGACY_KEY] != null && r[KEY] == null) {
    await chrome.storage.local.set({ [KEY]: raw });
    await chrome.storage.local.remove(LEGACY_KEY);
  }
  if (!raw) {
    return {
      ...DEFAULT_SETTINGS,
      domainRules: [...DEFAULT_SETTINGS.domainRules],
      urlLoggingExcludePrefixes: [...DEFAULT_SETTINGS.urlLoggingExcludePrefixes],
    };
  }
  return mergeDefaults(raw);
}

export async function saveSettings(s: SettingsRecord): Promise<void> {
  await chrome.storage.local.set({ [KEY]: s });
}

function mergeDefaults(s: Partial<SettingsRecord>): SettingsRecord {
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    domainRules: s.domainRules?.length ? s.domainRules : [...DEFAULT_SETTINGS.domainRules],
    urlLoggingExcludePrefixes: Array.isArray(s.urlLoggingExcludePrefixes)
      ? s.urlLoggingExcludePrefixes
      : [...DEFAULT_SETTINGS.urlLoggingExcludePrefixes],
    summarizationProvider: s.summarizationProvider ?? DEFAULT_SETTINGS.summarizationProvider,
    openaiCompatible: {
      ...DEFAULT_SETTINGS.openaiCompatible,
      ...s.openaiCompatible,
    },
    ollamaLocal: {
      ...DEFAULT_SETTINGS.ollamaLocal,
      ...s.ollamaLocal,
    },
    gemini: {
      ...DEFAULT_SETTINGS.gemini,
      ...s.gemini,
    },
  };
}
