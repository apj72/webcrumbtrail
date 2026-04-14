/**
 * Google Docs/Sheets/Slides/Forms/Drawings often change the URL (account segment in path,
 * ?tab=, /preview vs /edit, etc.) while staying the same underlying file.
 */

const GOOGLE_DOCS_HOST = "docs.google.com";

/** Path segment for editor URLs: /{product}/d/{fileId}/... */
const EDITOR_PATH = /^\/(document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]+)(\/.*)?$/i;

/** Strip /u/{n}/ so the same file opened under different accounts matches. */
function stripAccountSegment(pathname: string): string {
  return pathname.replace(/^\/(document|spreadsheets|presentation|forms|drawings)\/u\/\d+\//i, "/$1/");
}

/**
 * Mutates `url` when it is a docs.google.com editor URL: normalizes path to * `/{product}/d/{id}/edit` and drops the query string (volatile navigation state).
 */
export function applyGoogleWorkspaceCanonicalUrl(url: URL): void {
  if (url.hostname.toLowerCase() !== GOOGLE_DOCS_HOST) return;
  let p = stripAccountSegment(url.pathname);
  const m = p.match(EDITOR_PATH);
  if (m) {
    const product = m[1].toLowerCase();
    url.pathname = `/${product}/d/${m[2]}/edit`;
  } else {
    url.pathname = p;
  }
  url.search = "";
}

/**
 * Stable key for rollup/merge: `document:abc123`, `spreadsheets:xyz`, etc.
 * Returns null for non–docs.google.com hosts or unrecognized paths.
 */
export function googleWorkspaceDocumentRollupKey(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname.toLowerCase() !== GOOGLE_DOCS_HOST) return null;
    applyGoogleWorkspaceCanonicalUrl(url);
    const m = url.pathname.match(/^\/(document|spreadsheets|presentation|forms|drawings)\/d\/([a-zA-Z0-9_-]+)\/edit$/i);
    if (m) return `${m[1].toLowerCase()}:${m[2]}`;
    return null;
  } catch {
    return null;
  }
}
