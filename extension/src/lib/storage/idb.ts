import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageRecord, SessionSnapshotRecord, VisitEvent } from "../../shared/types";
import { canonicalizeUrl } from "../canonicalize";
import { googleWorkspaceDocumentRollupKey } from "../google-workspace-url";
import {
  hostnameIsSharePoint,
  normalizeTitleForRollup,
  pickBestSummaryPage,
} from "../page-rollup";

/** Legacy IndexedDB name before the WebCrumbTrail rename; migrated once into DB_NAME. */
const LEGACY_DB_NAME = "domain-journal";
const DB_NAME = "webcrumbtrail";
const DB_VERSION = 3;

interface JournalDB extends DBSchema {
  pages: {
    key: string;
    value: PageRecord;
    indexes: { "by-domain": string; "by-last-seen": number };
  };
  visits: {
    key: string;
    value: VisitEvent;
    indexes: { "by-page": string; "by-visited-at": number };
  };
  session_snapshots: {
    key: string;
    value: SessionSnapshotRecord;
    indexes: { "by-captured-at": number };
  };
}

let dbPromise: Promise<IDBPDatabase<JournalDB>> | null = null;

async function runJournalSchemaUpgrade(
  db: IDBPDatabase<JournalDB>,
  oldVersion: number,
): Promise<void> {
  if (oldVersion < 1) {
    const pageStore = db.createObjectStore("pages", { keyPath: "id" });
    pageStore.createIndex("by-domain", "domain");
    pageStore.createIndex("by-last-seen", "last_seen_at");

    const visitStore = db.createObjectStore("visits", { keyPath: "id" });
    visitStore.createIndex("by-page", "page_id");
    visitStore.createIndex("by-visited-at", "visited_at");
  }
  if (oldVersion < 2) {
    const tx = db.transaction("pages", "readwrite");
    const store = tx.objectStore("pages");
    let cursor = await store.openCursor();
    while (cursor) {
      const p = cursor.value as PageRecord;
      if (p.visit_count < 1) {
        await cursor.update({ ...p, visit_count: 1 });
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }
  if (oldVersion < 3) {
    const snapStore = db.createObjectStore("session_snapshots", { keyPath: "id" });
    snapStore.createIndex("by-captured-at", "captured_at");
  }
}

async function legacyIndexedDbExists(): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return false;
  const dbs = await indexedDB.databases();
  return dbs.some((d) => d.name === LEGACY_DB_NAME);
}

/** Copy data from pre-rename DB into `webcrumbtrail`, then remove the legacy database. */
async function migrateLegacyIndexedDbIfNeeded(): Promise<void> {
  if (!(await legacyIndexedDbExists())) return;

  const legacyDb = await openDB<JournalDB>(LEGACY_DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      return runJournalSchemaUpgrade(db, oldVersion);
    },
  });

  const pages = await legacyDb.getAll("pages");
  const visits = await legacyDb.getAll("visits");
  await legacyDb.close();

  if (pages.length === 0 && visits.length === 0) {
    await deleteDB(LEGACY_DB_NAME).catch(() => {});
    return;
  }

  const newDb = await openDB<JournalDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      return runJournalSchemaUpgrade(db, oldVersion);
    },
  });

  const existing = (await newDb.count("pages")) + (await newDb.count("visits"));
  if (existing > 0) {
    await newDb.close();
    return;
  }

  const tx = newDb.transaction(["pages", "visits"], "readwrite");
  for (const p of pages) await tx.objectStore("pages").put(p);
  for (const v of visits) await tx.objectStore("visits").add(v);
  await tx.done;
  await newDb.close();
  await deleteDB(LEGACY_DB_NAME).catch(() => {});
}

export function getDB(): Promise<IDBPDatabase<JournalDB>> {
  if (!dbPromise) {
    dbPromise = (async () => {
      await migrateLegacyIndexedDbIfNeeded();
      return openDB<JournalDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
          return runJournalSchemaUpgrade(db, oldVersion);
        },
      });
    })();
  }
  return dbPromise;
}

export async function putPage(db: IDBPDatabase<JournalDB>, page: PageRecord): Promise<void> {
  await db.put("pages", page);
}

export async function getPageByCanonical(
  db: IDBPDatabase<JournalDB>,
  canonicalUrl: string,
): Promise<PageRecord | undefined> {
  const tx = db.transaction("pages", "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    if (cursor.value.canonical_url === canonicalUrl) return cursor.value;
    cursor = await cursor.continue();
  }
  return undefined;
}

/**
 * Find an existing page on SharePoint (or compatible host) with the same normalized title.
 * Used when canonical URLs differ but the tab title matches (common for SharePoint).
 */
export async function getPageByDomainAndTitleKey(
  db: IDBPDatabase<JournalDB>,
  domain: string,
  titleKey: string,
): Promise<PageRecord | undefined> {
  if (!titleKey || !hostnameIsSharePoint(domain)) return undefined;
  const tx = db.transaction("pages", "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const p = cursor.value;
    if (p.domain === domain && normalizeTitleForRollup(p.title) === titleKey) return p;
    cursor = await cursor.continue();
  }
  return undefined;
}

/**
 * Match an existing Google Docs/Sheets/… row by stable file id when the canonical URL differs
 * (legacy rows or alternate URL shapes).
 */
export async function getPageByGoogleWorkspaceDocKey(
  db: IDBPDatabase<JournalDB>,
  rollupKey: string,
): Promise<PageRecord | undefined> {
  if (!rollupKey) return undefined;
  const tx = db.transaction("pages", "readonly");
  let cursor = await tx.store.openCursor();
  while (cursor) {
    const p = cursor.value;
    if (p.domain !== "docs.google.com") {
      cursor = await cursor.continue();
      continue;
    }
    const k =
      googleWorkspaceDocumentRollupKey(p.canonical_url) ??
      googleWorkspaceDocumentRollupKey(p.original_url);
    if (k === rollupKey) return p;
    cursor = await cursor.continue();
  }
  return undefined;
}

/**
 * Merge pages that share the same normalized title on SharePoint hosts: re-point visits to the
 * oldest row and delete duplicates. Safe to run repeatedly (idempotent).
 */
export async function mergeSharePointPagesByNormalizedTitle(
  db: IDBPDatabase<JournalDB>,
): Promise<number> {
  const pages = await db.getAll("pages");
  const groups = new Map<string, PageRecord[]>();
  for (const p of pages) {
    if (!hostnameIsSharePoint(p.domain)) continue;
    const key = normalizeTitleForRollup(p.title);
    if (!key) continue;
    const gkey = `${p.domain}\0${key}`;
    let g = groups.get(gkey);
    if (!g) {
      g = [];
      groups.set(gkey, g);
    }
    g.push(p);
  }

  let removed = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.first_seen_at - b.first_seen_at);
    const primary = arr[0];
    const secondaries = arr.slice(1);
    const bestSummary = pickBestSummaryPage(arr);
    const latest = arr.reduce((a, b) => (a.last_seen_at >= b.last_seen_at ? a : b));
    const minFirst = Math.min(...arr.map((p) => p.first_seen_at));
    const maxLast = Math.max(...arr.map((p) => p.last_seen_at));

    const tx = db.transaction(["pages", "visits"], "readwrite");
    const visitIdx = tx.objectStore("visits").index("by-page");
    const pageStore = tx.objectStore("pages");

    for (const sec of secondaries) {
      let cursor = await visitIdx.openCursor(IDBKeyRange.only(sec.id));
      while (cursor) {
        const v = cursor.value;
        await cursor.update({ ...v, page_id: primary.id });
        cursor = await cursor.continue();
      }
      await pageStore.delete(sec.id);
      removed++;
    }

    const mergedPrimary: PageRecord = {
      ...primary,
      first_seen_at: minFirst,
      last_seen_at: maxLast,
      title: latest.title || primary.title,
      original_url: latest.original_url,
      summary_title: bestSummary.summary_title ?? primary.summary_title,
      latest_summary: bestSummary.latest_summary ?? primary.latest_summary,
      latest_summary_updated_at:
        bestSummary.latest_summary_updated_at ?? primary.latest_summary_updated_at,
      summary_status: bestSummary.summary_status,
      content_hash: bestSummary.content_hash ?? primary.content_hash,
    };
    await pageStore.put(mergedPrimary);
    await tx.done;

    const visitList = await listVisitsForPage(db, primary.id);
    mergedPrimary.visit_count = Math.max(1, visitList.length);
    await putPage(db, mergedPrimary);
  }

  return removed;
}

/**
 * Merge docs.google.com pages that refer to the same file id (after URL normalization).
 */
export async function mergeGoogleWorkspaceDocsByRollupKey(
  db: IDBPDatabase<JournalDB>,
): Promise<number> {
  const pages = await db.getAll("pages");
  const groups = new Map<string, PageRecord[]>();
  for (const p of pages) {
    if (p.domain !== "docs.google.com") continue;
    const key =
      googleWorkspaceDocumentRollupKey(p.canonical_url) ??
      googleWorkspaceDocumentRollupKey(p.original_url);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(p);
  }

  let removed = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.first_seen_at - b.first_seen_at);
    const primary = arr[0];
    const secondaries = arr.slice(1);
    const bestSummary = pickBestSummaryPage(arr);
    const latest = arr.reduce((a, b) => (a.last_seen_at >= b.last_seen_at ? a : b));
    const minFirst = Math.min(...arr.map((p) => p.first_seen_at));
    const maxLast = Math.max(...arr.map((p) => p.last_seen_at));

    const tx = db.transaction(["pages", "visits"], "readwrite");
    const visitIdx = tx.objectStore("visits").index("by-page");
    const pageStore = tx.objectStore("pages");

    for (const sec of secondaries) {
      let cursor = await visitIdx.openCursor(IDBKeyRange.only(sec.id));
      while (cursor) {
        const v = cursor.value;
        await cursor.update({ ...v, page_id: primary.id });
        cursor = await cursor.continue();
      }
      await pageStore.delete(sec.id);
      removed++;
    }

    const mergedPrimary: PageRecord = {
      ...primary,
      first_seen_at: minFirst,
      last_seen_at: maxLast,
      title: latest.title || primary.title,
      original_url: latest.original_url,
      canonical_url: canonicalizeUrl(latest.original_url),
      summary_title: bestSummary.summary_title ?? primary.summary_title,
      latest_summary: bestSummary.latest_summary ?? primary.latest_summary,
      latest_summary_updated_at:
        bestSummary.latest_summary_updated_at ?? primary.latest_summary_updated_at,
      summary_status: bestSummary.summary_status,
      content_hash: bestSummary.content_hash ?? primary.content_hash,
    };
    await pageStore.put(mergedPrimary);
    await tx.done;

    const visitList = await listVisitsForPage(db, primary.id);
    mergedPrimary.visit_count = Math.max(1, visitList.length);
    await putPage(db, mergedPrimary);
  }

  return removed;
}

/** SharePoint title rollup + Google Workspace file-id rollup (safe to call repeatedly). */
export async function mergeRollupDuplicatePages(db: IDBPDatabase<JournalDB>): Promise<void> {
  await mergeSharePointPagesByNormalizedTitle(db);
  await mergeGoogleWorkspaceDocsByRollupKey(db);
}

export async function getPageById(
  db: IDBPDatabase<JournalDB>,
  id: string,
): Promise<PageRecord | undefined> {
  return db.get("pages", id);
}

export async function getAllPages(db: IDBPDatabase<JournalDB>): Promise<PageRecord[]> {
  return db.getAll("pages");
}

export async function addVisit(db: IDBPDatabase<JournalDB>, visit: VisitEvent): Promise<void> {
  await db.add("visits", visit);
}

export async function listVisitsForPage(
  db: IDBPDatabase<JournalDB>,
  pageId: string,
): Promise<VisitEvent[]> {
  const idx = db.transaction("visits").store.index("by-page");
  return idx.getAll(pageId);
}

export async function getLastVisitForPage(
  db: IDBPDatabase<JournalDB>,
  pageId: string,
): Promise<VisitEvent | undefined> {
  const visits = await listVisitsForPage(db, pageId);
  if (visits.length === 0) return undefined;
  return visits.reduce((a, b) => (a.visited_at >= b.visited_at ? a : b));
}

export async function deleteAllData(db: IDBPDatabase<JournalDB>): Promise<void> {
  const tx = db.transaction(["pages", "visits", "session_snapshots"], "readwrite");
  await Promise.all([
    tx.objectStore("pages").clear(),
    tx.objectStore("visits").clear(),
    tx.objectStore("session_snapshots").clear(),
  ]);
  await tx.done;
}

export async function putSessionSnapshot(
  db: IDBPDatabase<JournalDB>,
  record: SessionSnapshotRecord,
): Promise<void> {
  await db.put("session_snapshots", record);
}

export async function listSessionSnapshotsDesc(
  db: IDBPDatabase<JournalDB>,
  limit = 100,
): Promise<SessionSnapshotRecord[]> {
  const rows = await db.getAll("session_snapshots");
  rows.sort((a, b) => b.captured_at - a.captured_at);
  return rows.slice(0, Math.max(0, limit));
}

export async function deleteSessionSnapshot(db: IDBPDatabase<JournalDB>, id: string): Promise<void> {
  await db.delete("session_snapshots", id);
}

/** Remove one page and all visit events that reference it. */
export async function deletePageById(db: IDBPDatabase<JournalDB>, pageId: string): Promise<void> {
  const visits = await listVisitsForPage(db, pageId);
  const tx = db.transaction(["pages", "visits"], "readwrite");
  const visitStore = tx.objectStore("visits");
  for (const v of visits) {
    await visitStore.delete(v.id);
  }
  await tx.objectStore("pages").delete(pageId);
  await tx.done;
}
