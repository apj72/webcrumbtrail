import type { OpenAICompatibleSettings } from "../../shared/types";

function isLikelyLocalOllama(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname;
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    return (host === "127.0.0.1" || host === "localhost") && (port === "11434" || port === "");
  } catch {
    return false;
  }
}

/** Extra hint when Ollama returns 403 to a browser extension (origin allowlist). */
function formatApiHttpError(status: number, errText: string, baseUrl: string): string {
  let msg = `API error ${status}: ${errText.slice(0, 500)}`;
  if (status === 403 && isLikelyLocalOllama(baseUrl)) {
    msg +=
      " — Ollama blocks unknown browser origins. Allow Chrome extensions: quit Ollama, then start it with OLLAMA_ORIGINS=chrome-extension://* (or OLLAMA_ORIGINS=* for local dev only). On macOS you can use: launchctl setenv OLLAMA_ORIGINS 'chrome-extension://*' then restart the Ollama app. See WebCrumbTrail README (Ollama 403).";
  }
  return msg;
}

export type SummarizeInput = {
  title: string;
  text: string;
  url: string;
};

/**
 * OpenAI-compatible chat completions API.
 */
export async function summarizeWithOpenAICompatible(
  settings: OpenAICompatibleSettings,
  input: SummarizeInput,
): Promise<string> {
  const { baseUrl, model, apiKey } = settings;
  if (!apiKey.trim()) {
    throw new Error("API key is not configured. Add it in WebCrumbTrail settings.");
  }
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model,
    messages: [
      {
        role: "system" as const,
        content: `You summarize web pages for a personal knowledge journal. Output a short paragraph (2-4 sentences) plus 5-8 bullet points of the most important facts. Use clear, scannable language. Do not add a preamble.`,
      },
      {
        role: "user" as const,
        content: `Title: ${input.title}\nURL: ${input.url}\n\nPage text:\n${input.text.slice(0, 120_000)}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 1200,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(formatApiHttpError(res.status, errText, baseUrl));
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty summary response");
  return text;
}

/**
 * Minimal request to verify base URL, model, and credentials. Returns a short preview string on success.
 */
export async function testOpenAICompatibleConnection(settings: OpenAICompatibleSettings): Promise<string> {
  const { baseUrl, model, apiKey } = settings;
  if (!apiKey.trim()) {
    throw new Error("API key is not configured. Add it under OpenAI (cloud API), or select Ollama (local).");
  }
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model,
    messages: [{ role: "user" as const, content: 'Reply with exactly the word "ok" and nothing else.' }],
    max_tokens: 8,
    temperature: 0,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(formatApiHttpError(res.status, errText, baseUrl));
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return text.slice(0, 80);
}
