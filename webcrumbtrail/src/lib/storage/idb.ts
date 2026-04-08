import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageRecord, VisitEvent } from "../../shared/types";

/** Legacy IndexedDB name before the WebCrumbTrail rename; migrated once into DB_NAME. */
const LEGACY_DB_NAME = "domain-journal";
const DB_NAME = "webcrumbtrail";
const DB_VERSION = 2;

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
  const tx = db.transaction(["pages", "visits"], "readwrite");
  await Promise.all([tx.objectStore("pages").clear(), tx.objectStore("visits").clear()]);
  await tx.done;
}
