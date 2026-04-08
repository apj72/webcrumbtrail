import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PageRecord, VisitEvent } from "../../shared/types";

const DB_NAME = "domain-journal";
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

export function getDB(): Promise<IDBPDatabase<JournalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JournalDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion) {
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
        }
      },
    });
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
