// Bursa Malaysia "closed period" / blackout awareness.
//
// Per Bursa Listing Requirements, the 30 calendar days immediately preceding
// the announcement of quarterly results (and ending on the day of the
// announcement) is a closed period. During this window, directors and
// principal officers can't trade, and — practically — the IR firm should
// avoid distributing material non-public info, hosting analyst briefings on
// unannounced numbers, or otherwise leaking results before they're filed.
//
// This file is the single source of truth for blackout windows. Each window
// derives from a `bursa:results_q*` regulatory commitment's due_date — the
// closed period is [due_date - 30 days, due_date].

import type { ClientDeliverable } from '@/lib/types';

const BLACKOUT_DAYS = 30;

export type BlackoutWindow = {
  // Auto-generated key of the source quarterly-results commitment.
  source_key: string;
  // Pretty label, e.g. "FY2026 Q1".
  label: string;
  // Window bounds (inclusive on both ends).
  start: Date;
  end: Date;
  // Days remaining until end (negative if already passed).
  days_to_end: number;
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function parseDateOnly(iso: string): Date {
  // YYYY-MM-DD only — anchor to UTC midnight, then bring back to local date.
  // Avoids timezone drift bumping the boundary by a day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isInWindow(today: Date, start: Date, end: Date): boolean {
  return today >= start && today <= end;
}

/**
 * Compute every blackout window derived from a list of client deliverables.
 * Filters to only `bursa:results_q*` keys with a due_date set. Output is
 * sorted by window end ascending so callers can pick the most imminent.
 */
export function blackoutWindowsFor(
  deliverables: ClientDeliverable[],
): BlackoutWindow[] {
  const now = startOfDay(new Date());
  const windows: BlackoutWindow[] = [];
  for (const d of deliverables) {
    const key = d.auto_generated_key;
    if (!key) continue;
    const m = /^bursa:results_q([1-4]):(\d{4})$/.exec(key);
    if (!m) continue;
    if (!d.due_date) continue;
    const end = startOfDay(parseDateOnly(d.due_date));
    const start = new Date(end);
    start.setDate(end.getDate() - BLACKOUT_DAYS);
    const days_to_end = Math.round(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    windows.push({
      source_key: key,
      label: `FY${m[2]} Q${m[1]}`,
      start,
      end,
      days_to_end,
    });
  }
  windows.sort((a, b) => a.end.getTime() - b.end.getTime());
  return windows;
}

/**
 * The currently-active blackout window for a list of deliverables, if any.
 * If today falls inside multiple overlapping windows (rare — only happens
 * for non-Dec FYE clients near the end-of-year boundary) returns the one
 * ending soonest, since that's the more pressing publication date.
 */
export function currentBlackout(
  deliverables: ClientDeliverable[],
  today: Date = new Date(),
): BlackoutWindow | null {
  const t = startOfDay(today);
  const all = blackoutWindowsFor(deliverables);
  for (const w of all) {
    if (isInWindow(t, w.start, w.end)) return w;
  }
  return null;
}
