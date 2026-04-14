import { applyGoogleWorkspaceCanonicalUrl } from "./google-workspace-url";

/**
 * Strip common tracking query parameters. Domain-specific rules can preserve params via hooks.
 */
const DEFAULT_STRIP_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "_ga",
  "_gl",
  "mc_eid",
  "igshid",
]);

export type CanonicalizeContext = {
  hostname: string;
  pathname: string;
  searchParams: URLSearchParams;
};

export type DomainCanonicalizer = (ctx: CanonicalizeContext, url: URL) => void;

const domainPlugins: Record<string, DomainCanonicalizer> = {
  "redhat.atlassian.net": (ctx, url) => {
    const keep = new Set([
      "selectedIssue",
      "jql",
      "filter",
      "rapidView",
      "projectKey",
      "modal",
    ]);
    const next = new URLSearchParams();
    ctx.searchParams.forEach((v, k) => {
      if (keep.has(k) || k.startsWith("atl")) next.set(k, v);
    });
    url.search = next.toString() ? "?" + next.toString() : "";
  },
  "docs.redhat.com": (_ctx, url) => {
    url.hash = "";
  },
  "docs.google.com": (_ctx, url) => {
    applyGoogleWorkspaceCanonicalUrl(url);
  },
  "*.sharepoint.com": (ctx, url) => {
    const keep = new Set([
      "id",
      "p",
      "uniqueId",
      "sourcedoc",
      "file",
      "folderCTId",
      "view",
      "list",
      "RootFolder",
    ]);
    const next = new URLSearchParams();
    ctx.searchParams.forEach((v, k) => {
      if (keep.has(k) || k === "wd" || k.startsWith("sourcedoc")) next.set(k, v);
    });
    url.search = next.toString() ? "?" + next.toString() : "";
  },
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPlugin(host: string): DomainCanonicalizer | undefined {
  const h = host.toLowerCase();
  if (domainPlugins[h]) return domainPlugins[h];
  for (const [pattern, fn] of Object.entries(domainPlugins)) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(2);
      if (h === suffix || h.endsWith("." + suffix)) return fn;
    }
  }
  return undefined;
}

function applyDefaultStripping(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  searchParams.forEach((value, key) => {
    const lk = key.toLowerCase();
    if (lk.startsWith("utm_")) return;
    if (DEFAULT_STRIP_PARAMS.has(lk)) return;
    out.set(key, value);
  });
  return out;
}

/**
 * Canonicalize URL for deduplication. Lowercases scheme/host, strips fragment by default,
 * removes tracking params, applies optional per-domain rules.
 */
export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const stripped = applyDefaultStripping(new URLSearchParams(url.search));
  url.search = stripped.toString() ? "?" + stripped.toString() : "";

  const plugin = findPlugin(url.hostname);
  if (plugin) {
    const u = new URL(url.href);
    plugin(
      {
        hostname: u.hostname,
        pathname: u.pathname,
        searchParams: new URLSearchParams(u.search),
      },
      u,
    );
    url = u;
  }

  let out = url.href;
  if (out.endsWith("/") && url.pathname !== "/" && url.pathname.length > 1) {
    try {
      const u2 = new URL(out);
      u2.pathname = u2.pathname.replace(/\/+$/, "");
      out = u2.href;
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function registerDomainCanonicalizer(
  hostname: string,
  fn: DomainCanonicalizer,
): void {
  domainPlugins[hostname.toLowerCase()] = fn;
}
