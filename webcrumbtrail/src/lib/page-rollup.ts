import type { PageRecord } from "../shared/types";

/**
 * Normalize document title for grouping (SharePoint and similar hosts where the same * document can appear under different URLs).
 */
export function normalizeTitleForRollup(title: string): string {
  const t = title.trim().replace(/\s+/g, " ").toLowerCase();
  if (!t || t === "(no title)") return "";
  return t;
}

/** Host matches `*.sharepoint.com` (tenant / personal sites). */
export function hostnameIsSharePoint(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "sharepoint.com" || h.endsWith(".sharepoint.com");
}

function summaryScore(p: PageRecord): number {
  const bodyLen = p.latest_summary?.length ?? 0;
  if (p.summary_status === "completed" && bodyLen > 0) return 3_000_000 + bodyLen;
  if (p.summary_status === "queued") return 2_000_000;
  if (p.latest_summary_updated_at != null) return 1_000_000 + p.latest_summary_updated_at;
  if (bodyLen > 0) return bodyLen;
  return 0;
}

/** Prefer the richest summary when merging duplicate page rows. */
export function pickBestSummaryPage(members: PageRecord[]): PageRecord {
  return members.reduce((a, b) => (summaryScore(b) > summaryScore(a) ? b : a));
}
