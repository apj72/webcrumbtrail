import type { OpenAICompatibleSettings } from "../../shared/types";

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
    throw new Error("API key is not configured. Add it in Domain Journal settings.");
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
    throw new Error(`API error ${res.status}: ${errText.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty summary response");
  return text;
}
