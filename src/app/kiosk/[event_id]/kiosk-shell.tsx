'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { EventGuest } from '@/lib/types';
import {
  displayCompany,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import {
  kioskCheckInAction,
  kioskUndoCheckInAction,
  type KioskCheckInResult,
} from './actions';

// ─────────────────────────────────────────────────────────────────────────
// Search classifier — same UX as the in-app kiosk tab:
//   • Letters in query  → name/company/email lookup, ≥ 2 chars
//   • Digits-only query → phone lookup, ≥ 4 digits
// ─────────────────────────────────────────────────────────────────────────

type Classified = {
  ready: boolean;
  hint: string | null;
  isPhone: boolean;
  digits: string;
  text: string;
};

function classifyQuery(raw: string): Classified {
  const term = raw.trim();
  if (!term) return { ready: false, hint: null, isPhone: false, digits: '', text: '' };
  const hasLetter = /[a-zA-Z]/.test(term);
  const digits = term.replace(/\D/g, '');
  if (!hasLetter) {
    if (digits.length < 4) {
      return {
        ready: false,
        hint: `Keep typing — ${4 - digits.length} more digit${4 - digits.length === 1 ? '' : 's'} needed.`,
        isPhone: true,
        digits,
        text: term,
      };
    }
    return { ready: true, hint: null, isPhone: true, digits, text: term };
  }
  if (term.length < 2) {
    return { ready: false, hint: 'Keep typing — at least 2 characters.', isPhone: false, digits, text: term };
  }
  return { ready: true, hint: null, isPhone: false, digits, text: term };
}

function matches(guest: EventGuest, q: Classified): boolean {
  if (q.isPhone) {
    const guestDigits = (guest.contact_number ?? '').replace(/\D/g, '');
    if (!guestDigits) return false;
    return guestDigits.includes(q.digits);
  }
  const term = q.text.toLowerCase();
  return (
    guest.full_name.toLowerCase().includes(term) ||
    (guest.title?.toLowerCase().includes(term) ?? false) ||
    (guest.company?.toLowerCase().includes(term) ?? false) ||
    (guest.email?.toLowerCase().includes(term) ?? false)
  );
}

// Highlight a substring (text or phone-digit run) inside a value.
function highlight(value: string, q: Classified): React.ReactNode {
  if (q.isPhone) {
    const valueDigits = value.replace(/\D/g, '');
    const idx = valueDigits.indexOf(q.digits);
    if (idx === -1) return value;
    let consumed = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i < value.length; i++) {
      if (/\d/.test(value[i])) {
        if (consumed === idx && start === -1) start = i;
        if (consumed === idx + q.digits.length - 1) {
          end = i + 1;
          break;
        }
        consumed += 1;
      }
    }
    if (start === -1 || end === -1) return value;
    return (
      <>
        {value.slice(0, start)}
        <mark className="rounded bg-aegis-orange/30 px-0.5 text-aegis-navy">{value.slice(start, end)}</mark>
        {value.slice(end)}
      </>
    );
  }
  const lower = value.toLowerCase();
  const idx = lower.indexOf(q.text.toLowerCase());
  if (idx === -1) return value;
  return (
    <>
      {value.slice(0, idx)}
      <mark className="rounded bg-aegis-orange/30 px-0.5 text-aegis-navy">
        {value.slice(idx, idx + q.text.length)}
      </mark>
      {value.slice(idx + q.text.length)}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Result grouping — direct matches + same-company colleagues so a typo on
// "sq" still surfaces Jason / Cherise / Jeanne / Aden from the same firm.
// ─────────────────────────────────────────────────────────────────────────

type SearchResult = {
  direct: EventGuest[];
  colleagueGroups: { company: string; colleagues: EventGuest[] }[];
};

function searchGuests(
  guests: EventGuest[],
  classified: Classified,
): SearchResult {
  if (!classified.ready) return { direct: [], colleagueGroups: [] };

  const direct = guests.filter((g) => matches(g, classified)).slice(0, 50);
  const matchedIds = new Set(direct.map((g) => g.guest_id));

  // Companies represented in direct matches (case-insensitive, trimmed).
  // We preserve display casing of the first occurrence we saw.
  const companyCanonToDisplay = new Map<string, string>();
  for (const g of direct) {
    const raw = g.company?.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!companyCanonToDisplay.has(key)) companyCanonToDisplay.set(key, raw);
  }

  const groups: { company: string; colleagues: EventGuest[] }[] = [];
  for (const [canon, display] of companyCanonToDisplay) {
    const colleagues = guests
      .filter(
        (g) =>
          !matchedIds.has(g.guest_id) &&
          g.company?.trim().toLowerCase() === canon,
      )
      .slice(0, 12);
    if (colleagues.length > 0) groups.push({ company: display, colleagues });
  }

  return { direct, colleagueGroups: groups };
}

// ─────────────────────────────────────────────────────────────────────────
// Shell
// ─────────────────────────────────────────────────────────────────────────

type ToastState =
  | { kind: 'idle' }
  | {
      kind: 'success';
      name: string;
      company: string | null;
      table: string | null;
      already: boolean;
      queued: boolean;
    }
  | { kind: 'error'; message: string };

// ─────────────────────────────────────────────────────────────────────────
// Offline check-in queue
// ─────────────────────────────────────────────────────────────────────────
//
// When the kiosk is offline (or a server call hits a network error), taps
// go into a localStorage queue per event. The UI flips optimistically so
// ushers can keep working through a wifi blip; once we're back online the
// queue is drained automatically and any items that fail will just stay
// in the queue for the next attempt.
//
// Dedup rule: only the LATEST action per guest is kept. So if an usher
// checks Sarah in offline, then taps Undo, the queue ends with one
// 'undo'. Keeps the drain simple and avoids racing operations.

type QueueItem = {
  guest_id: string;
  action: 'checkin' | 'undo';
  ts: number; // ms — informational
};

function queueKey(eventId: string): string {
  return `aegis-kiosk-queue:${eventId}`;
}

function readQueueFromStorage(eventId: string): QueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(queueKey(eventId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is QueueItem =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as QueueItem).guest_id === 'string' &&
        ((x as QueueItem).action === 'checkin' ||
          (x as QueueItem).action === 'undo'),
    );
  } catch {
    return [];
  }
}

function writeQueueToStorage(eventId: string, items: QueueItem[]): void {
  if (typeof window === 'undefined') return;
  if (items.length === 0) {
    window.localStorage.removeItem(queueKey(eventId));
    return;
  }
  window.localStorage.setItem(queueKey(eventId), JSON.stringify(items));
}

// Returns true if the error looks like a network / connectivity failure
// rather than an application-level error (e.g. "Guest not found"). The
// kiosk re-queues network failures and drops application failures so a
// stuck queue can't pile up forever.
function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch network errors
  if (err instanceof Error) {
    return /network|fetch|connection|offline|timeout/i.test(err.message);
  }
  return false;
}

export default function KioskShell({
  eventId,
  eventName,
  eventDate,
  clientLabel,
  clientLogoUrl,
  location,
  guests,
  googleSheetId,
}: {
  eventId: string;
  eventName: string;
  eventDate: string;
  clientLabel: string | null;
  clientLogoUrl: string | null;
  location: string | null;
  guests: EventGuest[];
  googleSheetId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState>({ kind: 'idle' });
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<
    'idle' | 'syncing' | 'ok' | 'error'
  >('idle');
  const [lastSheetSyncAt, setLastSheetSyncAt] = useState<number | null>(null);

  // Optimistic check-in IDs so the UI flips instantly while the server
  // catches up. Cleared whenever new guest data arrives via revalidation.
  const [optimisticIn, setOptimisticIn] = useState<Set<string>>(new Set());
  // Symmetric set: ids we've optimistically un-checked locally (queued
  // undo while offline).
  const [optimisticOut, setOptimisticOut] = useState<Set<string>>(new Set());
  // Last guest id we checked in — used to expose the "Wrong tap?" undo
  // affordance for ~10s after a check-in.
  const [lastCheckedId, setLastCheckedId] = useState<string | null>(null);
  const lastCheckedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Offline queue + connectivity ─────────────────────────────────────
  const [queue, setQueueState] = useState<QueueItem[]>(() =>
    readQueueFromStorage(eventId),
  );
  // Lazy initializer so we read navigator.onLine on the client's very first
  // render rather than starting at `true` and bouncing on mount. Server
  // render falls back to `true` since navigator isn't available there.
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [syncing, setSyncing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist queue + keep optimistic sets in sync whenever we mutate it.
  // Wrapping setQueueState makes sure localStorage and the in-memory copy
  // never drift apart.
  function commitQueue(next: QueueItem[]) {
    writeQueueToStorage(eventId, next);
    setQueueState(next);
  }

  function enqueue(item: QueueItem) {
    // Dedup by guest_id — only the latest action per guest survives.
    setQueueState((prev) => {
      const filtered = prev.filter((p) => p.guest_id !== item.guest_id);
      const next = [...filtered, item];
      writeQueueToStorage(eventId, next);
      return next;
    });
    if (item.action === 'checkin') {
      setOptimisticIn((prev) => new Set(prev).add(item.guest_id));
      setOptimisticOut((prev) => {
        const next = new Set(prev);
        next.delete(item.guest_id);
        return next;
      });
    } else {
      setOptimisticOut((prev) => new Set(prev).add(item.guest_id));
      setOptimisticIn((prev) => {
        const next = new Set(prev);
        next.delete(item.guest_id);
        return next;
      });
    }
  }

  // Auto-focus the search box on mount so the kiosk is immediately usable.
  // The set of optimistic ids is allowed to keep stale entries — `isCheckedIn`
  // OR-merges them with the authoritative `g.checked_in` flag, so a server
  // confirmation simply renders the row checked-in via either path. (Reconciling
  // the set in an effect would trigger cascading renders.)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── Online / offline detection ─────────────────────────────────────
  // Listen to the browser's online events as the primary signal. Server
  // calls also opportunistically flip the state when they error with a
  // network problem, so a "navigator.onLine = true but server unreachable"
  // case also lights up the offline badge after the first failed tap.
  useEffect(() => {
    function on() {
      setOnline(true);
    }
    function off() {
      setOnline(false);
    }
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ─── Beforeunload warning when pending taps haven't synced ──────────
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (queue.length === 0) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [queue.length]);

  // ─── Live sync via Supabase Realtime ───────────────────────────────
  // Multiple kiosks watching the same event get row-level INSERT / UPDATE /
  // DELETE notifications and re-fetch the server component on any change.
  // Cheap because the server component is fast and Next dedupes refreshes;
  // safer than maintaining a parallel client cache that can drift. Requires
  // event_guests to be in the supabase_realtime publication (migration 0028).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`kiosk-event-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_guests',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // The server action's revalidatePath already refreshes the device
          // that did the check-in. This refresh handles all the *other*
          // kiosks watching the same event.
          router.refresh();
        },
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  // ─── Google Sheet two-way sync (poll every 15s while a sheet is bound) ──
  // Each tick:
  //   1. Read the sheet, diff against Aegis, apply any sheet edits.
  //   2. Write Aegis state back so the sheet stays canonical.
  //   3. If the pull found changes, router.refresh() so the kiosk picks
  //      them up (the realtime channel also fires from the DB write, so
  //      typically this is a no-op).
  useEffect(() => {
    if (!googleSheetId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled) return;
      setSheetSyncStatus((s) => (s === 'syncing' ? s : 'syncing'));
      try {
        const res = await fetch(
          `/api/events/${eventId}/sheets/sync`,
          { method: 'POST' },
        );
        if (cancelled) return;
        const json = (await res.json()) as
          | { ok: true; pulled_count: number }
          | { ok: false; error: string };
        if (!json.ok) {
          setSheetSyncStatus('error');
        } else {
          setSheetSyncStatus('ok');
          setLastSheetSyncAt(Date.now());
          if (json.pulled_count > 0) {
            // Realtime usually beats us here, but in case the sheet edit
            // landed in a quiet moment we trigger a refresh too.
            router.refresh();
          }
        }
      } catch {
        if (!cancelled) setSheetSyncStatus('error');
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, 15_000);
        }
      }
    }

    // Kick off immediately, then every 15s.
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [eventId, googleSheetId, router]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (lastCheckedTimerRef.current) clearTimeout(lastCheckedTimerRef.current);
    };
  }, []);

  const total = guests.length;
  const checkedIn = useMemo(() => {
    let c = 0;
    for (const g of guests) {
      // optimisticOut has priority over the server flag (queued undos), then
      // optimisticIn covers queued check-ins that haven't synced yet.
      if (optimisticOut.has(g.guest_id)) continue;
      if (g.checked_in || optimisticIn.has(g.guest_id)) c += 1;
    }
    return c;
  }, [guests, optimisticIn, optimisticOut]);
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  const classified = useMemo(() => classifyQuery(query), [query]);
  const { direct, colleagueGroups } = useMemo(
    () => searchGuests(guests, classified),
    [guests, classified],
  );

  function isCheckedIn(g: EventGuest): boolean {
    if (optimisticOut.has(g.guest_id)) return false;
    return g.checked_in || optimisticIn.has(g.guest_id);
  }

  function flashToast(state: ToastState) {
    setToast(state);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setToast({ kind: 'idle' }),
      state.kind === 'error' ? 3500 : 2000,
    );
  }

  function rememberLastChecked(id: string) {
    setLastCheckedId(id);
    if (lastCheckedTimerRef.current) clearTimeout(lastCheckedTimerRef.current);
    lastCheckedTimerRef.current = setTimeout(() => setLastCheckedId(null), 10_000);
  }

  function checkIn(guest: EventGuest) {
    if (pending) return;
    if (isCheckedIn(guest)) {
      // Already in — flash a soft "already checked in" toast and don't
      // re-fire the action. (Server will confirm if we did fire it anyway.)
      flashToast({
        kind: 'success',
        name: displayName(guest.full_name),
        company: guest.company ? displayCompany(guest.company) : null,
        table: guest.table_number,
        already: true,
        queued: false,
      });
      setQuery('');
      inputRef.current?.focus();
      return;
    }

    // Reusable "we showed it as checked-in" feedback — fired both for the
    // online happy path and the offline-queued path so usher experience
    // stays identical regardless of connectivity.
    function showSuccess(queued: boolean) {
      rememberLastChecked(guest.guest_id);
      flashToast({
        kind: 'success',
        name: displayName(guest.full_name),
        company: guest.company ? displayCompany(guest.company) : null,
        table: guest.table_number,
        already: false,
        queued,
      });
      setQuery('');
      inputRef.current?.focus();
    }

    // Already-known offline → enqueue immediately and skip the network call.
    if (!online) {
      enqueue({ guest_id: guest.guest_id, action: 'checkin', ts: Date.now() });
      showSuccess(true);
      return;
    }

    // Optimistic flip — instant feedback, even before the network round-trip.
    setOptimisticIn((prev) => new Set(prev).add(guest.guest_id));

    startTransition(async () => {
      try {
        const result: KioskCheckInResult = await kioskCheckInAction(
          eventId,
          guest.guest_id,
        );
        if (!result.ok) {
          // Application-level error (e.g. guest deleted). Roll back and
          // surface the message — no point queuing.
          setOptimisticIn((prev) => {
            const next = new Set(prev);
            next.delete(guest.guest_id);
            return next;
          });
          flashToast({ kind: 'error', message: result.error });
          return;
        }
        showSuccess(false);
      } catch (err) {
        // Network / fetch failure — flip into offline mode and queue.
        if (isNetworkError(err)) {
          setOnline(false);
          enqueue({
            guest_id: guest.guest_id,
            action: 'checkin',
            ts: Date.now(),
          });
          showSuccess(true);
          return;
        }
        // Unknown error — roll back and report.
        setOptimisticIn((prev) => {
          const next = new Set(prev);
          next.delete(guest.guest_id);
          return next;
        });
        flashToast({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Check-in failed.',
        });
      }
    });
  }

  function undoLast() {
    if (!lastCheckedId || pending) return;
    const id = lastCheckedId;

    // Mirror checkIn's offline path: queue the undo + flip optimistic state.
    if (!online) {
      enqueue({ guest_id: id, action: 'undo', ts: Date.now() });
      setLastCheckedId(null);
      setToast({ kind: 'idle' });
      return;
    }

    startTransition(async () => {
      try {
        const res = await kioskUndoCheckInAction(eventId, id);
        if (!res.ok) {
          flashToast({ kind: 'error', message: res.error ?? 'Undo failed.' });
          return;
        }
        // Drop optimistic flag too in case revalidation hasn't landed yet.
        setOptimisticIn((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setLastCheckedId(null);
        setToast({ kind: 'idle' });
      } catch (err) {
        if (isNetworkError(err)) {
          setOnline(false);
          enqueue({ guest_id: id, action: 'undo', ts: Date.now() });
          setLastCheckedId(null);
          setToast({ kind: 'idle' });
          return;
        }
        flashToast({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Undo failed.',
        });
      }
    });
  }

  // ─── Drain queue when we come back online ─────────────────────────────
  // Run any time `online` flips true OR new items appear in the queue
  // while we're already online. Uses a ref to avoid overlapping drains
  // (re-entrant if the user keeps tapping during a drain).
  const drainingRef = useRef(false);
  useEffect(() => {
    if (!online || queue.length === 0) return;
    if (drainingRef.current) return;

    drainingRef.current = true;
    setSyncing(true);

    (async () => {
      // Snapshot at start; if more items get added mid-drain we just pick
      // them up on the next effect run.
      let working = readQueueFromStorage(eventId);
      let netError = false;

      for (const item of working) {
        try {
          const res =
            item.action === 'checkin'
              ? await kioskCheckInAction(eventId, item.guest_id)
              : await kioskUndoCheckInAction(eventId, item.guest_id);
          if (res.ok) {
            // Success — remove this one item from the live queue. Re-read
            // from storage in case another tap added something while we
            // were awaiting the server.
            working = readQueueFromStorage(eventId).filter(
              (q) => q.guest_id !== item.guest_id || q.ts !== item.ts,
            );
            writeQueueToStorage(eventId, working);
          } else {
            // Application failure — drop the item so the queue doesn't
            // get stuck on a single bad row.
            working = readQueueFromStorage(eventId).filter(
              (q) => q.guest_id !== item.guest_id || q.ts !== item.ts,
            );
            writeQueueToStorage(eventId, working);
          }
        } catch (err) {
          if (isNetworkError(err)) {
            netError = true;
            break;
          }
          // Unknown error — drop and move on, log for debug.
          console.error('Kiosk drain: unknown error', err);
          working = readQueueFromStorage(eventId).filter(
            (q) => q.guest_id !== item.guest_id || q.ts !== item.ts,
          );
          writeQueueToStorage(eventId, working);
        }
      }

      // Push the final queue into React state so the badge updates.
      const final = readQueueFromStorage(eventId);
      setQueueState(final);
      // Clear optimistic sets for guests whose canonical state matches —
      // the server-write will land via realtime / revalidatePath shortly.
      // We're conservative here: only drop optimistic flags for ids that
      // are NOT still in the queue (i.e. successfully drained).
      const stillQueued = new Set(final.map((q) => q.guest_id));
      setOptimisticIn((prev) => {
        const next = new Set<string>();
        for (const id of prev) if (stillQueued.has(id)) next.add(id);
        return next;
      });
      setOptimisticOut((prev) => {
        const next = new Set<string>();
        for (const id of prev) if (stillQueued.has(id)) next.add(id);
        return next;
      });

      drainingRef.current = false;
      setSyncing(false);
      if (netError) setOnline(false);

      // Pull fresh server data so the success toast / counters reflect
      // what just landed. This covers the case where realtime hasn't
      // delivered yet by the time we're done draining.
      router.refresh();
    })();
  }, [online, queue, eventId, router]);

  // Helps the linter know commitQueue is "used" (kept for future API
  // consistency with the bulk reset / clear flows). Direct uses go via
  // setQueueState + writeQueueToStorage so concurrent updates are atomic.
  void commitQueue;

  return (
    <div className="flex min-h-screen flex-col bg-aegis-gray-50/40">
      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-aegis-gray-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {clientLogoUrl && (
              <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-aegis-gray-100 bg-white p-1 shadow-sm sm:h-14 sm:w-20">
                {/* Plain <img> — kiosk loads from arbitrary Supabase Storage URLs and
                    sometimes data: URLs, so next/image's domain allowlist would just
                    get in the way here. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clientLogoUrl}
                  alt={clientLabel ?? 'Client logo'}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-aegis-orange">
                Check-in kiosk
                <ConnectionBadge
                  online={online}
                  realtimeConnected={liveConnected}
                  syncing={syncing}
                  pending={queue.length}
                />
                {googleSheetId && (
                  <SheetSyncBadge
                    status={sheetSyncStatus}
                    lastAt={lastSheetSyncAt}
                  />
                )}
              </p>
              <h1 className="truncate text-lg font-semibold text-aegis-navy sm:text-2xl">
                {displayName(eventName)}
              </h1>
              <p className="truncate text-[12px] text-aegis-gray-500 sm:text-sm">
                {[
                  clientLabel ? displayCompany(clientLabel) : null,
                  new Date(eventDate).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                  location,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-inset ring-emerald-200 sm:px-4">
              <div className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-2xl font-semibold text-emerald-700 sm:text-3xl">
                  {checkedIn}
                </span>
                <span className="text-sm text-emerald-700/70">/ {total}</span>
              </div>
              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-emerald-100 sm:w-32">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-emerald-700/80">
                Checked in · {pct}%
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExitConfirmOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-lg border border-aegis-gray-200 bg-white px-4 text-sm font-medium text-aegis-navy shadow-sm hover:bg-aegis-gray-50 sm:h-12"
              aria-label="Exit kiosk mode"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Search input ──────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <form onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="kiosk-search" className="sr-only">
            Search guest by name, company, or contact number
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-aegis-gray-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              id="kiosk-search"
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, or 4+ digit phone…"
              className="w-full rounded-2xl border border-aegis-gray-200 bg-white py-5 pl-14 pr-14 text-lg text-aegis-gray-900 shadow-sm outline-none placeholder:text-aegis-gray-300 focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 sm:py-6 sm:text-2xl"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-aegis-gray-300 hover:bg-aegis-gray-50 hover:text-aegis-gray sm:h-12 sm:w-12"
              >
                <svg
                  className="h-4 w-4 sm:h-5 sm:w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            )}
          </div>
        </form>

        <p className="mt-3 text-xs text-aegis-gray-500 sm:text-sm">
          {classified.hint
            ? classified.hint
            : classified.ready
              ? `${direct.length} match${direct.length === 1 ? '' : 'es'}${
                  colleagueGroups.length > 0
                    ? ' · plus colleagues at the same company in case of typo'
                    : ''
                }`
              : 'Tap a row to check in. Type at least 2 letters or 4 digits.'}
        </p>

        {/* ── Results ─────────────────────────────────────────── */}
        {classified.ready && (
          <div className="mt-5 space-y-6">
            {direct.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-aegis-gray-200 bg-white px-6 py-14 text-center">
                <p className="text-lg font-medium text-aegis-navy">No direct match.</p>
                <p className="mt-1 text-sm text-aegis-gray-500">
                  Try a colleague&apos;s name, the company, or the contact number.
                </p>
              </div>
            ) : (
              <section>
                <SectionHeader>
                  Match{direct.length > 1 ? 'es' : ''}
                </SectionHeader>
                <ul className="grid gap-3">
                  {direct.map((g) => (
                    <GuestCard
                      key={g.guest_id}
                      guest={g}
                      classified={classified}
                      checkedIn={isCheckedIn(g)}
                      pending={pending}
                      onPick={checkIn}
                      tone="primary"
                    />
                  ))}
                </ul>
              </section>
            )}

            {colleagueGroups.length > 0 && (
              <section>
                <SectionHeader>
                  Same company{' '}
                  <span className="text-aegis-gray-400">
                    · in case of typo
                  </span>
                </SectionHeader>
                <div className="space-y-4">
                  {colleagueGroups.map((grp) => (
                    <div
                      key={grp.company}
                      className="rounded-2xl border border-aegis-gray-100 bg-white"
                    >
                      <p className="border-b border-aegis-gray-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500 sm:px-5">
                        {displayCompany(grp.company)}
                      </p>
                      <ul className="divide-y divide-aegis-gray-100">
                        {grp.colleagues.map((g) => (
                          <GuestCard
                            key={g.guest_id}
                            guest={g}
                            classified={classified}
                            checkedIn={isCheckedIn(g)}
                            pending={pending}
                            onPick={checkIn}
                            tone="secondary"
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {!classified.ready && total > 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-aegis-gray-200 bg-white/60 px-6 py-12 text-center">
            <p className="text-sm text-aegis-gray-500">
              {total} guest{total === 1 ? '' : 's'} on the list — start typing to find someone.
            </p>
          </div>
        )}
      </main>

      {/* ── Confirmation toast (success or error) ─────────────── */}
      {toast.kind === 'success' && (
        <ToastSuccess
          name={toast.name}
          company={toast.company}
          table={toast.table}
          already={toast.already}
          queued={toast.queued}
          onUndo={lastCheckedId ? undoLast : null}
          onClose={() => setToast({ kind: 'idle' })}
        />
      )}
      {toast.kind === 'error' && (
        <ToastError
          message={toast.message}
          onClose={() => setToast({ kind: 'idle' })}
        />
      )}

      {/* ── Exit confirm dialog ───────────────────────────────── */}
      {exitConfirmOpen && (
        <ExitConfirm
          eventId={eventId}
          onCancel={() => setExitConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function SheetSyncBadge({
  status,
  lastAt,
}: {
  status: 'idle' | 'syncing' | 'ok' | 'error';
  lastAt: number | null;
}) {
  // Compact, low-noise indicator that the sheet is round-tripping. Hovering
  // shows the last sync time; the dot pulses while a tick is mid-flight,
  // turns red on error, green when the latest tick succeeded.
  const tone =
    status === 'error'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : status === 'syncing'
        ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
        : status === 'ok'
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200';
  const dot =
    status === 'error'
      ? 'bg-red-500'
      : status === 'syncing'
        ? 'animate-pulse bg-aegis-blue'
        : status === 'ok'
          ? 'bg-emerald-500'
          : 'bg-aegis-gray-300';
  const title =
    status === 'error'
      ? 'Sheet sync failed — check your Google connection.'
      : lastAt
        ? `Last synced at ${new Date(lastAt).toLocaleTimeString()}`
        : 'Two-way sync with the bound Google Sheet.';
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset',
        tone,
      ].join(' ')}
      title={title}
    >
      <span className={['h-1.5 w-1.5 rounded-full', dot].join(' ')} aria-hidden />
      Sheet
    </span>
  );
}

function ConnectionBadge({
  online,
  realtimeConnected,
  syncing,
  pending,
}: {
  online: boolean;
  realtimeConnected: boolean;
  syncing: boolean;
  pending: number;
}) {
  // Five visual states, ordered worst-to-best so the most attention-grabbing
  // condition wins:
  //   1. Offline + queued      → red, bold "Offline · N pending"
  //   2. Offline (no queue)    → red "Offline"
  //   3. Online + draining     → blue pulse "Syncing N…"
  //   4. Online + queued idle  → amber "Queued · N" (rare — drain effect
  //                              flips us into syncing almost immediately)
  //   5. Online + realtime     → green pulse "Live"
  //   6. Online, realtime down → grey "Connecting…"
  let tone: 'red' | 'blue' | 'amber' | 'green' | 'gray' = 'green';
  let label = 'Live';
  let pulse = true;
  let title = 'Live sync with other kiosks';

  if (!online) {
    tone = 'red';
    label = pending > 0 ? `Offline · ${pending} pending` : 'Offline';
    pulse = pending > 0;
    title = pending > 0
      ? `Offline. ${pending} check-in${pending === 1 ? '' : 's'} queued — will sync automatically when wifi returns. Don't close this tab.`
      : 'Offline. Check-ins will be queued and synced when wifi returns.';
  } else if (syncing) {
    tone = 'blue';
    label = `Syncing ${pending}…`;
    title = `Syncing ${pending} queued check-in${pending === 1 ? '' : 's'} to the server.`;
  } else if (pending > 0) {
    tone = 'amber';
    label = `Queued · ${pending}`;
    title = `${pending} check-in${pending === 1 ? '' : 's'} pending sync.`;
  } else if (!realtimeConnected) {
    tone = 'gray';
    label = 'Connecting…';
    pulse = false;
    title = 'Connecting to live updates. Check-ins still save.';
  }

  const palette = {
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    gray: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  } as const;
  const dot = {
    red: 'bg-red-500',
    blue: 'bg-aegis-blue',
    amber: 'bg-amber-500',
    green: 'bg-emerald-500',
    gray: 'bg-aegis-gray-300',
  } as const;

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ring-1 ring-inset',
        palette[tone],
      ].join(' ')}
      title={title}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          dot[tone],
          pulse ? 'animate-pulse' : '',
        ].join(' ')}
        aria-hidden
      />
      {label}
    </span>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-aegis-gray-500">
      {children}
    </h2>
  );
}

function GuestCard({
  guest,
  classified,
  checkedIn,
  pending,
  onPick,
  tone,
}: {
  guest: EventGuest;
  classified: Classified;
  checkedIn: boolean;
  pending: boolean;
  onPick: (g: EventGuest) => void;
  tone: 'primary' | 'secondary';
}) {
  const sizeClasses =
    tone === 'primary'
      ? 'min-h-[88px] px-5 py-4 sm:min-h-[96px] sm:px-6 sm:py-5'
      : 'min-h-[68px] px-4 py-3 sm:px-5 sm:py-4';
  const nameClasses =
    tone === 'primary'
      ? 'text-base font-semibold sm:text-lg'
      : 'text-sm font-medium sm:text-base';
  const subClasses =
    tone === 'primary' ? 'text-[12px] sm:text-[13px]' : 'text-[11px] sm:text-xs';

  return (
    <li className={tone === 'primary' ? '' : ''}>
      <button
        type="button"
        onClick={() => onPick(guest)}
        disabled={pending}
        className={[
          'flex w-full items-center justify-between gap-3 rounded-2xl text-left transition-colors active:scale-[0.99]',
          tone === 'primary'
            ? checkedIn
              ? 'border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50'
              : 'border border-aegis-gray-100 bg-white hover:bg-aegis-navy-50/40 active:bg-aegis-navy-50/60'
            : checkedIn
              ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
              : 'hover:bg-aegis-navy-50/40',
          'disabled:opacity-60',
          sizeClasses,
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <p className={`${nameClasses} text-aegis-navy`}>
            {highlight(displayName(guest.full_name), classified)}
          </p>
          <p className={`${subClasses} mt-0.5 text-aegis-gray-500`}>
            {[
              guest.title ? displayName(guest.title) : null,
              guest.company ? displayCompany(guest.company) : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
            {guest.contact_number && (
              <>
                {' · '}
                {classified.isPhone
                  ? highlight(displayPhone(guest.contact_number), classified)
                  : displayPhone(guest.contact_number)}
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {guest.table_number && (
            <span
              className={[
                'inline-flex items-center gap-1.5 rounded-lg bg-aegis-gold-50 font-bold tabular-nums text-aegis-orange-600 ring-1 ring-inset ring-aegis-gold/40',
                tone === 'primary'
                  ? 'px-3 py-1.5 text-sm shadow-sm sm:text-base'
                  : 'px-2 py-1 text-xs sm:text-sm',
              ].join(' ')}
            >
              <svg
                className={tone === 'primary' ? 'h-4 w-4 sm:h-4.5 sm:w-4.5' : 'h-3.5 w-3.5'}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 10h18M5 10v10M19 10v10M3 6h18" />
              </svg>
              <span className="font-semibold uppercase tracking-wide opacity-70">
                Table
              </span>
              <span className="text-[1.1em] leading-none">
                {guest.table_number}
              </span>
            </span>
          )}
          {checkedIn ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:text-xs">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12l5 5 9-11" />
              </svg>
              Checked in
            </span>
          ) : tone === 'primary' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-aegis-orange px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm sm:text-sm">
              Tap to check in
            </span>
          ) : (
            <span className="text-[11px] font-medium uppercase tracking-wide text-aegis-orange">
              Check in
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function ToastSuccess({
  name,
  company,
  table,
  already,
  queued,
  onUndo,
  onClose,
}: {
  name: string;
  company: string | null;
  table: string | null;
  already: boolean;
  queued: boolean;
  onUndo: (() => void) | null;
  onClose: () => void;
}) {
  // Three visual variants:
  //   • Already checked in → blue tint, low-key (informational).
  //   • Queued offline     → amber tint with the "WILL SYNC" caption so
  //                          the usher knows the action is captured but
  //                          not yet committed server-side.
  //   • Online committed   → emerald, default celebratory state.
  const variant: 'already' | 'queued' | 'committed' = already
    ? 'already'
    : queued
      ? 'queued'
      : 'committed';
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:items-center sm:justify-center sm:p-6"
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          'pointer-events-auto w-full max-w-md rounded-2xl px-5 py-4 shadow-2xl ring-1 sm:px-6 sm:py-5',
          variant === 'already'
            ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
            : variant === 'queued'
              ? 'bg-amber-500 text-white ring-amber-700/20'
              : 'bg-emerald-600 text-white ring-emerald-700/20',
        ].join(' ')}
      >
        <div className="flex items-stretch gap-3">
          <div
            className={[
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full self-start',
              variant === 'already' ? 'bg-aegis-blue/20' : 'bg-white/20',
            ].join(' ')}
          >
            <svg
              className={`h-7 w-7 ${variant === 'already' ? 'text-aegis-navy' : 'text-white'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12l5 5 9-11" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={[
                'text-[10px] font-semibold uppercase tracking-[0.12em]',
                variant === 'already' ? 'text-aegis-navy/70' : 'text-white/80',
              ].join(' ')}
            >
              {variant === 'already'
                ? 'Already checked in'
                : variant === 'queued'
                  ? 'Checked in · Queued · Will sync'
                  : 'Checked in'}
            </p>
            <p className="mt-0.5 truncate text-lg font-semibold sm:text-xl">{name}</p>
            {company && (
              <p
                className={[
                  'truncate text-sm',
                  variant === 'already' ? 'text-aegis-navy/80' : 'text-white/85',
                ].join(' ')}
              >
                {company}
              </p>
            )}
          </div>
          {/* Big table-number block — usher's eye lands here first so they
              can guide the guest without re-reading the row. Falls back to
              "—" so the layout doesn't jump around for guests with no
              table assignment. */}
          <div
            className={[
              'flex shrink-0 flex-col items-center justify-center rounded-xl px-3 py-2 text-center',
              variant === 'already'
                ? 'bg-white text-aegis-navy ring-1 ring-aegis-blue/40'
                : variant === 'queued'
                  ? 'bg-white text-amber-600 ring-1 ring-white/30'
                  : 'bg-white text-emerald-700 ring-1 ring-white/30',
            ].join(' ')}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-60">
              Table
            </p>
            <p className="mt-0.5 text-3xl font-black leading-none tabular-nums sm:text-4xl">
              {table ?? '—'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 self-start">
            {variant !== 'already' && onUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/25"
              >
                Undo
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className={[
                'inline-flex h-8 w-8 items-center justify-center rounded-md',
                variant === 'already'
                  ? 'text-aegis-navy/60 hover:bg-aegis-blue/20'
                  : 'text-white/80 hover:bg-white/15',
              ].join(' ')}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToastError({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:items-center sm:justify-center sm:p-6"
      role="alert"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-red-600 px-5 py-4 text-white shadow-2xl ring-1 ring-red-700/20 sm:px-6 sm:py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85">
            Check-in failed
          </p>
          <p className="mt-0.5 text-sm">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/15"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function ExitConfirm({
  eventId,
  onCancel,
}: {
  eventId: string;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-aegis-navy/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <h2 className="text-base font-semibold text-aegis-navy sm:text-lg">
          Exit kiosk mode?
        </h2>
        <p className="mt-1 text-sm text-aegis-gray-500">
          You&apos;ll return to the event page. Anyone with this device will be
          able to edit the event — close the browser if you&apos;re handing it
          back to a guest.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-aegis-gray-200 bg-white px-4 text-sm font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
            Stay in kiosk
          </button>
          <Link
            href={`/events/${eventId}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-aegis-orange px-4 text-sm font-semibold text-white hover:bg-aegis-orange-600"
          >
            Exit
          </Link>
        </div>
      </div>
    </div>
  );
}
