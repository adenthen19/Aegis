// Bursa Malaysia regulatory deadline helpers.
//
// What this models (sourced from Bursa Listing Requirements, Main + ACE):
//   • Quarterly results (Q1, Q2, Q3): announce within 2 months of quarter-end.
//   • Annual results (Q4 / audited): within 2 months unaudited; the audited
//     full-year results must be announced within 4 months of FY-end.
//   • Annual report: issued to shareholders within 4 months of FY-end.
//   • AGM: held within 6 months of FY-end.
//
// We seed these as one-off deliverables under an engagement, anchored to the
// fiscal year(s) that overlap the engagement's start/end dates. Each row gets
// an `auto_generated_key` so the seeder is idempotent — re-running it adds
// only the rows that don't yet exist.

import type { createClient } from '@/lib/supabase/server';
import type { ServiceTier } from '@/lib/types';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type FiscalYearEnd = { month: number; day: number };

export type RegulatoryEvent = {
  auto_generated_key: string;
  label: string;
  due_date: string; // ISO date (YYYY-MM-DD)
};

function parseFinancialYearEnd(fye: string | null | undefined): FiscalYearEnd | null {
  if (!fye) return null;
  const m = /^(\d{2})-(\d{2})$/.exec(fye.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function addMonths(year: number, monthIdx: number, day: number, monthsToAdd: number): Date {
  // Postgres-safe date arithmetic: add months and clamp to last day of target
  // month (so e.g. Aug 31 + 1 month → Sep 30, not Oct 1).
  const target = new Date(Date.UTC(year, monthIdx + monthsToAdd, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * For a given financial year end and a fiscal year ending in `fyEndYear`,
 * compute the regulatory events: 4 quarterly results, 1 annual report,
 * 1 AGM. Returns events with stable auto_generated_keys.
 *
 * Convention: a fiscal year is identified by the calendar year of its end
 * date (e.g. FYE Dec 31 2026 → fyEndYear = 2026).
 */
function eventsForFiscalYear(fye: FiscalYearEnd, fyEndYear: number): RegulatoryEvent[] {
  // FY end date.
  const fyEnd = new Date(Date.UTC(fyEndYear, fye.month - 1, fye.day));
  // FY start date is one day after the previous FY end.
  // For quarter-ends we walk backwards from FY end:
  //   Q4 end = FY end
  //   Q3 end = FY end − 3 months
  //   Q2 end = FY end − 6 months
  //   Q1 end = FY end − 9 months
  const q4End = fyEnd;
  const q3End = addMonths(fyEndYear, fye.month - 1, fye.day, -3);
  const q2End = addMonths(fyEndYear, fye.month - 1, fye.day, -6);
  const q1End = addMonths(fyEndYear, fye.month - 1, fye.day, -9);

  // Deadlines:
  //   Quarterly results announcement = quarter-end + 2 months.
  //   Audited full-year results = FY end + 4 months.
  //   Annual report (issuance) = FY end + 4 months.
  //   AGM = FY end + 6 months.
  function quarterlyDue(qEnd: Date): string {
    const due = addMonths(qEnd.getUTCFullYear(), qEnd.getUTCMonth(), qEnd.getUTCDate(), 2);
    return toIso(due);
  }
  function fromFyEnd(months: number): string {
    const due = addMonths(fyEndYear, fye.month - 1, fye.day, months);
    return toIso(due);
  }

  const fyLabel = `FY${fyEndYear}`;
  return [
    {
      auto_generated_key: `bursa:results_q1:${fyEndYear}`,
      label: `${fyLabel} Q1 results announcement (within 2 months of quarter-end ${toIso(q1End)})`,
      due_date: quarterlyDue(q1End),
    },
    {
      auto_generated_key: `bursa:results_q2:${fyEndYear}`,
      label: `${fyLabel} Q2 results announcement (within 2 months of quarter-end ${toIso(q2End)})`,
      due_date: quarterlyDue(q2End),
    },
    {
      auto_generated_key: `bursa:results_q3:${fyEndYear}`,
      label: `${fyLabel} Q3 results announcement (within 2 months of quarter-end ${toIso(q3End)})`,
      due_date: quarterlyDue(q3End),
    },
    {
      auto_generated_key: `bursa:results_q4:${fyEndYear}`,
      label: `${fyLabel} Q4 / annual results announcement (within 2 months of quarter-end ${toIso(q4End)})`,
      due_date: quarterlyDue(q4End),
    },
    {
      auto_generated_key: `bursa:annual_report:${fyEndYear}`,
      label: `${fyLabel} annual report issuance (within 4 months of FY end)`,
      due_date: fromFyEnd(4),
    },
    {
      auto_generated_key: `bursa:agm:${fyEndYear}`,
      label: `${fyLabel} AGM (within 6 months of FY end)`,
      due_date: fromFyEnd(6),
    },
  ];
}

/**
 * Returns regulatory events for the fiscal year(s) whose end date falls
 * inside the engagement period. We anchor on FY-end (rather than overlap)
 * because the entire results / AGM cadence is keyed to FY-end; if the
 * engagement covers an FY end, all its quarterly + annual events fall
 * inside or shortly after it.
 *
 * If end_date is null we treat the engagement as open-ended and just emit
 * events for the FY that ends within the next 12 months from start.
 */
export function regulatoryEventsForEngagement(args: {
  fye: string | null;
  start_date: string;
  end_date: string | null;
}): RegulatoryEvent[] {
  const fye = parseFinancialYearEnd(args.fye);
  if (!fye) return [];

  const start = new Date(args.start_date);
  const end = args.end_date
    ? new Date(args.end_date)
    : addMonths(
        start.getUTCFullYear() + 1,
        start.getUTCMonth(),
        start.getUTCDate(),
        0,
      );

  // Iterate fiscal years whose end date is within [start, end].
  const events: RegulatoryEvent[] = [];
  for (let year = start.getUTCFullYear() - 1; year <= end.getUTCFullYear() + 1; year++) {
    const fyEnd = new Date(Date.UTC(year, fye.month - 1, fye.day));
    if (fyEnd < start || fyEnd > end) continue;
    events.push(...eventsForFiscalYear(fye, year));
  }
  return events;
}

/**
 * Insert any missing regulatory deliverables for an engagement. Existing rows
 * (matched by auto_generated_key) are left alone — including any user edits
 * to label, due_date, status, or notes.
 *
 * Service tier is required because client_deliverables has a NOT NULL
 * service_tier column. We tag regulatory events with a tier from the
 * engagement's tier list, preferring 'ir' if present (these are IR
 * compliance deliverables); otherwise the first tier on the engagement.
 */
export async function seedRegulatoryDeliverables(
  supabase: SupabaseClient,
  args: {
    engagement_id: string;
    client_id: string;
    fye: string | null;
    start_date: string;
    end_date: string | null;
    service_tiers: ServiceTier[];
  },
): Promise<void> {
  const events = regulatoryEventsForEngagement({
    fye: args.fye,
    start_date: args.start_date,
    end_date: args.end_date,
  });
  if (events.length === 0) return;

  const tier: ServiceTier = args.service_tiers.includes('ir')
    ? 'ir'
    : (args.service_tiers[0] ?? 'ir');

  const { data: existing } = await supabase
    .from('client_deliverables')
    .select('auto_generated_key')
    .eq('engagement_id', args.engagement_id)
    .not('auto_generated_key', 'is', null);

  const seeded = new Set(
    (existing ?? []).map((r) => r.auto_generated_key as string),
  );

  const toInsert = events
    .filter((e) => !seeded.has(e.auto_generated_key))
    .map((e) => ({
      client_id: args.client_id,
      engagement_id: args.engagement_id,
      template_id: null,
      service_tier: tier,
      kind: 'one_off' as const,
      label: e.label,
      target_count: null,
      due_date: e.due_date,
      auto_generated_key: e.auto_generated_key,
    }));

  if (toInsert.length === 0) return;
  await supabase.from('client_deliverables').insert(toInsert);
}

/**
 * For every quarterly results commitment under the engagement, ensure there
 * is an internal pre-work todo dated to the 1st of the deadline month. The
 * todo prompts the IR PIC to email + WhatsApp the client to confirm the
 * release date and request a draft of the results.
 *
 * Idempotent: keyed off `regulatory:prework:results_q{N}:{fyEndYear}` so
 * re-runs don't create duplicates. PIC defaults to the engagement creator;
 * if that's not available the row is left unassigned (visible to admins).
 */
export async function seedQuarterlyPreworkTodos(
  supabase: SupabaseClient,
  args: {
    engagement_id: string;
    client_id: string;
    pic_user_id: string | null;
    client_corporate_name: string | null;
  },
): Promise<void> {
  // Pull every quarterly results commitment we've seeded for this engagement.
  const { data: commitments } = await supabase
    .from('client_deliverables')
    .select('client_deliverable_id, auto_generated_key, due_date, label')
    .eq('engagement_id', args.engagement_id)
    .like('auto_generated_key', 'bursa:results_q%');

  if (!commitments || commitments.length === 0) return;

  // Find which commitments already have a pre-work todo so we don't duplicate.
  const ids = commitments.map((c) => c.client_deliverable_id as string);
  const { data: existingTodos } = await supabase
    .from('action_items')
    .select('client_deliverable_id, auto_generated_key')
    .in('client_deliverable_id', ids)
    .not('auto_generated_key', 'is', null);

  const existingPairs = new Set(
    (existingTodos ?? []).map(
      (r) =>
        `${r.client_deliverable_id as string}::${r.auto_generated_key as string}`,
    ),
  );

  const toInsert: Array<{
    client_id: string;
    client_deliverable_id: string;
    pic_user_id: string | null;
    item: string;
    due_date: string;
    auto_generated_key: string;
    meeting_id: null;
  }> = [];

  for (const c of commitments) {
    const key = c.auto_generated_key as string; // e.g. 'bursa:results_q1:2026'
    const m = /^bursa:results_q([1-4]):(\d{4})$/.exec(key);
    if (!m) continue;
    const quarter = m[1];
    const fyYear = m[2];
    const dueDate = c.due_date as string | null;
    if (!dueDate) continue;

    // First day of the deadline month — slice keeps YYYY-MM and we append -01.
    const preworkDue = `${dueDate.slice(0, 7)}-01`;
    const preworkKey = `regulatory:prework:results_q${quarter}:${fyYear}`;
    const pairId = `${c.client_deliverable_id as string}::${preworkKey}`;
    if (existingPairs.has(pairId)) continue;

    const clientLabel = args.client_corporate_name ?? 'this client';
    toInsert.push({
      client_id: args.client_id,
      client_deliverable_id: c.client_deliverable_id as string,
      pic_user_id: args.pic_user_id,
      item: `${clientLabel} — FY${fyYear} Q${quarter} results pre-work: email + WhatsApp the IR primary contact to (1) confirm target release date, (2) request a draft of the results so we can prepare the press release. Statutory deadline: ${dueDate}.`,
      due_date: preworkDue,
      auto_generated_key: preworkKey,
      meeting_id: null,
    });
  }

  if (toInsert.length === 0) return;
  await supabase.from('action_items').insert(toInsert);
}
