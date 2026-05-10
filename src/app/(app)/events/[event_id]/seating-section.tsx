'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Modal from '@/components/ui/modal';
import { FormError, NumberField, SelectField, TextField } from '@/components/ui/form';
import { Section } from '@/components/detail-shell';
import {
  GUEST_TIER_CHIP_CLASS,
  GUEST_TIER_LABEL,
  TABLE_SECTION_LABEL,
  type EventGuest,
  type EventRoomMarker,
  type EventTable,
  type GuestTier,
  type TableSection,
} from '@/lib/types';
import {
  buildTableRows,
  CAPACITY_TONE_CLASS,
  capacityTone,
  type TableRow,
} from '@/lib/seating';
import { displayCompany, displayName } from '@/lib/display-format';
import {
  deleteEventTableAction,
  setEventDefaultCapacityAction,
  upsertEventTableAction,
} from '../actions';
import SwapTablesModal from './swap-tables-modal';
import FloorPlanView from './floor-plan-view';

// Render order for the section-grouped table list. Matches the typical
// IPO room layout: VIPs front, analysts middle, KOL/media behind, mixed
// catch-all last. Sections that have no tables are skipped.
const SECTION_ORDER: TableSection[] = [
  'vip',
  'analyst',
  'kol',
  'media',
  'mixed',
];

// Tier weight for sorting guests inside an expanded table — VIPs sit
// at the top of the list, then analysts, then KOLs, then media,
// standard last.
const TIER_WEIGHT: Record<GuestTier, number> = {
  vip: 0,
  analyst: 1,
  kol: 2,
  media: 3,
  standard: 4,
};

type SeatingView = 'list' | 'floor';

const SECTION_OPTIONS: TableSection[] = ['vip', 'analyst', 'kol', 'media', 'mixed'];

export default function SeatingSection({
  eventId,
  defaultCapacity,
  tables,
  guests,
  markers,
}: {
  eventId: string;
  defaultCapacity: number | null;
  tables: EventTable[];
  guests: EventGuest[];
  markers: EventRoomMarker[];
}) {
  const rows = useMemo(
    () => buildTableRows(guests, tables, defaultCapacity),
    [guests, tables, defaultCapacity],
  );

  // Live sync from kiosk check-ins, walk-ins, table edits, and floor
  // plan saves. Without this, the seating tab is a stale snapshot at
  // page load — an usher's tap on the kiosk wouldn't update the
  // section totals, the per-table guest count, or the canvas. Same
  // pattern as the kiosk's realtime hook (auth-aware, token-refresh
  // listener), watching every event-scoped table the seating UI
  // renders from.
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        supabase.realtime.setAuth(session.access_token);
      }
      channel = supabase
        .channel(`seating-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_guests',
            filter: `event_id=eq.${eventId}`,
          },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_tables',
            filter: `event_id=eq.${eventId}`,
          },
          () => router.refresh(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'event_room_markers',
            filter: `event_id=eq.${eventId}`,
          },
          () => router.refresh(),
        )
        .subscribe();
    })();

    const { data: authSub } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.access_token) {
          supabase.realtime.setAuth(session.access_token);
        }
      },
    );

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, router]);

  const [defaultModalOpen, setDefaultModalOpen] = useState(false);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [editing, setEditing] = useState<
    { mode: 'add' } | { mode: 'edit'; row: TableRow } | null
  >(null);
  const [view, setView] = useState<SeatingView>('list');

  const overCapacityCount = rows.filter(
    (r) => r.capacity != null && r.used > r.capacity,
  ).length;

  return (
    <Section
      title="Seating"
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSwapModalOpen(true)}
            disabled={rows.every((r) => r.used === 0)}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50 disabled:opacity-50"
            title={
              rows.every((r) => r.used === 0)
                ? 'Add guests first — there are no tables in use to move.'
                : 'Bulk move or swap entire tables'
            }
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4" />
            </svg>
            Move / swap
          </button>
          <button
            type="button"
            onClick={() => setEditing({ mode: 'add' })}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add table
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {/* ── Default capacity row ───────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-aegis-gray-50/60 px-4 py-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
              Default pax per table
            </p>
            <p className="mt-0.5 text-sm text-aegis-gray">
              {defaultCapacity != null ? (
                <>
                  <span className="text-base font-semibold text-aegis-navy tabular-nums">
                    {defaultCapacity}
                  </span>{' '}
                  guests / table
                </>
              ) : (
                <span className="italic text-aegis-gray-500">
                  Not set — capacity warnings are off
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDefaultModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
            {defaultCapacity != null ? 'Edit default' : 'Set default'}
          </button>
        </div>

        {overCapacityCount > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              {overCapacityCount} table
              {overCapacityCount === 1 ? ' is' : 's are'} over capacity. Adjust
              the limit or move guests before doors open.
            </span>
          </div>
        )}

        {/* ── View toggle: list vs floor plan ───────────────── */}
        <div className="inline-flex rounded-md border border-aegis-gray-200 bg-white p-0.5">
          <ViewTab
            active={view === 'list'}
            onClick={() => setView('list')}
            label="List"
            icon={
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            }
          />
          <ViewTab
            active={view === 'floor'}
            onClick={() => setView('floor')}
            label="Floor plan"
            icon={
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            }
          />
        </div>

        {view === 'floor' ? (
          <FloorPlanView
            eventId={eventId}
            guests={guests}
            tables={tables}
            defaultCapacity={defaultCapacity}
            markers={markers}
          />
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-aegis-gray-200 px-4 py-8 text-center">
            <p className="text-sm text-aegis-gray-500">
              No tables yet. Add overrides for non-standard tables (head table,
              VIP), or just import your guest list — tables are auto-detected
              from guest assignments.
            </p>
          </div>
        ) : (
          <TableListGrouped
            eventId={eventId}
            rows={rows}
            guests={guests}
            onEdit={(row) => setEditing({ mode: 'edit', row })}
          />
        )}

        <p className="text-[11px] text-aegis-gray-300">
          Capacity is a soft target — kiosks warn but never block check-in.
          Overrides win over the default; tables without an override fall back
          to the default capacity.
        </p>
      </div>

      <DefaultCapacityModal
        eventId={eventId}
        current={defaultCapacity}
        open={defaultModalOpen}
        onClose={() => setDefaultModalOpen(false)}
      />
      <TableEditorModal
        eventId={eventId}
        editing={editing}
        onClose={() => setEditing(null)}
      />
      <SwapTablesModal
        eventId={eventId}
        guests={guests}
        tables={tables}
        defaultCapacity={defaultCapacity}
        open={swapModalOpen}
        onClose={() => setSwapModalOpen(false)}
      />
    </Section>
  );
}

function ViewTab({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-aegis-navy text-white'
          : 'text-aegis-gray hover:bg-aegis-gray-50',
      ].join(' ')}
    >
      {icon}
      {label}
    </button>
  );
}

function DeleteOverrideButton({
  eventId,
  tableNumber,
}: {
  eventId: string;
  tableNumber: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !window.confirm(
            `Remove the capacity override for Table ${tableNumber}? It will fall back to the event default. Guest assignments are unaffected.`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteEventTableAction(eventId, tableNumber);
        });
      }}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 sm:h-7 sm:w-7"
      aria-label={`Remove override for Table ${tableNumber}`}
      title="Remove override"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
      </svg>
    </button>
  );
}

function DefaultCapacityModal({
  eventId,
  current,
  open,
  onClose,
}: {
  eventId: string;
  current: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState<string>(current != null ? String(current) : '');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    let next: number | null;
    if (trimmed === '') {
      next = null;
    } else {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a positive whole number, or leave blank to disable warnings.');
        return;
      }
      next = parsed;
    }
    startTransition(async () => {
      const res = await setEventDefaultCapacityAction(eventId, next);
      if (!res.ok) {
        setError(res.error ?? 'Failed to save.');
        return;
      }
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Default pax per table"
      description="The standard table size for this event. Per-table overrides win over this default. Leave blank to turn capacity warnings off entirely."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor="default_table_capacity_modal"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
          >
            Default capacity
          </label>
          <input
            id="default_table_capacity_modal"
            type="number"
            min={1}
            max={50}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 10"
            className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm tabular-nums outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
          />
          <p className="mt-1 text-[11px] text-aegis-gray-300">
            Blank = no capacity warnings on the kiosk.
          </p>
        </div>
        <FormError message={error} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TableEditorModal({
  eventId,
  editing,
  onClose,
}: {
  eventId: string;
  editing: { mode: 'add' } | { mode: 'edit'; row: TableRow } | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) return null;
  const initial =
    editing.mode === 'edit'
      ? {
          table_number: editing.row.table_number,
          capacity: editing.row.capacity ?? '',
          label: editing.row.label ?? '',
          section: editing.row.section,
        }
      : { table_number: '', capacity: '', label: '', section: 'mixed' as TableSection };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const tableNumber = (formData.get('table_number')?.toString() ?? '').trim();
    if (!tableNumber) {
      setError('Table number is required.');
      return;
    }
    const capacityRaw = (formData.get('capacity')?.toString() ?? '').trim();
    const capacity = Number.parseInt(capacityRaw, 10);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setError('Capacity must be a positive whole number.');
      return;
    }
    const label = formData.get('label')?.toString().trim() || null;
    const sectionRaw = formData.get('section')?.toString();
    const section: TableSection = SECTION_OPTIONS.includes(
      sectionRaw as TableSection,
    )
      ? (sectionRaw as TableSection)
      : 'mixed';

    startTransition(async () => {
      const res = await upsertEventTableAction(
        eventId,
        tableNumber,
        capacity,
        label,
        section,
      );
      if (!res.ok) {
        setError(res.error ?? 'Failed to save.');
        return;
      }
      onClose();
    });
  }

  return (
    <Modal
      open={!!editing}
      onClose={onClose}
      title={editing.mode === 'add' ? 'Add table' : `Table ${initial.table_number}`}
      description={
        editing.mode === 'add'
          ? 'Pre-register an empty table or set a non-default capacity. Adding here is optional — guest imports auto-detect the table list.'
          : 'Set a custom capacity or label for this table. Removing the override (trash icon on the row) sends it back to the event default.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <TextField
          name="table_number"
          label="Table number"
          required
          placeholder='e.g. 1, 12, "VIP-A", "Stage Left"'
          defaultValue={initial.table_number}
        />
        <NumberField
          name="capacity"
          label="Capacity"
          required
          min={1}
          max={50}
          placeholder="e.g. 12"
          defaultValue={initial.capacity ? String(initial.capacity) : undefined}
          hint="Pax this table can seat for THIS event."
        />
        <SelectField
          name="section"
          label="Section"
          defaultValue={initial.section}
          options={SECTION_OPTIONS.map((s) => ({
            value: s,
            label: TABLE_SECTION_LABEL[s],
          }))}
          hint="Which audience this table is reserved for. Kiosk soft-warns when a guest's tier doesn't match — usher can override."
        />
        <TextField
          name="label"
          label="Label"
          placeholder="e.g. Head Table, Sponsors, VIP Round"
          defaultValue={initial.label}
        />
        <FormError message={error} />
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section-grouped table list with expandable rows.
//
// Rebuilt from a flat list to give the seating workspace a clearer
// scan: tables cluster under their audience section (VIP / Analyst /
// KOL / Media / Mixed), and each row can expand to show the seated
// guests inline so the host doesn't have to flip to the guest tab to
// see who's at table 5.
// ─────────────────────────────────────────────────────────────────────

// Solid section accent used for the section header dot — saturated
// version of the chip palette, mirrors the floor-plan stripe colour.
const SECTION_DOT_CLASS: Record<TableSection, string> = {
  vip: 'bg-aegis-orange',
  analyst: 'bg-aegis-blue',
  kol: 'bg-violet-500',
  media: 'bg-rose-500',
  mixed: 'bg-aegis-gray-300',
};

function TableListGrouped({
  eventId,
  rows,
  guests,
  onEdit,
}: {
  eventId: string;
  rows: TableRow[];
  guests: EventGuest[];
  onEdit: (row: TableRow) => void;
}) {
  const guestsByTable = useMemo(() => {
    const map = new Map<string, EventGuest[]>();
    for (const g of guests) {
      const t = g.table_number?.trim();
      if (!t) continue;
      const list = map.get(t);
      if (list) list.push(g);
      else map.set(t, [g]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
        const tw = TIER_WEIGHT[a.tier] - TIER_WEIGHT[b.tier];
        if (tw !== 0) return tw;
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return map;
  }, [guests]);

  const grouped = useMemo(() => {
    const map = new Map<TableSection, TableRow[]>();
    for (const r of rows) {
      const arr = map.get(r.section) ?? [];
      arr.push(r);
      map.set(r.section, arr);
    }
    return SECTION_ORDER.filter((s) => (map.get(s) ?? []).length > 0).map(
      (s) => ({ section: s, rows: map.get(s) ?? [] }),
    );
  }, [rows]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(tableNumber: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tableNumber)) next.delete(tableNumber);
      else next.add(tableNumber);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ section, rows: sectionRows }) => {
        const totalSeated = sectionRows.reduce((acc, r) => acc + r.used, 0);
        const totalCap = sectionRows.reduce(
          (acc, r) => acc + (r.capacity ?? 0),
          0,
        );
        return (
          <section key={section}>
            <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-aegis-gray-500">
                <span
                  className={[
                    'inline-block h-2 w-2 rounded-full',
                    SECTION_DOT_CLASS[section],
                  ].join(' ')}
                  aria-hidden
                />
                {TABLE_SECTION_LABEL[section]}
                <span className="text-aegis-gray-300">
                  · {sectionRows.length} table{sectionRows.length === 1 ? '' : 's'}
                </span>
              </h3>
              <p className="text-[11px] tabular-nums text-aegis-gray-500">
                {totalSeated}
                <span className="opacity-60"> / </span>
                {totalCap > 0 ? totalCap : '—'}
              </p>
            </div>
            <ul className="divide-y divide-aegis-gray-100 overflow-hidden rounded-lg border border-aegis-gray-100 bg-white">
              {sectionRows.map((r) => {
                const seated = guestsByTable.get(r.table_number) ?? [];
                const isOpen = expanded.has(r.table_number);
                return (
                  <TableListRow
                    key={r.table_number}
                    eventId={eventId}
                    row={r}
                    seated={seated}
                    open={isOpen}
                    onToggle={() => toggle(r.table_number)}
                    onEdit={() => onEdit(r)}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TableListRow({
  eventId,
  row,
  seated,
  open,
  onToggle,
  onEdit,
}: {
  eventId: string;
  row: TableRow;
  seated: EventGuest[];
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const tone = capacityTone(row.used, row.capacity);
  return (
    <li>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <svg
            className={[
              'h-3.5 w-3.5 shrink-0 text-aegis-gray-400 transition-transform',
              open ? 'rotate-90' : '',
            ].join(' ')}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-aegis-navy">
            <span className="rounded bg-aegis-gold-50 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-gold/40">
              Table {row.table_number}
            </span>
            {row.label && (
              <span className="text-xs font-normal text-aegis-gray-500">
                {row.label}
              </span>
            )}
            {row.override && (
              <span className="rounded-full bg-aegis-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-aegis-navy ring-1 ring-inset ring-aegis-blue/30">
                Override
              </span>
            )}
          </p>
        </button>

        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
            CAPACITY_TONE_CLASS[tone],
          ].join(' ')}
        >
          {row.used}
          <span className="opacity-60">/</span>
          {row.capacity ?? '∞'}
          {row.capacity != null && row.used > row.capacity && (
            <span className="ml-1 uppercase tracking-wide">over</span>
          )}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="inline-flex items-center rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
            {row.override ? 'Edit' : 'Set capacity'}
          </button>
          {row.override && (
            <DeleteOverrideButton
              eventId={eventId}
              tableNumber={row.table_number}
            />
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-aegis-gray-100 bg-aegis-gray-50/40 px-4 py-3 sm:px-5">
          {seated.length === 0 ? (
            <p className="py-2 text-center text-[12px] italic text-aegis-gray-500">
              No guests seated at this table yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {seated.map((g) => (
                <li
                  key={g.guest_id}
                  className="flex items-start gap-2 text-[12px]"
                >
                  <span
                    className={[
                      'mt-1 inline-block h-2 w-2 shrink-0 rounded-full',
                      g.checked_in
                        ? 'bg-emerald-500'
                        : 'bg-white ring-1 ring-aegis-gray-300',
                    ].join(' ')}
                    aria-label={g.checked_in ? 'Checked in' : 'Not checked in'}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-aegis-navy">
                      {g.honorific && (
                        <span className="mr-1 text-aegis-orange-600">
                          {g.honorific}
                        </span>
                      )}
                      {displayName(g.preferred_name ?? g.full_name)}
                    </p>
                    <p className="truncate text-[11px] text-aegis-gray-500">
                      {[
                        g.title ? displayName(g.title) : null,
                        g.company ? displayCompany(g.company) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                  </div>
                  {GUEST_TIER_CHIP_CLASS[g.tier] && (
                    <span
                      className={[
                        'mt-0.5 inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                        GUEST_TIER_CHIP_CLASS[g.tier] as string,
                      ].join(' ')}
                    >
                      {GUEST_TIER_LABEL[g.tier]}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
