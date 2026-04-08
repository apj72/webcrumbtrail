import type { PageRecord, SettingsRecord, VisitEvent } from "../../shared/types";
import { getDB } from "./idb";
import { loadSettings, saveSettings } from "./settings";

export type ExportBundle = {
  exported_at: number;
  version: 1;
  settings: SettingsRecord;
  pages: PageRecord[];
  visits: VisitEvent[];
};

export async function exportAll(): Promise<ExportBundle> {
  const db = await getDB();
  const [pages, visits, settings] = await Promise.all([
    db.getAll("pages"),
    db.getAll("visits"),
    loadSettings(),
  ]);
  return {
    exported_at: Date.now(),
    version: 1,
    settings,
    pages,
    visits,
  };
}

export async function importBundle(bundle: ExportBundle, mode: "merge" | "replace"): Promise<void> {
  const db = await getDB();
  if (mode === "replace") {
    const tx = db.transaction(["pages", "visits"], "readwrite");
    await tx.objectStore("pages").clear();
    await tx.objectStore("visits").clear();
    await tx.done;
  }
  const tx = db.transaction(["pages", "visits"], "readwrite");
  for (const p of bundle.pages) {
    await tx.objectStore("pages").put(p);
  }
  for (const v of bundle.visits) {
    try {
      await tx.objectStore("visits").add(v);
    } catch {
      await tx.objectStore("visits").put(v);
    }
  }
  await tx.done;
  await saveSettings(bundle.settings);
}

/** CSV of pages for spreadsheets */
export function pagesToCsv(pages: PageRecord[]): string {
  const headers = [
    "id",
    "canonical_url",
    "domain",
    "title",
    "summary_title",
    "first_seen_at",
    "last_seen_at",
    "visit_count",
    "summary_status",
  ];
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = pages.map((p) =>
    [
      p.id,
      p.canonical_url,
      p.domain,
      p.title,
      p.summary_title ?? "",
      p.first_seen_at,
      p.last_seen_at,
      p.visit_count,
      p.summary_status,
    ]
      .map((c) => (typeof c === "string" ? esc(c) : String(c)))
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
