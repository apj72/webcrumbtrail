import { DEFAULT_SETTINGS, type SettingsRecord } from "../../shared/types";

const KEY = "domainJournalSettings";

export async function loadSettings(): Promise<SettingsRecord> {
  const r = await chrome.storage.local.get(KEY);
  const raw = r[KEY] as SettingsRecord | undefined;
  if (!raw) return { ...DEFAULT_SETTINGS, domainRules: [...DEFAULT_SETTINGS.domainRules] };
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
    summarizationProvider: s.summarizationProvider ?? DEFAULT_SETTINGS.summarizationProvider,
    openaiCompatible: {
      ...DEFAULT_SETTINGS.openaiCompatible,
      ...s.openaiCompatible,
    },
    ollamaLocal: {
      ...DEFAULT_SETTINGS.ollamaLocal,
      ...s.ollamaLocal,
    },
  };
}
