/**
 * Rule-based grouping for open tabs (session overview). First matching rule wins.
 */
export type TabGroupInfo = {
  id: string;
  label: string;
  /** Lower values appear earlier in the overview. */
  sortOrder: number;
};

export function classifyTabUrl(url: string): TabGroupInfo {
  const raw = url.trim();
  if (
    raw.startsWith("chrome://") ||
    raw.startsWith("chrome-extension://") ||
    raw.startsWith("about:") ||
    raw.startsWith("edge://") ||
    raw.startsWith("devtools:") ||
    raw.startsWith("view-source:")
  ) {
    return { id: "browser-internal", label: "Browser / system pages", sortOrder: 200 };
  }
  if (!raw || raw === "chrome://newtab/" || raw === "edge://newtab/") {
    return { id: "new-tab", label: "New tab", sortOrder: 201 };
  }
  if (!/^https?:\/\//i.test(raw)) {
    return { id: "other-protocol", label: "Non-http(s) tab", sortOrder: 210 };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { id: "invalid-url", label: "Unparseable URL", sortOrder: 220 };
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();

  if (host.endsWith("atlassian.net")) {
    if (
      path.includes("/browse/") ||
      path.includes("/jira/") ||
      path.includes("/secure/") ||
      path.includes("/projects/")
    ) {
      return { id: "jira-atlassian", label: "Jira / Atlassian Cloud", sortOrder: 10 };
    }
  }
  if (host.includes("jira") && (path.includes("/browse/") || path.includes("/secure/"))) {
    return { id: "jira-server", label: "Jira (server / DC)", sortOrder: 11 };
  }

  if (host === "docs.google.com") {
    if (path.includes("/document/")) return { id: "google-docs", label: "Google Docs", sortOrder: 20 };
    if (path.includes("/presentation/")) return { id: "google-slides", label: "Google Slides", sortOrder: 21 };
    if (path.includes("/spreadsheets/")) return { id: "google-sheets", label: "Google Sheets", sortOrder: 22 };
    if (path.includes("/forms/")) return { id: "google-forms", label: "Google Forms", sortOrder: 23 };
    return { id: "google-docs-other", label: "Google Docs (other)", sortOrder: 24 };
  }
  if (host === "drive.google.com") return { id: "google-drive", label: "Google Drive", sortOrder: 30 };
  if (host === "mail.google.com") return { id: "gmail", label: "Gmail", sortOrder: 31 };
  if (host === "calendar.google.com") return { id: "google-calendar", label: "Google Calendar", sortOrder: 32 };
  if (host === "meet.google.com") return { id: "google-meet", label: "Google Meet", sortOrder: 33 };

  if (host === "docs.redhat.com" || host.endsWith(".docs.redhat.com")) {
    return { id: "redhat-docs", label: "Red Hat documentation", sortOrder: 40 };
  }
  if (host === "access.redhat.com" || host.endsWith(".access.redhat.com")) {
    return { id: "redhat-access", label: "Red Hat Customer Portal", sortOrder: 41 };
  }
  if (host.includes("redhat.com") || host.endsWith(".redhat.com")) {
    return { id: "redhat-other", label: "Red Hat (other)", sortOrder: 42 };
  }

  if (host.endsWith("sharepoint.com")) {
    return { id: "sharepoint", label: "SharePoint / Microsoft 365", sortOrder: 50 };
  }

  if (host === "github.com" || host === "gist.github.com") {
    return { id: "github", label: "GitHub", sortOrder: 60 };
  }
  if (host.includes("gitlab")) {
    return { id: "gitlab", label: "GitLab", sortOrder: 61 };
  }

  if (host.endsWith("slack.com") || host === "app.slack.com") {
    return { id: "slack", label: "Slack", sortOrder: 70 };
  }

  const parts = host.split(".");
  const registrable = parts.length >= 2 ? parts.slice(-2).join(".") : host;
  return { id: `site:${registrable}`, label: registrable, sortOrder: 100 };
}

/** For duplicate detection: stable string so same page open in multiple tabs matches. */
export function normalizeTabUrlForDedupe(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    u.hash = "";
    u.protocol = u.protocol.toLowerCase();
    u.hostname = u.hostname.toLowerCase();
    return u.href;
  } catch {
    return raw.toLowerCase();
  }
}
