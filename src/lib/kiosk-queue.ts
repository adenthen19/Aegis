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

// Read any localStorage queue left over from the previous build, WITHOUT
// removing it. We only delete the legacy entry once we've confirmed the
// items are persisted to IDB (see clearLegacy below) — otherwise a
// failure between read and write would silently lose pending taps.
function readLegacy(eventId: string): QueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(legacyKey(eventId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueueItem);
  } catch {
    return [];
  }
}

function clearLegacy(eventId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(legacyKey(eventId));
  } catch {
    // localStorage write can throw in private/quota-full mode — not
    // fatal. The legacy items will just be re-migrated on the next
    // call (idempotent).
  }
}

// IDB write that THROWS on failure — distinct from the public writeQueue
// which swallows. The legacy migration uses this so it can decide
// whether it's safe to wipe localStorage.
async function writeQueueStrict(
  eventId: string,
  items: QueueItem[],
): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB unavailable');
  }
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
}

export async function readQueue(eventId: string): Promise<QueueItem[]> {
  // Server / non-browser caller — silently return empty so the kiosk shell
  // can call this during SSR-warm renders without blowing up.
  if (typeof indexedDB === 'undefined') return [];

  // PEEK at legacy localStorage. We never delete here — we'll only
  // call clearLegacy after we've successfully written merged items to
  // IDB. That way if IDB fails (private browsing, quota), the legacy
  // entries remain on disk and are still recoverable on next reload.
  const legacy = readLegacy(eventId);

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
    // IDB unavailable — fall back to localStorage items. localStorage
    // is intact (we haven't cleared it yet) so a future call can retry.
    return legacy;
  }

  if (legacy.length === 0) return stored;

  // Merge legacy → stored on a per-(guest_id) basis. The stored copy
  // wins when both have an entry for the same guest because it's newer
  // (must have been written after the legacy migration would have run).
  const seen = new Set(stored.map((s) => s.guest_id));
  const merged = [...stored];
  for (const item of legacy) if (!seen.has(item.guest_id)) merged.push(item);

  // Persist to IDB FIRST. Only clear localStorage after the write
  // confirms — if writeQueueStrict throws, the legacy items remain on
  // disk and the next readQueue call will try again.
  try {
    await writeQueueStrict(eventId, merged);
    clearLegacy(eventId);
  } catch {
    // Leave localStorage in place; merged items are still served from
    // memory for this session.
  }
  return merged;
}

// Public, fire-and-forget write. Caller doesn't have to await — the
// in-memory queue is the source of truth for the UI and a failed
// persistence write will be retried on the next mutation. Use
// writeQueueStrict directly when failure handling matters (the legacy
// migration in readQueue does this).
export async function writeQueue(
  eventId: string,
  items: QueueItem[],
): Promise<void> {
  try {
    await writeQueueStrict(eventId, items);
  } catch {
    // Swallowed by design — see comment above.
  }
}
