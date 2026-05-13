/* eslint-disable jsx-a11y/alt-text */
// React-PDF doesn't accept the `alt` prop on its <Image> component, so we
// disable that lint rule for the file. Everything in this file is rendered
// to a PDF, never to the DOM.

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { EventGuest } from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';

// ─────────────────────────────────────────────────────────────────────────
// Aegis brand palette — pulled from globals.css so the PDF matches the app.
// ─────────────────────────────────────────────────────────────────────────
const COLORS = {
  navy: '#1c5592',
  navyDark: '#123962',
  navyTint: '#eaf1f9',
  blue: '#61b5d9',
  blueTint: '#eef7fb',
  orange: '#ee7724',
  orangeTint: '#fdf1e7',
  gold: '#f2b44a',
  goldTint: '#fdf6e7',
  emerald: '#059669',
  emeraldTint: '#ecfdf5',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray800: '#1f2937',
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.gray800,
    lineHeight: 1.4,
  },
  // ─── Header ──────────────────────────────────────────────────────────
  // Single tight row at the top of every page. One brand mark on the
  // left, one report-meta block on the right. The big event identity
  // sits below in its own block on page 1; on continuation pages we
  // show a compact version.
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.gray200,
    marginBottom: 18,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  logo: {
    width: 32,
    height: 22,
    objectFit: 'contain',
  },
  brandName: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // The right-hand "Post-event report" stamp doubles as the page-1
  // headline; on continuation pages it just becomes the page number.
  reportMeta: {
    alignItems: 'flex-end',
  },
  reportLabel: {
    fontSize: 7,
    color: COLORS.orange,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
  },
  reportDate: {
    fontSize: 8,
    color: COLORS.gray600,
    marginTop: 2,
  },
  // ─── Event identity (page 1 only) ───────────────────────────────────
  // The hero block. Big title, supporting subline, optional client
  // logo on the right. Sits right under the header bar so the report
  // reads "AEGIS POST-EVENT REPORT → Q3 Briefing for Aurora Capital"
  // top-down without any redundancy.
  eventIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  eventTitle: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    lineHeight: 1.15,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  eventSubline: {
    fontSize: 10.5,
    color: COLORS.gray600,
    lineHeight: 1.5,
  },
  eventClientChip: {
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
  },
  filterChip: {
    marginTop: 4,
    fontSize: 9.5,
    color: COLORS.orange,
    fontFamily: 'Helvetica-Oblique',
  },
  clientLogoBox: {
    width: 80,
    height: 56,
    borderWidth: 0.5,
    borderColor: COLORS.gray200,
    borderRadius: 4,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientLogoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  // ─── KPI strip ──────────────────────────────────────────────────────
  // Single rounded panel split into four cells. Reads as one design
  // element instead of four competing pastel cards. Vertical dividers
  // between cells, accent colour driven by the cell's own value.
  kpiPanel: {
    flexDirection: 'row',
    borderRadius: 6,
    backgroundColor: COLORS.gray100,
    borderWidth: 0.5,
    borderColor: COLORS.gray200,
    overflow: 'hidden',
    marginBottom: 22,
  },
  kpiCell: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  kpiCellDivider: {
    borderLeftWidth: 0.5,
    borderLeftColor: COLORS.gray200,
  },
  kpiLabel: {
    fontSize: 7.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    color: COLORS.gray600,
  },
  kpiValue: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginTop: 6,
    letterSpacing: -0.5,
  },
  kpiAccent: {
    color: COLORS.emerald,
  },
  // ─── Section heading ─────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 8.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    color: COLORS.gray600,
    marginBottom: 8,
    marginTop: 4,
  },
  attendanceBar: {
    height: 6,
    backgroundColor: COLORS.gray200,
    borderRadius: 3,
    overflow: 'hidden',
  },
  attendanceBarFill: {
    height: 6,
    backgroundColor: COLORS.emerald,
  },
  attendanceCaption: {
    fontSize: 8.5,
    color: COLORS.gray600,
    marginTop: 6,
    marginBottom: 22,
  },
  // ─── Tables ──────────────────────────────────────────────────────────
  // Lighter chrome — thin borders, soft header, no aggressive
  // alternating rows. Easier on the eye when sent as a deliverable.
  table: {
    borderWidth: 0.5,
    borderColor: COLORS.gray200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyTint,
    borderBottomWidth: 0.75,
    borderBottomColor: COLORS.navy,
  },
  th: {
    color: COLORS.navy,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  tr: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray200,
  },
  trAlt: {
    backgroundColor: COLORS.gray100,
  },
  trCheckedIn: {
    // Faint left-edge accent does the work of "this person showed up"
    // without flooding every row with green tint.
    borderLeftWidth: 2,
    borderLeftColor: COLORS.emerald,
  },
  td: {
    fontSize: 9.5,
    paddingVertical: 7,
    paddingHorizontal: 9,
    color: COLORS.gray800,
  },
  tdMuted: {
    color: COLORS.gray400,
  },
  // ─── Footer ──────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray200,
    fontSize: 7.5,
    color: COLORS.gray400,
  },
  // ─── Status indicator ───────────────────────────────────────────────
  // Coloured dot + plain text, no Unicode glyph (✓ renders unevenly
  // in Helvetica). Reads cleanly at print scale.
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDotIn: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.emerald,
  },
  statusDotPending: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 0.75,
    borderColor: COLORS.gray400,
  },
  statusTextIn: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.emerald,
  },
  statusTextPending: {
    fontSize: 8.5,
    color: COLORS.gray400,
  },
});

// ─── Column widths for the guest list ───────────────────────────────────
// Pre-computed flex weights so every page renders identically (avoids the
// one-off ragged columns you sometimes get with table layouts in PDF libs).
const GUEST_COLS = {
  name: 2.4,
  title: 1.6,
  company: 2.4,
  table: 0.6,
  status: 1.0,
  time: 1.2,
} as const;

const COMPANY_COLS = {
  company: 4.0,
  total: 1.2,
  in: 1.2,
  pct: 1.2,
} as const;

// PDF generation runs server-side on Vercel, where the host timezone is
// UTC. Without an explicit timezone option, Malaysia events ended up
// printed 8 hours off. Pin to Asia/Kuala_Lumpur so the printed times
// match what the team typed and what the kiosk shows.
const TZ = 'Asia/Kuala_Lumpur';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export type EventAttendancePdfProps = {
  event: {
    name: string;
    event_date: string;
    location: string | null;
    description: string | null;
    clientLabel: string | null;
  };
  guests: EventGuest[];
  /** Human-readable description of any export-time filter (tier / table)
   *  that was applied — surfaced under the event subline so a downstream
   *  reader can tell the report is a slice, not the full list. Null
   *  when no filter is active. */
  filterLabel?: string | null;
  generatedAt: string;
  generatedBy: string;
  logo?: Buffer | null;
  clientLogo?: Buffer | null;
};

export function EventAttendancePdf({
  event,
  guests,
  filterLabel,
  generatedAt,
  generatedBy,
  logo,
  clientLogo,
}: EventAttendancePdfProps) {
  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;
  const pending = total - checkedIn;
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  // Per-company stats — used in both the cover summary and the breakdown
  // table on page 2+. We display-normalise the company key so different
  // casings of the same firm (`RHB`, `rhb`, `Rhb`) collapse together.
  const companyMap = new Map<string, { total: number; checkedIn: number }>();
  for (const g of guests) {
    const display = g.company ? displayCompany(g.company) : 'Independent / unknown';
    const key = display.slice(0, 80);
    const slot = companyMap.get(key) ?? { total: 0, checkedIn: 0 };
    slot.total += 1;
    if (g.checked_in) slot.checkedIn += 1;
    companyMap.set(key, slot);
  }
  const byCompany = Array.from(companyMap.entries())
    .map(([company, s]) => ({ company, ...s }))
    .sort((a, b) => b.total - a.total);

  // Sort guest list: checked in first (chronologically), then pending alpha.
  // This makes the printed list useful at a glance — top of page = arrived.
  const guestRows = [...guests].sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
    if (a.checked_in && b.checked_in) {
      return (
        (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? '')
      );
    }
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <Document
      title={`Attendance — ${displayName(event.name)}`}
      author="Aegis Communication"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* ── Header bar ──────────────────────────────────────────────
            Single line: brand left, report meta right. Repeats on
            every page so continuation pages still have context. */}
        <View style={styles.headerBar} fixed>
          <View style={styles.brand}>
            {logo && <Image src={logo} style={styles.logo} />}
            <Text style={styles.brandName}>Aegis Communication</Text>
          </View>
          <View style={styles.reportMeta}>
            <Text style={styles.reportLabel}>Post-Event Report</Text>
            <Text style={styles.reportDate}>Generated {generatedAt}</Text>
          </View>
        </View>

        {/* ── Event identity (hero block) ────────────────────────────
            Big event title, single subline that combines client +
            date + location. Optional client logo on the right. */}
        <View style={styles.eventIdentity}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventTitle}>{displayName(event.name)}</Text>
            <Text style={styles.eventSubline}>
              {event.clientLabel && (
                <>
                  For{' '}
                  <Text style={styles.eventClientChip}>
                    {displayCompany(event.clientLabel)}
                  </Text>
                  {'  ·  '}
                </>
              )}
              {fmtDate(event.event_date)}
              {event.location ? `  ·  ${event.location}` : ''}
            </Text>
            {filterLabel && (
              <Text style={styles.filterChip}>Filtered: {filterLabel}</Text>
            )}
          </View>
          {clientLogo && (
            <View style={styles.clientLogoBox}>
              <Image src={clientLogo} style={styles.clientLogoImg} />
            </View>
          )}
        </View>

        {/* ── KPI strip ──────────────────────────────────────────────
            Single rounded panel with four cells separated by thin
            dividers — reads as one piece of design instead of four
            competing pastel cards. Accent colours pick out the two
            quantities the host actually cares about (checked in,
            attendance %); total + pending stay neutral. */}
        <View style={styles.kpiPanel}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Total guests</Text>
            <Text style={styles.kpiValue}>{total}</Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellDivider]}>
            <Text style={styles.kpiLabel}>Checked in</Text>
            <Text style={[styles.kpiValue, styles.kpiAccent]}>
              {checkedIn}
            </Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellDivider]}>
            <Text style={styles.kpiLabel}>Pending</Text>
            <Text style={[styles.kpiValue, { color: COLORS.gray600 }]}>
              {pending}
            </Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellDivider]}>
            <Text style={styles.kpiLabel}>Attendance</Text>
            <Text style={[styles.kpiValue, { color: COLORS.orange }]}>
              {pct}%
            </Text>
          </View>
        </View>

        {/* ── Attendance bar ──────────────────────────────────────── */}
        <Text style={styles.sectionHeading}>Attendance progress</Text>
        <View style={styles.attendanceBar}>
          <View style={[styles.attendanceBarFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.attendanceCaption}>
          {checkedIn} of {total} guests checked in ({pct}%)
        </Text>

        {/* ── By company breakdown ────────────────────────────────── */}
        {byCompany.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Attendance by company</Text>
            <View style={styles.table} wrap={false}>
              <View style={styles.thead}>
                <Text style={[styles.th, { flex: COMPANY_COLS.company }]}>
                  Company
                </Text>
                <Text
                  style={[
                    styles.th,
                    { flex: COMPANY_COLS.total, textAlign: 'right' },
                  ]}
                >
                  Invited
                </Text>
                <Text
                  style={[
                    styles.th,
                    { flex: COMPANY_COLS.in, textAlign: 'right' },
                  ]}
                >
                  Checked in
                </Text>
                <Text
                  style={[
                    styles.th,
                    { flex: COMPANY_COLS.pct, textAlign: 'right' },
                  ]}
                >
                  Attendance
                </Text>
              </View>
              {byCompany.map((row, i) => {
                const rowPct =
                  row.total === 0
                    ? 0
                    : Math.round((row.checkedIn / row.total) * 100);
                return (
                  <View
                    key={row.company}
                    style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}
                  >
                    <Text style={[styles.td, { flex: COMPANY_COLS.company }]}>
                      {row.company}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        { flex: COMPANY_COLS.total, textAlign: 'right' },
                      ]}
                    >
                      {row.total}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        {
                          flex: COMPANY_COLS.in,
                          textAlign: 'right',
                          color: COLORS.emerald,
                        },
                      ]}
                    >
                      {row.checkedIn}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        {
                          flex: COMPANY_COLS.pct,
                          textAlign: 'right',
                          color: COLORS.gray600,
                        },
                      ]}
                    >
                      {rowPct}%
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Guest list ──────────────────────────────────────────── */}
        <Text style={styles.sectionHeading} break>
          Full guest list
        </Text>
        <View style={styles.table}>
          <View style={styles.thead} fixed>
            <Text style={[styles.th, { flex: GUEST_COLS.name }]}>Name</Text>
            <Text style={[styles.th, { flex: GUEST_COLS.title }]}>Title</Text>
            <Text style={[styles.th, { flex: GUEST_COLS.company }]}>
              Company
            </Text>
            <Text
              style={[
                styles.th,
                { flex: GUEST_COLS.table, textAlign: 'center' },
              ]}
            >
              Table
            </Text>
            <Text style={[styles.th, { flex: GUEST_COLS.status }]}>
              Status
            </Text>
            <Text style={[styles.th, { flex: GUEST_COLS.time }]}>Time</Text>
          </View>
          {guestRows.length === 0 ? (
            <View style={styles.tr}>
              <Text
                style={[
                  styles.td,
                  { flex: 1, textAlign: 'center', color: COLORS.gray400 },
                ]}
              >
                No guests on the list.
              </Text>
            </View>
          ) : (
            guestRows.map((g, i) => (
              <View
                key={g.guest_id}
                style={[
                  styles.tr,
                  g.checked_in
                    ? styles.trCheckedIn
                    : i % 2 === 1
                      ? styles.trAlt
                      : {},
                ]}
                wrap={false}
              >
                <Text
                  style={[
                    styles.td,
                    {
                      flex: GUEST_COLS.name,
                      fontFamily: 'Helvetica-Bold',
                      color: COLORS.navy,
                    },
                  ]}
                >
                  {displayName(g.full_name)}
                </Text>
                <Text style={[styles.td, { flex: GUEST_COLS.title }]}>
                  {g.title ? displayName(g.title) : '—'}
                </Text>
                <Text style={[styles.td, { flex: GUEST_COLS.company }]}>
                  {g.company ? displayCompany(g.company) : '—'}
                </Text>
                <Text
                  style={[
                    styles.td,
                    {
                      flex: GUEST_COLS.table,
                      textAlign: 'center',
                      color: g.table_number ? COLORS.navy : COLORS.gray400,
                    },
                  ]}
                >
                  {g.table_number || '—'}
                </Text>
                <View
                  style={[
                    styles.td,
                    styles.statusRow,
                    { flex: GUEST_COLS.status },
                  ]}
                >
                  <View
                    style={
                      g.checked_in ? styles.statusDotIn : styles.statusDotPending
                    }
                  />
                  <Text
                    style={
                      g.checked_in ? styles.statusTextIn : styles.statusTextPending
                    }
                  >
                    {g.checked_in ? 'Checked in' : 'Pending'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.td,
                    {
                      flex: GUEST_COLS.time,
                      color: g.checked_in ? COLORS.gray800 : COLORS.gray400,
                    },
                  ]}
                >
                  {fmtTime(g.checked_in_at)}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* The audit log used to render here, but the firm now keeps it
            out of the client-facing PDF. The full activity is still in
            the Excel export ("Activity Log" sheet) and the in-app Report
            tab for internal review. */}

        {/* ── Footer ──────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text>
            Aegis Communication · Confidential · Generated for {generatedBy}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
