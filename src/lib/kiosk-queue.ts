// IndexedDB-backed offline queue for kiosk check-ins.
//
// Why not localStorage?
//   The kiosk runs on hotel-ballroom Wi-Fi for hours at a time. localStorage
//   is wiped if the browser tab is closed or the device's storage cap is hit
//   (iPad Safari is particularly aggressive). IndexedDB is durable across
//   tab lifecycles, survives "Clear browsing data" less aggressively, and
//   has effectively no per-origin size cap relevant to our payload.
//
// API
//   • `readQueue(eventId)`  — returns the current queue for an event, drains
//                             any legacy localStorage entries on first call.
//   • `writeQueue(eventId, items)` — overwrites the queue (matches the old
//                             localStorage helper signature so the kiosk
//                             shell didn't need a major rewrite).
//
// Storage shape
//   Single object store `kiosk_queue` keyed by `event_id`. The stored value
//   is a plain `QueueItem[]`. Keeping one row per event (rather than one row
//   per item) keeps reads cheap — the kiosk only ever needs the whole queue.

export type QueueItem = {
  guest_id: string;
  action: 'checkin' | 'undo';
  ts: number; // ms — informational, used by drain logic to dedupe
};

const DB_NAME = 'aegis-kiosk';
const DB_VERSION = 1;
const STORE = 'kiosk_queue';

// Legacy localStorage key — kept for one-shot migration so ushers who
// already had pending taps before this rollout don't lose them.
function legacyKey(eventId: string): string {
  return `aegis-kiosk-queue:${eventId}`;
}

// Single shared connection promise. We reuse it across calls — opening
// the DB on every read would be wasteful, and IDB keeps the connection
// alive between operations as long as we don't close it.
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath = 'event_id' → one row per event, value is { event_id, items }.
        db.createObjectStore(STORE, { keyPath: 'event_id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () =>
      reject(new Error('IndexedDB blocked — close other Aegis tabs'));
  });
  return dbPromise;
}

type Row = { event_id: string; items: QueueItem[] };

function isQueueItem(x: unknown): x is QueueItem {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Partial<QueueItem>;
  return (
    typeof o.guest_id === 'string' &&
    (o.action === 'checkin' || o.action === 'undo') &&
    typeof o.ts === 'number'
  );
}

// One-shot drain of any localStorage queue from the previous build.
// Called from readQueue so existing ushers don't lose pending taps the
// first time they load this version.
function migrateLegacy(eventId: string): QueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(legacyKey(eventId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed.filter(isQueueItem);
    // Wipe the legacy bucket — the IDB write that happens after this call
    // becomes the new source of truth.
    window.localStorage.removeItem(legacyKey(eventId));
    return items;
  } catch {
    return [];
  }
}

export async function readQueue(eventId: string): Promise<QueueItem[]> {
  // Server / non-browser caller — silently return empty so the kiosk shell
  // can call this during SSR-warm renders without blowing up.
  if (typeof indexedDB === 'undefined') return [];

  const legacy = migrateLegacy(eventId);

  let stored: QueueItem[] = [];
  try {
    const db = await openDb();
    stored = await new Promise<QueueItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(eventId);
      req.onsuccess = () => {
        const row = req.result as Row | undefined;
        const items = (row?.items ?? []).filter(isQueueItem);
        resolve(items);
      };
      req.onerror = () => reject(req.error ?? new Error('IDB read failed'));
    });
  } catch {
    // If IDB blew up (private mode, quota exceeded), fall back to whatever
    // we recovered from localStorage. Better than dropping pending taps.
    return legacy;
  }

  // Merge legacy → stored on a per-(guest_id) basis. The stored copy wins
  // when both have an entry for the same guest because it's newer (it had
  // to come from a write made after the migration ran). We only fall back
  // to legacy items for guest_ids that aren't already represented.
  if (legacy.length === 0) return stored;
  const seen = new Set(stored.map((s) => s.guest_id));
  const merged = [...stored];
  for (const item of legacy) if (!seen.has(item.guest_id)) merged.push(item);
  // Persist the merged set so the legacy bucket stays empty going forward.
  await writeQueue(eventId, merged).catch(() => undefined);
  return merged;
}

export async function writeQueue(
  eventId: string,
  items: QueueItem[],
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (items.length === 0) {
        store.delete(eventId);
      } else {
        store.put({ event_id: eventId, items } satisfies Row);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IDB write aborted'));
    });
  } catch {
    // Last resort: don't crash the kiosk if a write fails. The in-memory
    // queue still drives the optimistic UI; we'll retry on the next
    // mutation.
  }
}
