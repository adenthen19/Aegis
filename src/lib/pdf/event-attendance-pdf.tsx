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
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 9.5,
    color: COLORS.gray800,
  },
  // ─── Header ──────────────────────────────────────────────────────────
  headerBar: {
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.navy,
    marginBottom: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Logo aspect ratio is ~1.45:1 (wider than tall) — give it a wider box
  // and use objectFit: 'contain' so the original aspect is preserved.
  logo: {
    width: 36,
    height: 24,
    objectFit: 'contain',
  },
  // Per-client logo on the right of the header — same contain trick.
  headerClientLogo: {
    width: 44,
    height: 24,
    objectFit: 'contain',
    marginLeft: 8,
  },
  brandName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    letterSpacing: 0.4,
  },
  brandSub: {
    fontSize: 7,
    color: COLORS.gray400,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  reportLabel: {
    fontSize: 7,
    color: COLORS.orange,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
  },
  reportDate: {
    fontSize: 8,
    color: COLORS.gray600,
    marginTop: 2,
  },
  // Event identity row sits below the brand bar but above the divider
  // line, so it appears on every page.
  headerEventRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 12,
  },
  headerEventTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    lineHeight: 1.2,
    flexShrink: 1,
  },
  headerEventClient: {
    fontSize: 9,
    color: COLORS.gray600,
    marginTop: 2,
  },
  headerEventMeta: {
    fontSize: 8.5,
    color: COLORS.gray400,
    textAlign: 'right',
  },
  // ─── KPI row ─────────────────────────────────────────────────────────
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  kpiLabel: {
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    opacity: 0.75,
  },
  kpiValue: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
  },
  // ─── Section heading ─────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    color: COLORS.gray600,
    marginBottom: 6,
    marginTop: 10,
  },
  attendanceBar: {
    height: 8,
    backgroundColor: COLORS.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  attendanceBarFill: {
    height: 8,
    backgroundColor: COLORS.emerald,
  },
  attendanceCaption: {
    fontSize: 8,
    color: COLORS.gray600,
    marginTop: 2,
    marginBottom: 14,
  },
  // ─── Tables ──────────────────────────────────────────────────────────
  table: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: COLORS.navy,
  },
  th: {
    color: '#ffffff',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tr: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  trAlt: {
    backgroundColor: COLORS.gray100,
  },
  trCheckedIn: {
    backgroundColor: COLORS.emeraldTint,
  },
  td: {
    fontSize: 9,
    paddingVertical: 6,
    paddingHorizontal: 8,
    color: COLORS.gray800,
  },
  tdMuted: {
    color: COLORS.gray400,
  },
  // ─── Footer ──────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray200,
    fontSize: 7.5,
    color: COLORS.gray400,
  },
  // ─── Inline pieces ───────────────────────────────────────────────────
  badgeIn: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.emerald,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  badgePending: {
    fontSize: 7.5,
    color: COLORS.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
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
  generatedAt: string;
  generatedBy: string;
  logo?: Buffer | null;
  clientLogo?: Buffer | null;
};

export function EventAttendancePdf({
  event,
  guests,
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
  // table on page 2+.
  const companyMap = new Map<string, { total: number; checkedIn: number }>();
  for (const g of guests) {
    const key = (g.company?.trim() || 'Independent / unknown').slice(0, 80);
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
      title={`Attendance — ${event.name}`}
      author="Aegis Communication"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* ── Header bar ──────────────────────────────────────────── */}
        {/* Repeats on every page (fixed). Top row = brand + report meta;
            bottom row = event identity. The dedicated cover block has
            been folded into here so the page-1 real estate goes
            straight to the KPIs. */}
        <View style={styles.headerBar} fixed>
          <View style={styles.headerTop}>
            <View style={styles.brand}>
              {logo && <Image src={logo} style={styles.logo} />}
              <View>
                <Text style={styles.brandName}>
                  Aegis Communication Sdn Bhd
                </Text>
                <Text style={styles.brandSub}>Event Attendance Report</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.reportLabel}>Post-Event Report</Text>
                <Text style={styles.reportDate}>Generated {generatedAt}</Text>
              </View>
              {clientLogo && (
                <Image src={clientLogo} style={styles.headerClientLogo} />
              )}
            </View>
          </View>
          <View style={styles.headerEventRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerEventTitle}>{event.name}</Text>
              {event.clientLabel && (
                <Text style={styles.headerEventClient}>
                  For {event.clientLabel}
                </Text>
              )}
            </View>
            <Text style={styles.headerEventMeta}>
              {fmtDate(event.event_date)}
              {event.location ? `\n${event.location}` : ''}
            </Text>
          </View>
        </View>

        {/* ── KPI cards ───────────────────────────────────────────── */}
        <View style={styles.kpiRow}>
          <View
            style={[styles.kpiCard, { backgroundColor: COLORS.navyTint }]}
          >
            <Text style={[styles.kpiLabel, { color: COLORS.navy }]}>
              Total guests
            </Text>
            <Text style={[styles.kpiValue, { color: COLORS.navy }]}>
              {total}
            </Text>
          </View>
          <View
            style={[styles.kpiCard, { backgroundColor: COLORS.emeraldTint }]}
          >
            <Text style={[styles.kpiLabel, { color: COLORS.emerald }]}>
              Checked in
            </Text>
            <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>
              {checkedIn}
            </Text>
          </View>
          <View
            style={[styles.kpiCard, { backgroundColor: COLORS.gray100 }]}
          >
            <Text style={[styles.kpiLabel, { color: COLORS.gray600 }]}>
              Pending
            </Text>
            <Text style={[styles.kpiValue, { color: COLORS.gray600 }]}>
              {pending}
            </Text>
          </View>
          <View
            style={[styles.kpiCard, { backgroundColor: COLORS.orangeTint }]}
          >
            <Text style={[styles.kpiLabel, { color: COLORS.orange }]}>
              Attendance
            </Text>
            <Text style={[styles.kpiValue, { color: COLORS.orange }]}>
              {pct}%
            </Text>
          </View>
        </View>

        {/* ── Attendance bar ──────────────────────────────────────── */}
        <Text style={styles.sectionHeading}>Attendance progress</Text>
        <View style={styles.attendanceBar}>
          <View
            style={[styles.attendanceBarFill, { width: `${pct}%` }]}
          />
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
                  {g.full_name}
                </Text>
                <Text style={[styles.td, { flex: GUEST_COLS.title }]}>
                  {g.title || '—'}
                </Text>
                <Text style={[styles.td, { flex: GUEST_COLS.company }]}>
                  {g.company || '—'}
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
                <Text style={[styles.td, { flex: GUEST_COLS.status }]}>
                  {g.checked_in ? (
                    <Text style={styles.badgeIn}>✓ Checked in</Text>
                  ) : (
                    <Text style={styles.badgePending}>Pending</Text>
                  )}
                </Text>
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
