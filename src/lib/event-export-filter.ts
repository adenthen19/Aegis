import type { EventGuest, GuestTier } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────
// Export filtering — shared between CSV / XLSX / PDF routes and the
// in-app Report UI that builds the query string.
//
// The Report tab lets the host pick specific tables and/or tiers before
// downloading. URLs look like:
//   /api/events/:id/attendance.xlsx?tables=1,4&tiers=vip,analyst
// Empty / missing params mean "no filter on this dimension".
// `tables=__none__` matches guests with no table assigned (so a host can
// export the un-seated overflow as its own list).

const VALID_TIERS: ReadonlySet<GuestTier> = new Set([
  'vip',
  'analyst',
  'kol',
  'media',
  'standard',
]);

export const NO_TABLE_SENTINEL = '__none__';

export type ExportFilter = {
  tables: ReadonlySet<string> | null; // null = no table filter
  tiers: ReadonlySet<GuestTier> | null; // null = no tier filter
};

export function parseExportFilter(url: string | URL): ExportFilter {
  const u = typeof url === 'string' ? new URL(url) : url;
  const tablesRaw = u.searchParams.get('tables');
  const tiersRaw = u.searchParams.get('tiers');

  const tables = tablesRaw
    ? new Set(
        tablesRaw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      )
    : null;

  const tiers = tiersRaw
    ? new Set(
        tiersRaw
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s): s is GuestTier => VALID_TIERS.has(s as GuestTier)),
      )
    : null;

  return {
    tables: tables && tables.size > 0 ? tables : null,
    tiers: tiers && tiers.size > 0 ? tiers : null,
  };
}

export function applyExportFilter(
  guests: EventGuest[],
  filter: ExportFilter,
): EventGuest[] {
  if (!filter.tables && !filter.tiers) return guests;
  return guests.filter((g) => {
    if (filter.tiers && !filter.tiers.has(g.tier)) return false;
    if (filter.tables) {
      const t = g.table_number?.trim();
      const key = t && t.length > 0 ? t : NO_TABLE_SENTINEL;
      if (!filter.tables.has(key)) return false;
    }
    return true;
  });
}

export function exportFilterIsActive(filter: ExportFilter): boolean {
  return filter.tables !== null || filter.tiers !== null;
}

// Build a short human-readable label, e.g. "VIP, Analyst · Tables 1, 4".
// Used in PDF/XLSX cover blocks so the consumer of the report knows it's
// filtered, not the full list.
export function describeExportFilter(
  filter: ExportFilter,
  tierLabel: Record<GuestTier, string>,
): string | null {
  if (!exportFilterIsActive(filter)) return null;
  const parts: string[] = [];
  if (filter.tiers) {
    const labels = Array.from(filter.tiers).map((t) => tierLabel[t]);
    parts.push(
      labels.length === 1 ? `${labels[0]} tier` : `${labels.join(', ')} tiers`,
    );
  }
  if (filter.tables) {
    const labels = Array.from(filter.tables).map((t) =>
      t === NO_TABLE_SENTINEL ? 'No table' : `Table ${t}`,
    );
    parts.push(labels.join(', '));
  }
  return parts.join(' · ');
}
