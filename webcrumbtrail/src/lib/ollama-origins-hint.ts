/**
 * Ollama rejects requests from browser extensions unless OLLAMA_ORIGINS allows them.
 * @see https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama
 */
export const OLLAMA_ORIGINS_FOR_EXTENSIONS = "chrome-extension://*,moz-extension://*,safari-web-extension://*";

/** Widest allowlist; use on a trusted machine when extension origins still return 403. */
export const OLLAMA_ORIGINS_PERMISSIVE = "*";

export const OLLAMA_ORIGINS_DOC_URL =
  "https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama";
