'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { displayCompany, displayName } from '@/lib/display-format';
import {
  GUEST_TIER_CHIP_CLASS,
  GUEST_TIER_LABEL,
  ROOM_MARKER_DEFAULT_SIZE,
  ROOM_MARKER_LABEL,
  TABLE_SECTION_LABEL,
  type EventGuest,
  type EventRoomMarker,
  type EventTable,
  type GuestTier,
  type RoomMarkerKind,
  type TableSection,
} from '@/lib/types';
import {
  buildTableRows,
  capacityTone,
  type TableRow,
} from '@/lib/seating';
import { saveEventLayoutAction } from '../actions';

// Free-form floor-plan canvas for an event's seating.
//
// Coordinate system: 1200×800 internal "canvas units". The DOM canvas
// is CSS-scaled to fit the available width; we convert pointer events
// from screen px to canvas units before applying. All saved x/y on
// event_tables and event_room_markers live in this same coordinate
// space.
//
// Two modes:
//   • View   — read-only. Hover/tap a table to see its guest list;
//              pointer events on the canvas are inert otherwise.
//   • Edit   — pointer-drag to move tables and markers, snap to a
//              10-unit grid. A toolbar lets the host insert new
//              markers (stage / door / podium / registration / custom).
//              Save commits the whole layout in one round-trip; Cancel
//              reverts to the last saved state.
//
// Tables without saved x/y get auto-positioned in deterministic section
// bands so every event has a usable layout from day one. Once the host
// drags any auto-positioned table, the next Save persists those coords.

const CANVAS_W = 1200;
const CANVAS_H = 800;
// 10-unit snap. Coarse enough that tables don't end up at 213.7 vs
// 217.2 after a few nudges; fine enough that rooms with non-symmetric
// layouts can still fit naturally.
const SNAP = 10;
// Diameter of a round table on the canvas. 96 fits 10-pax round tables
// comfortably without crowding the labels.
const TABLE_R = 48;
// Vertical spacing between the auto-arranged section bands.
const SECTION_BAND_GAP = 36;
// Inner margin from the canvas edge for any auto-arranged element.
const AUTO_MARGIN = 60;

const SECTION_ORDER: TableSection[] = [
  'vip',
  'analyst',
  'kol',
  'media',
  'mixed',
];

// Solid table fill per section. Picked to match the kiosk tier chip
// palette so the eye associates "blue table on canvas" with "blue
// analyst chip on the kiosk card".
const SECTION_FILL: Record<TableSection, string> = {
  vip: '#F4B844', // aegis gold
  analyst: '#5C7AA9', // aegis blue
  kol: '#8B5CF6', // violet-500
  media: '#F43F5E', // rose-500
  mixed: '#9CA3AF', // gray-400
};

// Faint tint for section zones (the rounded rectangles drawn behind
// tables of the same section). Same hue as SECTION_FILL but at low
// opacity so the rectangles read as "this area is the analyst block"
// without competing with the tables themselves. 'mixed' has no zone —
// the catch-all section doesn't deserve a visual cluster.
const SECTION_ZONE_FILL: Record<TableSection, string | null> = {
  vip: 'rgba(244, 184, 68, 0.10)',
  analyst: 'rgba(92, 122, 169, 0.10)',
  kol: 'rgba(139, 92, 246, 0.10)',
  media: 'rgba(244, 63, 94, 0.10)',
  mixed: null,
};

const SECTION_ZONE_BORDER: Record<TableSection, string | null> = {
  vip: 'rgba(244, 184, 68, 0.45)',
  analyst: 'rgba(92, 122, 169, 0.45)',
  kol: 'rgba(139, 92, 246, 0.45)',
  media: 'rgba(244, 63, 94, 0.45)',
  mixed: null,
};

// Background tint per kind for the marker rectangles. Stage gets a
// dark navy "spotlight" treatment so it dominates the canvas visually.
const MARKER_FILL: Record<RoomMarkerKind, string> = {
  stage: '#0F172A', // slate-900
  door: '#A78BFA', // violet-300
  entrance: '#34D399', // emerald-400
  podium: '#94A3B8', // slate-400
  registration: '#F59E0B', // amber-500
  custom: '#64748B', // slate-500
};

// Label colour for marker text — most kinds get white text on coloured
// fill, but a couple of light fills want dark text instead.
const MARKER_TEXT: Record<RoomMarkerKind, string> = {
  stage: 'white',
  door: 'white',
  entrance: 'white',
  podium: 'white',
  registration: 'white',
  custom: 'white',
};

// Local working copy of a table or marker on the canvas. We stage all
// edits in client state and only round-trip to the server on Save.
type DraftTable = {
  table_number: string;
  x: number;
  y: number;
  // Carried across so the popover / colouring don't have to reach back
  // into the row list on every render.
  row: TableRow;
};

type DraftMarker = {
  // Stable key for React. Either the persisted marker_id or a synthetic
  // 'new-{nanoid}' for unsaved markers — server replaces all on save so
  // the id only needs to be unique within the current edit session.
  id: string;
  kind: RoomMarkerKind;
  label: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
};

type DragState =
  | { kind: 'idle' }
  | {
      kind: 'table';
      table_number: string;
      // pointer offset within the element at drag start (canvas units).
      offsetX: number;
      offsetY: number;
    }
  | {
      kind: 'marker';
      id: string;
      offsetX: number;
      offsetY: number;
    };

type Props = {
  eventId: string;
  guests: EventGuest[];
  tables: EventTable[];
  defaultCapacity: number | null;
  markers: EventRoomMarker[];
};

export default function FloorPlanView({
  eventId,
  guests,
  tables,
  defaultCapacity,
  markers,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [pinnedTable, setPinnedTable] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Build the list of TableRows once and arrange them. Auto-positioning
  // for tables without saved x/y is deterministic — same input → same
  // canvas layout — so a host who never edits still sees a consistent
  // starting point.
  const rows = useMemo(
    () => buildTableRows(guests, tables, defaultCapacity),
    [guests, tables, defaultCapacity],
  );

  // Initial draft state. We re-derive whenever the upstream data
  // changes (e.g. a save lands and the page revalidates).
  const initialTables = useMemo<DraftTable[]>(
    () => arrangeTables(rows),
    [rows],
  );
  const initialMarkers = useMemo<DraftMarker[]>(
    () =>
      markers.map((m) => ({
        id: m.marker_id,
        kind: m.kind,
        label: m.label,
        x: m.x,
        y: m.y,
        w: m.w,
        h: m.h,
        rotation: m.rotation,
      })),
    [markers],
  );

  // Drafts are only used while the host is editing. In view mode we
  // render straight from the initial (server-truth) arrays, which means
  // a save + revalidate naturally flows in without any sync effect. We
  // seed the drafts from initial when the host enters edit mode.
  const [draftTables, setDraftTables] = useState<DraftTable[]>([]);
  const [draftMarkers, setDraftMarkers] = useState<DraftMarker[]>([]);

  // What's actually on the canvas right now.
  const tablesToShow = editing ? draftTables : initialTables;
  const markersToShow = editing ? draftMarkers : initialMarkers;

  // Section zones — bounding rectangles around each section's tables,
  // rendered behind the tables and markers as a quiet visual cluster.
  // The 'mixed' section is skipped (catch-all; no semantic zone).
  // Recomputed whenever the visible tables shift, including during
  // drags so the zone follows the table you're moving.
  const sectionZones = useMemo(() => {
    const PAD = 50; // canvas units of padding around the zone bbox
    const groups = new Map<TableSection, DraftTable[]>();
    for (const t of tablesToShow) {
      const s = t.row.section;
      if (s === 'mixed') continue;
      const arr = groups.get(s) ?? [];
      arr.push(t);
      groups.set(s, arr);
    }
    const zones: Array<{
      section: TableSection;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];
    for (const [section, group] of groups) {
      if (group.length === 0) continue;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const t of group) {
        if (t.x - TABLE_R / 2 < minX) minX = t.x - TABLE_R / 2;
        if (t.y - TABLE_R / 2 < minY) minY = t.y - TABLE_R / 2;
        if (t.x + TABLE_R / 2 > maxX) maxX = t.x + TABLE_R / 2;
        if (t.y + TABLE_R / 2 > maxY) maxY = t.y + TABLE_R / 2;
      }
      const x = Math.max(0, minX - PAD);
      const y = Math.max(0, minY - PAD);
      const w = Math.min(CANVAS_W - x, maxX - minX + PAD * 2);
      const h = Math.min(CANVAS_H - y, maxY - minY + PAD * 2);
      zones.push({ section, x, y, w, h });
    }
    return zones;
  }, [tablesToShow]);

  // Track a "dirty" flag so Save is enabled only when something
  // actually changed. Only meaningful while editing.
  const dirty = useMemo(() => {
    if (!editing) return false;
    if (draftTables.length !== initialTables.length) return true;
    const initialMap = new Map(
      initialTables.map((t) => [t.table_number, t] as const),
    );
    for (const t of draftTables) {
      const init = initialMap.get(t.table_number);
      if (!init || init.x !== t.x || init.y !== t.y) return true;
    }
    if (draftMarkers.length !== initialMarkers.length) return true;
    const initialMarkerMap = new Map(
      initialMarkers.map((m) => [m.id, m] as const),
    );
    for (const m of draftMarkers) {
      const init = initialMarkerMap.get(m.id);
      if (
        !init ||
        init.x !== m.x ||
        init.y !== m.y ||
        init.w !== m.w ||
        init.h !== m.h ||
        init.label !== m.label ||
        init.kind !== m.kind ||
        init.rotation !== m.rotation
      ) {
        return true;
      }
    }
    return false;
  }, [editing, draftTables, draftMarkers, initialTables, initialMarkers]);

  // Index guests by table_number for the popover. Same sort as before:
  // checked-in first, then by tier, then by name.
  const guestsByTable = useMemo(() => {
    const map = new Map<string, EventGuest[]>();
    for (const g of guests) {
      const t = g.table_number?.trim();
      if (!t) continue;
      const list = map.get(t);
      if (list) list.push(g);
      else map.set(t, [g]);
    }
    const tierWeight: Record<GuestTier, number> = {
      vip: 0,
      analyst: 1,
      kol: 2,
      media: 3,
      standard: 4,
    };
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
        const tw = tierWeight[a.tier] - tierWeight[b.tier];
        if (tw !== 0) return tw;
        return a.full_name.localeCompare(b.full_name);
      });
    }
    return map;
  }, [guests]);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ kind: 'idle' });
  // Suppress the synthetic click that follows a pointer-up after a drag.
  // Without this, every drag-release on a table fires the canvas-root
  // onClick → setPinnedTable(null), which immediately unpins whatever
  // popover the host had opened. We set this flag in onPointerUp when a
  // drag was active, then consume it in the click handler.
  const didDragRef = useRef(false);
  // Active snap guides. While dragging a table, if its centre lines up
  // with another table's centre (within SNAP_PROXIMITY canvas units),
  // we hard-snap to that x/y AND surface a guide line so the host sees
  // why the table just jumped. Cleared on pointer-up.
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>(
    { x: null, y: null },
  );

  // Convert a pointer event (in screen pixels) to canvas coordinates.
  // The canvas is CSS-scaled, so we have to divide by the current
  // scale factor.
  function pointerToCanvas(e: React.PointerEvent | PointerEvent): {
    x: number;
    y: number;
  } {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const scaleX = rect.width / CANVAS_W;
    const scaleY = rect.height / CANVAS_H;
    return {
      x: (e.clientX - rect.left) / scaleX,
      y: (e.clientY - rect.top) / scaleY,
    };
  }

  function snap(value: number): number {
    return Math.round(value / SNAP) * SNAP;
  }

  // Drag handlers — wired at the canvas root and dispatched per item.
  // setPointerCapture targets `currentTarget` (the element the listener
  // is bound to) rather than `e.target`, which can be a child element
  // that re-renders mid-drag and silently loses capture.
  function onPointerDownTable(
    e: React.PointerEvent,
    t: DraftTable,
  ) {
    if (!editing) return;
    e.stopPropagation();
    const pt = pointerToCanvas(e);
    dragRef.current = {
      kind: 'table',
      table_number: t.table_number,
      offsetX: pt.x - t.x,
      offsetY: pt.y - t.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerDownMarker(
    e: React.PointerEvent,
    m: DraftMarker,
  ) {
    if (!editing) return;
    e.stopPropagation();
    const pt = pointerToCanvas(e);
    dragRef.current = {
      kind: 'marker',
      id: m.id,
      // Offset is from the marker's TOP-LEFT (markers are rectangles
      // anchored top-left, unlike tables which use centre).
      offsetX: pt.x - m.x,
      offsetY: pt.y - m.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (drag.kind === 'idle') return;
    const pt = pointerToCanvas(e);
    if (drag.kind === 'table') {
      let nextX = clamp(
        snap(pt.x - drag.offsetX),
        TABLE_R / 2,
        CANVAS_W - TABLE_R / 2,
      );
      let nextY = clamp(
        snap(pt.y - drag.offsetY),
        TABLE_R / 2,
        CANVAS_H - TABLE_R / 2,
      );

      // Snap-to-neighbour: if the dragged table's centre is within
      // SNAP_PROXIMITY of another table's centre on either axis, hard
      // snap and surface a guide line so the host knows alignment is
      // intentional. We check x and y independently — a row of tables
      // can snap to the same y while keeping their own x.
      const SNAP_PROXIMITY = 12; // canvas units
      let guideX: number | null = null;
      let guideY: number | null = null;
      for (const other of draftTables) {
        if (other.table_number === drag.table_number) continue;
        if (Math.abs(other.x - nextX) <= SNAP_PROXIMITY) {
          nextX = other.x;
          guideX = other.x;
        }
        if (Math.abs(other.y - nextY) <= SNAP_PROXIMITY) {
          nextY = other.y;
          guideY = other.y;
        }
      }

      // Avoid spamming setState when the guides haven't changed —
      // snap state is per-axis, so unchanged values stay equal.
      setSnapGuides((prev) =>
        prev.x === guideX && prev.y === guideY ? prev : { x: guideX, y: guideY },
      );
      setDraftTables((prev) =>
        prev.map((t) =>
          t.table_number === drag.table_number ? { ...t, x: nextX, y: nextY } : t,
        ),
      );
    } else {
      // marker
      setDraftMarkers((prev) =>
        prev.map((m) => {
          if (m.id !== drag.id) return m;
          const nextX = clamp(snap(pt.x - drag.offsetX), 0, CANVAS_W - m.w);
          const nextY = clamp(snap(pt.y - drag.offsetY), 0, CANVAS_H - m.h);
          return { ...m, x: nextX, y: nextY };
        }),
      );
    }
  }

  function onPointerUp() {
    // If a drag was actually in progress, mark the next click as
    // "post-drag" so the canvas-root onClick doesn't unpin the popover
    // the user just opened. Touchscreens fire a synthetic click after
    // pointerup, so we can't rely on stopPropagation in pointerdown.
    if (dragRef.current.kind !== 'idle') {
      didDragRef.current = true;
    }
    dragRef.current = { kind: 'idle' };
    // Clear snap guides — they're a "while dragging" affordance.
    setSnapGuides((prev) => (prev.x === null && prev.y === null ? prev : { x: null, y: null }));
  }

  // Add a marker at canvas centre — host then drags to position.
  function addMarker(kind: RoomMarkerKind) {
    const size = ROOM_MARKER_DEFAULT_SIZE[kind];
    const x = clamp(
      snap((CANVAS_W - size.w) / 2),
      0,
      CANVAS_W - size.w,
    );
    const y = clamp(
      snap((CANVAS_H - size.h) / 2),
      0,
      CANVAS_H - size.h,
    );
    setDraftMarkers((prev) => [
      ...prev,
      {
        id: `new-${Math.random().toString(36).slice(2, 10)}`,
        kind,
        label: kind === 'custom' ? 'Label me' : null,
        x,
        y,
        w: size.w,
        h: size.h,
        rotation: 0,
      },
    ]);
  }

  function removeMarker(id: string) {
    setDraftMarkers((prev) => prev.filter((m) => m.id !== id));
  }

  function relabelMarker(id: string, label: string) {
    setDraftMarkers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, label } : m)),
    );
  }

  function enterEdit() {
    // Seed drafts from current server-truth so the first drag operates
    // on a copy, not the same array.
    setDraftTables(initialTables);
    setDraftMarkers(initialMarkers);
    setEditing(true);
  }

  function cancelEdits() {
    // Drop the drafts; tablesToShow / markersToShow fall back to
    // initialTables / initialMarkers automatically.
    setDraftTables([]);
    setDraftMarkers([]);
    setEditing(false);
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveEventLayoutAction(eventId, {
        tables: draftTables.map((t) => ({
          table_number: t.table_number,
          x: t.x,
          y: t.y,
        })),
        markers: draftMarkers.map((m) => ({
          kind: m.kind,
          label: m.label,
          x: m.x,
          y: m.y,
          w: m.w,
          h: m.h,
          rotation: m.rotation,
        })),
      });
      if (!res.ok) {
        setError(res.error ?? 'Failed to save layout.');
        return;
      }
      // Exit edit mode and clear drafts. The server has revalidated the
      // event detail path so initialTables / initialMarkers will refresh
      // on the next render via the parent.
      setDraftTables([]);
      setDraftMarkers([]);
      setEditing(false);
    });
  }

  const activeTable = pinnedTable ?? hoveredTable;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-aegis-gray-200 px-4 py-10 text-center">
        <p className="text-sm text-aegis-gray-500">
          No tables yet. Add overrides or import a guest list — the floor plan
          mirrors the list view automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={enterEdit}
              // Hide on phones — drag-to-position with a 14-px-wide
              // table is unusable. The canvas remains scrollable in
              // view mode so users can still inspect seating; edit
              // is gated to lg+ where there's enough room to grab.
              className="hidden items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50 lg:inline-flex"
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
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Edit layout
            </button>
          ) : (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-aegis-orange">
                Editing
              </span>
              {(['stage', 'door', 'entrance', 'podium', 'registration', 'custom'] as RoomMarkerKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addMarker(k)}
                  className="inline-flex items-center gap-1 rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-gray hover:bg-aegis-gray-50"
                >
                  + {ROOM_MARKER_LABEL[k]}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {error && (
            <span className="text-[11px] text-red-700">{error}</span>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={cancelEdits}
                disabled={pending}
                className="inline-flex items-center rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending || !dirty}
                className="inline-flex items-center rounded-md bg-aegis-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-aegis-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Saving…' : dirty ? 'Save layout' : 'No changes'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hint */}
      {editing ? (
        <p className="text-[11px] text-aegis-gray-500">
          Drag tables and markers to reposition. Snaps to a 10-unit grid.
          Click <span className="font-medium">Save layout</span> to commit.
        </p>
      ) : (
        <p className="text-[11px] text-aegis-gray-500">
          Hover or tap a table to see who&apos;s seated there.{' '}
          <span className="lg:hidden">
            Scroll horizontally to see the rest of the room.
          </span>
          <span className="hidden lg:inline">
            Use <span className="font-medium">Edit layout</span> to drag
            tables and add stage / door / registration markers for this
            room.
          </span>
        </p>
      )}

      {/* Canvas — CSS-scaled to fit; internal coords stay 1200×800.
          On small screens the inner element forces min-width 1200 so
          tables stay tappable (≥ 48px); the outer wrapper scrolls
          horizontally. On lg+ the canvas fills the container width
          and the aspect ratio drives the height. */}
      <div className="-mx-1 overflow-x-auto px-1 lg:mx-0 lg:overflow-x-visible lg:px-0">
        <div
          ref={containerRef}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => {
            // Consume the post-drag synthetic click. Without this,
            // releasing a drag anywhere on the canvas would immediately
            // unpin the table popover the user just opened.
            if (didDragRef.current) {
              didDragRef.current = false;
              return;
            }
            setPinnedTable(null);
          }}
          className="relative w-[1200px] overflow-hidden rounded-lg border border-aegis-gray-100 bg-aegis-gray-50/40 lg:w-full"
          style={{
            aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
            // Light grid pattern in edit mode so the snap grid is visible.
            backgroundImage: editing
              ? 'radial-gradient(circle, rgba(15, 23, 42, 0.08) 1px, transparent 1px)'
              : undefined,
            backgroundSize: editing
              ? `${(SNAP * 100) / CANVAS_W}% ${(SNAP * 100) / CANVAS_H}%`
              : undefined,
          }}
        >
        <div
          className="absolute inset-0"
          // Use a percent-based positioning system inside this scaled
          // box. Children compute their style.left / style.top as
          // percentages of CANVAS_W / CANVAS_H so they auto-scale.
        >
          {/* Section zones — tinted bounding rectangles drawn behind
              tables of the same section so the eye reads "this is the
              analyst block, this is the VIP block" without having to
              colour-decode every disc. 'mixed' has no zone. Labels in
              the corner identify the section. */}
          {sectionZones.map((z) => {
            const fill = SECTION_ZONE_FILL[z.section];
            const border = SECTION_ZONE_BORDER[z.section];
            if (!fill || !border) return null;
            return (
              <div
                key={`zone-${z.section}`}
                aria-hidden
                className="pointer-events-none absolute rounded-2xl border-2 border-dashed"
                style={{
                  left: `${(z.x / CANVAS_W) * 100}%`,
                  top: `${(z.y / CANVAS_H) * 100}%`,
                  width: `${(z.w / CANVAS_W) * 100}%`,
                  height: `${(z.h / CANVAS_H) * 100}%`,
                  backgroundColor: fill,
                  borderColor: border,
                }}
              >
                <span
                  className="absolute -top-3 left-3 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] shadow-sm ring-1 ring-inset"
                  style={{ color: SECTION_FILL[z.section], borderColor: border }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: SECTION_FILL[z.section] }}
                    aria-hidden
                  />
                  {TABLE_SECTION_LABEL[z.section]}
                </span>
              </div>
            );
          })}

          {/* Snap guide lines — visible only while dragging a table
              that's aligned with another table's centre. The vertical
              line spans the canvas at the snapped x; horizontal at
              the snapped y. */}
          {editing && snapGuides.x !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-aegis-orange/70"
              style={{ left: `${(snapGuides.x / CANVAS_W) * 100}%` }}
            />
          )}
          {editing && snapGuides.y !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-0 right-0 h-px bg-aegis-orange/70"
              style={{ top: `${(snapGuides.y / CANVAS_H) * 100}%` }}
            />
          )}

          {/* Markers — rendered behind tables so a stage doesn't visually
              cover a VIP table dropped near it. */}
          {markersToShow.map((m) => (
            <MarkerEl
              key={m.id}
              marker={m}
              editing={editing}
              onPointerDown={(e) => onPointerDownMarker(e, m)}
              onRelabel={relabelMarker}
              onRemove={removeMarker}
            />
          ))}

          {/* Tables */}
          {tablesToShow.map((t) => (
            <TableEl
              key={t.table_number}
              table={t}
              guests={guestsByTable.get(t.table_number) ?? []}
              active={activeTable === t.table_number}
              editing={editing}
              onHover={setHoveredTable}
              onPin={(id) =>
                setPinnedTable((prev) => (prev === id ? null : id))
              }
              onPointerDown={(e) => onPointerDownTable(e, t)}
            />
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Auto-arrangement for tables without saved x/y.
// ─────────────────────────────────────────────────────────────────────
//
// Bands the canvas into rows by section in SECTION_ORDER, with a stage
// area implicitly at the very top (saved markers can override). Inside
// each section, tables flow left-to-right and wrap when they hit the
// canvas width. Tables that already have x/y keep them.
function arrangeTables(rows: TableRow[]): DraftTable[] {
  const positioned: DraftTable[] = [];
  const auto: TableRow[] = [];

  for (const r of rows) {
    if (r.x != null && r.y != null) {
      positioned.push({ table_number: r.table_number, x: r.x, y: r.y, row: r });
    } else {
      auto.push(r);
    }
  }

  // Determine which sections actually have auto-rows so we can skip
  // empty bands and compress the layout.
  const usedSections = new Set<TableSection>();
  for (const r of auto) usedSections.add(r.section);
  const sections = SECTION_ORDER.filter((s) => usedSections.has(s));
  if (sections.length === 0) return positioned;

  // Vertical layout: leave a strip at the top for a stage marker, then
  // distribute the remaining height across sections.
  const stageTop = 100; // top strip reserved for the stage marker
  const usable = CANVAS_H - stageTop - AUTO_MARGIN;
  const bandHeight = Math.max(
    TABLE_R + 24,
    (usable - SECTION_BAND_GAP * (sections.length - 1)) / sections.length,
  );

  sections.forEach((section, sectionIdx) => {
    const bandTop = stageTop + sectionIdx * (bandHeight + SECTION_BAND_GAP);
    // Group by section, sort by table_number numerically when possible.
    const inSection = auto
      .filter((r) => r.section === section)
      .sort((a, b) => {
        const an = Number.parseInt(a.table_number.replace(/\D+/g, ''), 10);
        const bn = Number.parseInt(b.table_number.replace(/\D+/g, ''), 10);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
          return an - bn;
        }
        return a.table_number.localeCompare(b.table_number, undefined, {
          numeric: true,
        });
      });

    // Flow tables across the band with a fixed gap. If the row overflows
    // we wrap to a second row inside the same band — usually rare, but
    // means a section with 30 tables doesn't run off-canvas.
    const gap = 24;
    const step = TABLE_R + gap;
    const usableWidth = CANVAS_W - AUTO_MARGIN * 2;
    const perRow = Math.max(1, Math.floor((usableWidth + gap) / step));
    inSection.forEach((r, idx) => {
      const col = idx % perRow;
      const subRow = Math.floor(idx / perRow);
      const rowsInBand = Math.ceil(inSection.length / perRow);
      // Centre the tables horizontally within the usable band width.
      const rowCount = Math.min(perRow, inSection.length - subRow * perRow);
      const rowWidth = rowCount * TABLE_R + (rowCount - 1) * gap;
      const startX = (CANVAS_W - rowWidth) / 2 + TABLE_R / 2;
      const x = startX + col * step;
      // Vertically centre the wrapped rows inside the band.
      const subRowTotalHeight = rowsInBand * TABLE_R + (rowsInBand - 1) * 16;
      const subRowOffset = (bandHeight - subRowTotalHeight) / 2;
      const y =
        bandTop + subRowOffset + subRow * (TABLE_R + 16) + TABLE_R / 2;
      positioned.push({
        table_number: r.table_number,
        x: Math.round(x),
        y: Math.round(y),
        row: r,
      });
    });
  });

  return positioned;
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// ─────────────────────────────────────────────────────────────────────
// Table element — round disc on the canvas. Anchored by centre.
// ─────────────────────────────────────────────────────────────────────

function TableEl({
  table,
  guests,
  active,
  editing,
  onHover,
  onPin,
  onPointerDown,
}: {
  table: DraftTable;
  guests: EventGuest[];
  active: boolean;
  editing: boolean;
  onHover: (id: string | null) => void;
  onPin: (id: string) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const tone = capacityTone(table.row.used, table.row.capacity);
  const checkedIn = guests.filter((g) => g.checked_in).length;

  // Position by percentage so the canvas can scale freely. We position
  // the centre of the disc; CSS transform shifts back by half-width.
  const styleLeft = `${(table.x / CANVAS_W) * 100}%`;
  const styleTop = `${(table.y / CANVAS_H) * 100}%`;
  // Table diameter in viewport units — same approach: percent of the
  // canvas dimensions then scaled by the parent's aspect-ratio box.
  const sizePct = `${(TABLE_R / CANVAS_W) * 100}%`;

  return (
    <div
      style={{
        left: styleLeft,
        top: styleTop,
        width: sizePct,
        // Force aspect-ratio square so the disc stays round under
        // wide-aspect viewports too.
        aspectRatio: '1 / 1',
        transform: 'translate(-50%, -50%)',
      }}
      className="absolute"
      onMouseEnter={() => !editing && onHover(table.table_number)}
      onMouseLeave={() => !editing && onHover(null)}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onClick={(e) => {
          e.stopPropagation();
          if (!editing) onPin(table.table_number);
        }}
        onFocus={() => !editing && onHover(table.table_number)}
        onBlur={() => !editing && onHover(null)}
        aria-haspopup={editing ? undefined : 'dialog'}
        aria-expanded={!editing && active}
        aria-label={`Table ${table.table_number} — ${table.row.used} of ${table.row.capacity ?? '∞'} seated`}
        className={[
          'group relative flex h-full w-full flex-col items-center justify-center rounded-full text-white shadow-md ring-2 transition-all',
          editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          active
            ? 'ring-aegis-navy'
            : 'ring-white/60 hover:ring-aegis-navy/40',
        ].join(' ')}
        style={{
          backgroundColor: SECTION_FILL[table.row.section],
          // Capacity tone tints with a soft outer glow — green/amber/red
          // sit on top of the section base so a full VIP table reads
          // amber-on-gold rather than just gold.
          boxShadow:
            tone === 'red'
              ? '0 0 0 3px rgba(239, 68, 68, 0.5)'
              : tone === 'amber'
                ? '0 0 0 3px rgba(245, 158, 11, 0.45)'
                : tone === 'green'
                  ? '0 0 0 3px rgba(16, 185, 129, 0.4)'
                  : undefined,
        }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-90">
          T
        </span>
        <span className="text-base font-bold leading-none tabular-nums">
          {table.table_number}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold tabular-nums opacity-90">
          {checkedIn}/{table.row.used}
          {table.row.capacity != null && (
            <span className="opacity-70"> · {table.row.capacity}</span>
          )}
        </span>
      </button>

      {!editing && active && (
        <TablePopover
          row={table.row}
          guests={guests}
          placement={popoverPlacement(table.x, table.y)}
        />
      )}
    </div>
  );
}

// Decide where to place the popover relative to the table so it stays
// inside the canvas and doesn't cover its neighbours. The popover is
// roughly 288×280 in canvas units when the canvas is at native size.
//
//   • Vertical: render below by default. Flip to above when the table
//     sits in the lower 40% of the canvas.
//   • Horizontal: centred by default. Align left when the table is
//     close to the left edge, align right when close to the right.
//
// The thresholds are conservative — they aim to avoid overlap on the
// typical 1200×800 canvas without computing precise pixel bounds.
type PopoverPlacement = {
  vertical: 'below' | 'above';
  horizontal: 'center' | 'left' | 'right';
};

function popoverPlacement(x: number, y: number): PopoverPlacement {
  // Popover size estimates in canvas units (the popover is rendered
  // outside the scaled box but its width is fixed at w-72 which is
  // 288px CSS — ~24% of a 1200-unit canvas; 280px height is similar).
  const POP_W = 288;
  const POP_H = 320;

  const vertical: 'below' | 'above' =
    y + TABLE_R / 2 + POP_H > CANVAS_H ? 'above' : 'below';

  let horizontal: 'center' | 'left' | 'right' = 'center';
  if (x - POP_W / 2 < 12) horizontal = 'left';
  else if (x + POP_W / 2 > CANVAS_W - 12) horizontal = 'right';

  return { vertical, horizontal };
}

function TablePopover({
  row,
  guests,
  placement,
}: {
  row: TableRow;
  guests: EventGuest[];
  placement: PopoverPlacement;
}) {
  // Compose Tailwind classes from the placement decision. Each axis is
  // independent so corner placements (e.g. above-right, below-left)
  // compose naturally.
  const verticalClass =
    placement.vertical === 'below'
      ? 'top-full mt-3'
      : 'bottom-full mb-3';
  const horizontalClass =
    placement.horizontal === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : placement.horizontal === 'left'
        ? 'left-0'
        : 'right-0';

  return (
    <div
      role="dialog"
      aria-label={`Guests at table ${row.table_number}`}
      onClick={(e) => e.stopPropagation()}
      className={[
        'absolute z-30 w-72 rounded-lg border border-aegis-gray-100 bg-white p-3 shadow-xl ring-1 ring-aegis-navy/5',
        verticalClass,
        horizontalClass,
      ].join(' ')}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-aegis-gray-100 pb-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-aegis-gray-500">
            Table {row.table_number}{' '}
            <span className="text-aegis-gray-400">
              · {TABLE_SECTION_LABEL[row.section]}
            </span>
          </p>
          {row.label && (
            <p className="text-[12px] text-aegis-navy">{row.label}</p>
          )}
        </div>
        <p className="text-[10px] tabular-nums text-aegis-gray-500">
          {row.used}
          <span className="opacity-60"> / </span>
          {row.capacity ?? '∞'}
        </p>
      </div>

      {guests.length === 0 ? (
        <p className="py-2 text-center text-[12px] italic text-aegis-gray-500">
          No guests seated here yet.
        </p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto">
          {guests.map((g) => (
            <li key={g.guest_id} className="flex items-start gap-2">
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
                <p className="truncate text-[12px] font-medium text-aegis-navy">
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
  );
}

// ─────────────────────────────────────────────────────────────────────
// Marker element — rectangle anchored top-left.
// ─────────────────────────────────────────────────────────────────────

function MarkerEl({
  marker,
  editing,
  onPointerDown,
  onRelabel,
  onRemove,
}: {
  marker: DraftMarker;
  editing: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onRelabel: (id: string, label: string) => void;
  onRemove: (id: string) => void;
}) {
  const styleLeft = `${(marker.x / CANVAS_W) * 100}%`;
  const styleTop = `${(marker.y / CANVAS_H) * 100}%`;
  const styleW = `${(marker.w / CANVAS_W) * 100}%`;
  const styleH = `${(marker.h / CANVAS_H) * 100}%`;

  const renderedLabel = marker.label || ROOM_MARKER_LABEL[marker.kind];
  const isStage = marker.kind === 'stage';

  return (
    <div
      className="absolute"
      style={{
        left: styleLeft,
        top: styleTop,
        width: styleW,
        height: styleH,
        // Rotation around the rectangle centre — hooked up for a future
        // resize/rotate handle. v1 always renders 0 so this is a no-op.
        transform: marker.rotation
          ? `rotate(${marker.rotation}deg)`
          : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        className={[
          'flex h-full w-full items-center justify-center rounded-md text-center text-[11px] font-semibold uppercase tracking-[0.1em] shadow-sm',
          editing ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
          isStage ? 'rounded-lg' : 'rounded-md',
        ].join(' ')}
        style={{
          backgroundColor: MARKER_FILL[marker.kind],
          color: MARKER_TEXT[marker.kind],
        }}
      >
        <span className="px-1 truncate">{renderedLabel}</span>
      </div>

      {editing && (
        <div className="absolute -right-2 -top-2 flex items-center gap-1">
          {marker.kind === 'custom' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = window.prompt(
                  'Marker label',
                  marker.label ?? '',
                );
                if (next != null) onRelabel(marker.id, next);
              }}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-aegis-navy shadow-sm ring-1 ring-aegis-gray-200 hover:bg-aegis-gray-50"
              title="Edit label"
              aria-label="Edit label"
            >
              ✎
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(marker.id);
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-red-600 shadow-sm ring-1 ring-red-200 hover:bg-red-50"
            title="Remove marker"
            aria-label="Remove marker"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
