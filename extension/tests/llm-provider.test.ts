import { describe, expect, it } from "vitest";
import { effectiveOpenAICompatible } from "../src/lib/llm-provider";
import { DEFAULT_SETTINGS, summarizationProviderLabel } from "../src/shared/types";

describe("effectiveOpenAICompatible", () => {
  it("uses OpenAI settings when provider is openai", () => {
    const e = effectiveOpenAICompatible({
      ...DEFAULT_SETTINGS,
      summarizationProvider: "openai",
      openaiCompatible: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-test",
      },
    });
    expect(e.baseUrl).toContain("openai.com");
    expect(e.apiKey).toBe("sk-test");
  });

  it("uses Ollama URL and placeholder key when provider is ollama", () => {
    const e = effectiveOpenAICompatible({
      ...DEFAULT_SETTINGS,
      summarizationProvider: "ollama",
      ollamaLocal: { baseUrl: "http://127.0.0.1:11434/v1", model: "mistral" },
    });
    expect(e.baseUrl).toContain("11434");
    expect(e.model).toBe("mistral");
    expect(e.apiKey).toBe("ollama");
  });
});

describe("summarizationProviderLabel", () => {
  it("includes Gemini for gemini provider", () => {
    expect(summarizationProviderLabel("gemini")).toContain("Gemini");
  });
});
