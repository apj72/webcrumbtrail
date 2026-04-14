import type { GeminiSettings } from "../../shared/types";
import type { SummarizeInput } from "./openai-compatible";

const GEMINI_REST_BASE = "https://generativelanguage.googleapis.com/v1beta";

function modelPath(model: string): string {
  const m = model.replace(/^models\//, "").trim() || "gemini-2.0-flash";
  return `models/${m}`;
}

function buildUserPrompt(input: SummarizeInput): string {
  return `You summarize web pages for a personal knowledge journal. Output a short paragraph (2-4 sentences) plus 5-8 bullet points of the most important facts. Use clear, scannable language. Do not add a preamble.

Title: ${input.title}
URL: ${input.url}

Page text:
${input.text.slice(0, 120_000)}`;
}

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string; status?: string };
};

async function callGenerateContent(
  settings: GeminiSettings,
  userText: string,
  maxOutputTokens: number,
): Promise<string> {
  const key = settings.apiKey.trim();
  if (!key) {
    throw new Error("Gemini API key is not configured. Add it in WebCrumbTrail settings.");
  }
  const path = modelPath(settings.model);
  const url = `${GEMINI_REST_BASE}/${path}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: {
      temperature: maxOutputTokens <= 32 ? 0 : 0.3,
      maxOutputTokens,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GenerateContentResponse;
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? (await res.text()).slice(0, 500);
    throw new Error(`Gemini API error ${res.status}: ${msg}`);
  }
  const parts = json.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Empty summary response from Gemini.");
  return text;
}

export async function summarizeWithGemini(settings: GeminiSettings, input: SummarizeInput): Promise<string> {
  return callGenerateContent(settings, buildUserPrompt(input), 1200);
}

export async function testGeminiConnection(settings: GeminiSettings): Promise<string> {
  const text = await callGenerateContent(
    settings,
    'Reply with exactly the word "ok" and nothing else.',
    16,
  );
  return text.slice(0, 80);
}
