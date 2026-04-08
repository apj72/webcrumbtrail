import { DEFAULT_SETTINGS, type OpenAICompatibleSettings, type SettingsRecord } from "../shared/types";

/** Resolves active OpenAI-compatible endpoint + credentials for API summarisation. */
export function effectiveOpenAICompatible(settings: SettingsRecord): OpenAICompatibleSettings {
  const prov = settings.summarizationProvider ?? "openai";
  if (prov === "ollama") {
    const o = {
      ...DEFAULT_SETTINGS.ollamaLocal,
      ...settings.ollamaLocal,
    };
    return {
      baseUrl: o.baseUrl,
      model: o.model,
      apiKey: "ollama",
    };
  }
  return {
    ...DEFAULT_SETTINGS.openaiCompatible,
    ...settings.openaiCompatible,
  };
}
