/* eslint-disable jsx-a11y/alt-text */
// React-PDF doesn't accept the `alt` prop on its <Image> component, so we
// disable that lint rule for the file. Everything in this file renders to a
// PDF, never to the DOM.

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import {
  DELIVERABLE_KIND_LABEL,
  ENGAGEMENT_TYPE_LABEL,
  INTERVIEW_FORMAT_LABEL,
  INTERVIEW_STATUS_LABEL,
  MARKET_SEGMENT_LABEL,
  MEETING_TYPE_LABEL,
  PRESS_RELEASE_TYPE_LABEL,
  type CoverageSentiment,
  type CoverageType,
  type DeliverableKind,
  type DeliverableStatus,
  type EngagementType,
  type InterviewFormat,
  type InterviewStatus,
  type MarketSegment,
  type MeetingType,
  type PressReleaseType,
  type ServiceTier,
} from '@/lib/types';
import { displayCompany } from '@/lib/display-format';

// ─── Brand palette — pulled from globals.css so the PDF matches the app.
//     Same map as event-attendance-pdf.tsx; copied (not imported) so each PDF
//     file is self-contained and easy to tweak independently. ───
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
  amber: '#d97706',
  amberTint: '#fffbeb',
  red: '#dc2626',
  redTint: '#fef2f2',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray800: '#1f2937',
} as const;

const TZ = 'Asia/Kuala_Lumpur';

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.gray800,
    lineHeight: 1.45,
  },
  // ─── Cover page ─────────────────────────────────────────────────────
  // First page is intentionally light — a single hero block centred
  // vertically on the page, mirroring the SAG sample. The body sections
  // start on page 2 with the usual running header.
  cover: {
    flexDirection: 'column',
    height: '100%',
  },
  coverBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coverBrandText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  coverHero: {
    marginTop: 220,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gold,
  },
  coverClientName: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    letterSpacing: -0.4,
  },
  coverClientSub: {
    fontSize: 10,
    color: COLORS.gray600,
    marginTop: 4,
  },
  coverTitle: {
    marginTop: 30,
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    letterSpacing: -0.3,
  },
  coverSubtitle: {
    fontSize: 12,
    color: COLORS.orange,
    marginTop: 6,
  },
  coverPeriod: {
    fontSize: 11,
    color: COLORS.gray600,
    marginTop: 4,
  },
  coverFooter: {
    marginTop: 'auto',
    paddingTop: 24,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray200,
  },
  coverPreparedLabel: {
    fontSize: 8,
    color: COLORS.gray400,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  coverPreparedBy: {
    marginTop: 4,
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
  },
  coverPreparedMeta: {
    marginTop: 2,
    fontSize: 9,
    color: COLORS.gray600,
  },
  coverConfidential: {
    marginTop: 14,
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.red,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  // ─── Body running header (page 2 onwards) ────────────────────────────
  runningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.gray200,
    marginBottom: 22,
    fontSize: 8.5,
    color: COLORS.gray600,
  },
  runningHeaderLeft: {
    fontFamily: 'Helvetica-Oblique',
  },
  runningHeaderRight: {
    fontFamily: 'Helvetica-Oblique',
  },
  // ─── Section heading ────────────────────────────────────────────────
  // "1. Executive Summary" — navy, bold, slightly larger than body.
  sectionHeading: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginTop: 6,
    marginBottom: 10,
  },
  subsectionHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginTop: 14,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 10,
    color: COLORS.gray800,
    marginBottom: 8,
    lineHeight: 1.5,
    textAlign: 'justify',
  },
  // ─── Bullet list ────────────────────────────────────────────────────
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingLeft: 4,
  },
  bulletGlyph: {
    width: 12,
    fontSize: 10,
    color: COLORS.orange,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.gray800,
    lineHeight: 1.5,
  },
  bulletStrong: {
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
  },
  // ─── Tables ─────────────────────────────────────────────────────────
  // Same pattern as event-attendance-pdf.tsx: light chrome, navy header,
  // tiny uppercase column titles. wrap=false on data rows so a row never
  // splits across pages.
  table: {
    borderWidth: 0.5,
    borderColor: COLORS.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
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
    paddingVertical: 7,
    paddingHorizontal: 7,
  },
  tr: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.gray200,
  },
  trAlt: {
    backgroundColor: COLORS.gray100,
  },
  td: {
    fontSize: 8.5,
    paddingVertical: 6,
    paddingHorizontal: 7,
    color: COLORS.gray800,
    lineHeight: 1.4,
  },
  tdMuted: {
    color: COLORS.gray400,
  },
  tdStrong: {
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
  },
  tdEmpty: {
    flex: 1,
    fontSize: 9,
    paddingVertical: 14,
    paddingHorizontal: 10,
    color: COLORS.gray400,
    fontFamily: 'Helvetica-Oblique',
    textAlign: 'center',
  },
  // ─── Scorecard status chips ─────────────────────────────────────────
  // Coloured pill rendered in the right-most column of the deliverables
  // scorecard. Mirrors the colour coding from the SAG sample (green =
  // delivered, amber = on track / partial, red = blocked / off track).
  scoreChip: {
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    borderRadius: 3,
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scoreChipDelivered: {
    backgroundColor: COLORS.emeraldTint,
    color: COLORS.emerald,
  },
  scoreChipOnTrack: {
    backgroundColor: COLORS.amberTint,
    color: COLORS.amber,
  },
  scoreChipPending: {
    backgroundColor: COLORS.gray100,
    color: COLORS.gray600,
  },
  scoreChipBlocked: {
    backgroundColor: COLORS.redTint,
    color: COLORS.red,
  },
  // ─── KPI strip on page 2 ───────────────────────────────────────────
  // Three-cell summary panel echoing the kiosk PDF's KPI band so the
  // reader gets a top-of-report snapshot before reading the prose.
  kpiPanel: {
    flexDirection: 'row',
    borderRadius: 6,
    backgroundColor: COLORS.gray100,
    borderWidth: 0.5,
    borderColor: COLORS.gray200,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 18,
  },
  kpiCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
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
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.navy,
    marginTop: 4,
    letterSpacing: -0.4,
  },
  kpiSubvalue: {
    fontSize: 8.5,
    color: COLORS.gray600,
    marginTop: 2,
  },
  // ─── Footer ─────────────────────────────────────────────────────────
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
  footerLogo: {
    width: 14,
    height: 10,
    objectFit: 'contain',
    marginRight: 4,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

// ─────────────────────────────────────────────────────────────────────────
// Service-tier display labels. Imported map would couple this PDF to the
// engagements-section UI; copying is fine because the values only grow.
const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR',
  pr: 'PR',
  esg: 'ESG',
  virtual_meeting: 'Virtual Meeting',
  ipo: 'IPO',
  agm_egm: 'AGM/EGM',
  social_media: 'Social Media',
  event_management: 'Event Management',
};

// ─────────────────────────────────────────────────────────────────────────
// Input shape — every field needed by the report is precomputed by the
// route handler. The PDF component is pure presentation: no DB access, no
// further aggregation. Keeps render-time deterministic.

export type BriefingRow = {
  meeting_id: string;
  meeting_date: string;
  meeting_type: MeetingType;
  client_name: string | null;
  investor_name: string | null;
  location: string | null;
  // First non-empty topic from agenda_items, or first sentence of summary.
  // Already trimmed to ≤ 120 chars by the route.
  topic: string | null;
};

export type PressReleaseRow = {
  press_release_id: string;
  title: string;
  release_type: PressReleaseType;
  // The date the release carries on its face — preferred over
  // distributed_at for the table since the SAG sample uses release_date.
  release_date: string | null;
  distributed_at: string | null;
  coverage: Array<{
    publication_name: string;
    publication_date: string;
    url: string | null;
  }>;
};

export type MediaInterviewRow = {
  interview_id: string;
  interview_date: string;
  publication_name: string;
  reporter_name: string | null;
  interview_format: InterviewFormat;
  status: InterviewStatus;
  topic: string | null;
};

export type CoverageRow = {
  coverage_id: string;
  publication_name: string;
  publication_date: string;
  coverage_type: CoverageType;
  sentiment: CoverageSentiment | null;
};

export type DeliverableRow = {
  client_deliverable_id: string;
  label: string;
  kind: DeliverableKind;
  status: DeliverableStatus;
  target_count: number | null;
  completed_count: number;
};

export type EngagementSummaryPdfProps = {
  engagement: {
    engagement_id: string;
    name: string;
    engagement_type: EngagementType;
    start_date: string;
    end_date: string | null;
    service_tier: ServiceTier[];
    scope_summary: string | null;
    contract_value: number | null;
    currency: string;
  };
  client: {
    corporate_name: string;
    ticker_code: string | null;
    market_segment: MarketSegment | null;
  };
  briefings: BriefingRow[];
  pressReleases: PressReleaseRow[];
  mediaInterviews: MediaInterviewRow[];
  /** All media coverage rows in the engagement period — used for the
   *  "distinct outlets" list in section 4.2 and the totals in section 6.
   *  Includes both press-release-driven and organic coverage. */
  allCoverage: CoverageRow[];
  deliverables: DeliverableRow[];
  /** Effective end-of-period the report covers. Usually `today` for a
   *  live engagement and `end_date` for a closed one. */
  reportAsOf: string;
  generatedAt: string;
  generatedBy: string;
  logo?: Buffer | null;
  clientLogo?: Buffer | null;
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateLong(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function fmtMonth(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: TZ,
    month: 'long',
    year: 'numeric',
  });
}

function fmtCurrency(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function periodLabel(start: string, asOf: string, end: string | null): string {
  // For closed engagements the period is start → end; for live ones we report
  // up to "as of" (today by default), and tag the engagement_end after a slash
  // so the reader sees how much of the contracted term is covered.
  const startStr = fmtMonth(start);
  const reachedEnd =
    end != null && new Date(asOf) >= new Date(end);
  if (reachedEnd) return `${startStr} – ${fmtMonth(end)}`;
  return `${startStr} – ${fmtMonth(asOf)} (engagement runs to ${end ? fmtMonth(end) : 'open'})`;
}

// Distinct outlets across the engagement period — used in section 4.2.
// Outlets get normalised by displayCompany so "The Edge", "the edge", and
// "TheEdge" collapse to one bullet.
function distinctOutlets(rows: CoverageRow[]): string[] {
  const set = new Map<string, string>();
  for (const r of rows) {
    const display = displayCompany(r.publication_name);
    const key = display.toLowerCase();
    if (!set.has(key)) set.set(key, display);
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────────────────────────────────
// Deliverables scorecard — translates the (kind, target, completed) tuple
// into a status chip + plain English. Encapsulated here so the PDF can use
// the same logic the engagement page already shows users in-app.

type ScorecardStatus = 'delivered' | 'on_track' | 'pending' | 'blocked';

function scoreDeliverable(d: DeliverableRow): {
  status: ScorecardStatus;
  delivered: string;
  remark: string;
} {
  if (d.status === 'not_applicable') {
    return { status: 'pending', delivered: '—', remark: 'Not applicable' };
  }
  if (d.status === 'completed') {
    return {
      status: 'delivered',
      delivered:
        d.kind === 'recurring' && d.target_count != null
          ? `${d.completed_count} / ${d.target_count}`
          : 'Delivered',
      remark: 'Delivered',
    };
  }
  if (d.kind === 'recurring' && d.target_count != null) {
    const ratio = d.target_count > 0 ? d.completed_count / d.target_count : 0;
    if (ratio >= 1) {
      return {
        status: 'delivered',
        delivered: `${d.completed_count} / ${d.target_count}`,
        remark: 'Delivered',
      };
    }
    if (ratio >= 0.5) {
      return {
        status: 'on_track',
        delivered: `${d.completed_count} / ${d.target_count}`,
        remark: `On track (${Math.round(ratio * 100)}% complete)`,
      };
    }
    return {
      status: 'pending',
      delivered: `${d.completed_count} / ${d.target_count}`,
      remark: 'In progress',
    };
  }
  if (d.kind === 'ongoing') {
    return {
      status: d.status === 'in_progress' ? 'on_track' : 'pending',
      delivered: d.status === 'in_progress' ? 'Ongoing' : 'Not started',
      remark: d.status === 'in_progress' ? 'Continuous throughout engagement' : 'Pending',
    };
  }
  // one_off or event_triggered, not yet completed
  return {
    status: d.status === 'in_progress' ? 'on_track' : 'pending',
    delivered: d.status === 'in_progress' ? 'In progress' : 'Pending',
    remark: d.status === 'in_progress' ? 'In progress' : 'Pending',
  };
}

// Inferred type preserves the React-PDF Style shape so the chip lookup
// can be passed straight into Text's style array without losing typing.
const STATUS_CHIP_STYLE = {
  delivered: styles.scoreChipDelivered,
  on_track: styles.scoreChipOnTrack,
  pending: styles.scoreChipPending,
  blocked: styles.scoreChipBlocked,
} satisfies Record<ScorecardStatus, unknown>;

const STATUS_CHIP_LABEL: Record<ScorecardStatus, string> = {
  delivered: 'Delivered',
  on_track: 'On track',
  pending: 'Pending',
  blocked: 'Off track',
};

// "Committed" column for the scorecard — recurring deliverables print the
// target count, ongoing prints "Continuous", others print "As required".
function committedLabel(d: DeliverableRow): string {
  if (d.kind === 'recurring' && d.target_count != null) {
    return `Minimum ${d.target_count}`;
  }
  if (d.kind === 'ongoing') return 'Continuous';
  if (d.kind === 'one_off') return '1';
  return 'As required';
}

// ─────────────────────────────────────────────────────────────────────────
// Component

export function EngagementSummaryPdf({
  engagement,
  client,
  briefings,
  pressReleases,
  mediaInterviews,
  allCoverage,
  deliverables,
  reportAsOf,
  generatedAt,
  generatedBy,
  logo,
  clientLogo,
}: EngagementSummaryPdfProps) {
  // ─── Pre-compute metrics referenced from the prose ───────────────────
  const briefingCount = briefings.length;
  const pressReleaseCount = pressReleases.length;
  const interviewCount = mediaInterviews.filter((i) => i.status === 'completed').length;
  const coverageCount = allCoverage.length;
  const outlets = distinctOutlets(allCoverage);
  const outletCount = outlets.length;

  const periodStr = periodLabel(engagement.start_date, reportAsOf, engagement.end_date);

  // Outcomes auto-derived from the data. Each bullet only renders if its
  // supporting data exists, so the section honestly reflects what was done
  // (no boilerplate claims with nothing to back them up).
  const featureCoverage = allCoverage.filter(
    (c) => c.coverage_type === 'print' || c.coverage_type === 'online',
  );
  const dividendReleases = pressReleases.filter(
    (p) => p.release_type === 'corporate_action',
  );
  const resultsReleases = pressReleases.filter((p) => p.release_type === 'results');

  const runningHeader = (
    <View style={styles.runningHeader} fixed>
      <Text style={styles.runningHeaderLeft}>
        {displayCompany(client.corporate_name)} — Engagement Summary
      </Text>
      <Text style={styles.runningHeaderRight}>
        Aegis Communication Sdn. Bhd.
      </Text>
    </View>
  );

  const footer = (
    <View style={styles.footer} fixed>
      <View style={styles.footerLeft}>
        {logo && <Image src={logo} style={styles.footerLogo} />}
        <Text>Private &amp; Confidential · Generated for {generatedBy}</Text>
      </View>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );

  return (
    <Document
      title={`Engagement Summary — ${displayCompany(client.corporate_name)}`}
      author="Aegis Communication Sdn. Bhd."
    >
      {/* ──────────────────────────────────────────────────────────────
          PAGE 1 — Cover. Mirrors the SAG sample's first page exactly:
          client name + listing line, report title, period, prepared-by
          block, confidentiality stamp. ────────────────────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.cover}>
          <View style={styles.coverBrand}>
            {logo && <Image src={logo} style={{ width: 40, height: 28, objectFit: 'contain' }} />}
            <Text style={styles.coverBrandText}>Aegis Communication</Text>
          </View>

          <View style={styles.coverHero}>
            <Text style={styles.coverClientName}>
              {displayCompany(client.corporate_name).toUpperCase()}
            </Text>
            {(client.market_segment || client.ticker_code) && (
              <Text style={styles.coverClientSub}>
                {client.market_segment ? `Listed on ${MARKET_SEGMENT_LABEL[client.market_segment]} of Bursa Malaysia Securities Berhad` : ''}
                {client.market_segment && client.ticker_code ? '  ·  ' : ''}
                {client.ticker_code ? `Ticker: ${client.ticker_code}` : ''}
              </Text>
            )}
          </View>

          <Text style={styles.coverTitle}>{engagement.name}</Text>
          <Text style={styles.coverSubtitle}>
            {ENGAGEMENT_TYPE_LABEL[engagement.engagement_type]} Engagement Summary
          </Text>
          <Text style={styles.coverPeriod}>{periodStr}</Text>

          <View style={styles.coverFooter}>
            <Text style={styles.coverPreparedLabel}>Prepared by</Text>
            <Text style={styles.coverPreparedBy}>Aegis Communication Sdn. Bhd.</Text>
            <Text style={styles.coverPreparedMeta}>(Company No. 1274315-W)</Text>
            <Text style={styles.coverPreparedMeta}>
              {new Date(reportAsOf).toLocaleString('en-GB', {
                timeZone: TZ,
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <Text style={styles.coverConfidential}>Private &amp; Confidential</Text>
          </View>
        </View>
        {clientLogo && (
          // Sit the client logo at the top-right of the cover as a discreet
          // brand mark. Positioned absolute so it doesn't disturb the
          // centred hero layout.
          <View
            style={{
              position: 'absolute',
              top: 44,
              right: 44,
              width: 90,
              height: 60,
              borderWidth: 0.5,
              borderColor: COLORS.gray200,
              borderRadius: 4,
              padding: 6,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image
              src={clientLogo}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </View>
        )}
      </Page>

      {/* ──────────────────────────────────────────────────────────────
          PAGE 2+ — Body. One <Page> wraps everything because the data
          (briefings + releases + scorecard) varies wildly in length per
          client. React-PDF will flow content across pages automatically;
          `runningHeader` + `footer` are marked `fixed` so they repeat.
          ────────────────────────────────────────────────────────── */}
      <Page size="A4" style={styles.page} wrap>
        {runningHeader}

        {/* ── 1. Executive Summary ────────────────────────────────── */}
        <Text style={styles.sectionHeading}>1. Executive Summary</Text>

        {/* KPI strip — gives the reader a hard-numbers snapshot before
            reading the narrative. Cells are auto-computed from the data. */}
        <View style={styles.kpiPanel}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Briefings</Text>
            <Text style={styles.kpiValue}>{briefingCount}</Text>
            <Text style={styles.kpiSubvalue}>analyst / investor sessions</Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellDivider]}>
            <Text style={styles.kpiLabel}>Press releases</Text>
            <Text style={styles.kpiValue}>{pressReleaseCount}</Text>
            <Text style={styles.kpiSubvalue}>issued in period</Text>
          </View>
          <View style={[styles.kpiCell, styles.kpiCellDivider]}>
            <Text style={styles.kpiLabel}>Media coverage</Text>
            <Text style={[styles.kpiValue, { color: COLORS.orange }]}>{coverageCount}</Text>
            <Text style={styles.kpiSubvalue}>
              placements across {outletCount} outlet{outletCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <Text style={styles.paragraph}>
          Aegis Communication Sdn. Bhd. (&ldquo;we&rdquo; or &ldquo;the
          Consultant&rdquo;) was appointed by{' '}
          <Text style={styles.bulletStrong}>
            {displayCompany(client.corporate_name)}
          </Text>{' '}
          on {fmtDateLong(engagement.start_date)} to provide a{' '}
          {ENGAGEMENT_TYPE_LABEL[engagement.engagement_type].toLowerCase()}{' '}
          engagement covering{' '}
          {engagement.service_tier.length > 0
            ? engagement.service_tier.map((t) => TIER_LABEL[t]).join(' / ')
            : 'integrated communications'}{' '}
          services.
          {engagement.scope_summary
            ? ` Scope: ${engagement.scope_summary}`
            : ' The scope covers strategic IR and PR advisory, analyst and fund manager briefings, media relations, press release preparation and distribution, investor materials development, spokesperson preparation, and ongoing capital market communications support.'}
        </Text>

        <Text style={styles.paragraph}>
          Over the course of the engagement period ({periodStr}), we have
          served as {displayCompany(client.corporate_name)}&apos;s primary
          liaison with the investment community and media, delivering a
          continuous and structured communications programme rather than ad
          hoc, one-off execution. Our work has encompassed{' '}
          <Text style={styles.bulletStrong}>{pressReleaseCount}</Text> press
          release{pressReleaseCount === 1 ? '' : 's'},{' '}
          <Text style={styles.bulletStrong}>{briefingCount}</Text>{' '}
          analyst / investor briefing{briefingCount === 1 ? '' : 's'}, and{' '}
          <Text style={styles.bulletStrong}>{interviewCount}</Text> completed
          media interview{interviewCount === 1 ? '' : 's'}, generating{' '}
          <Text style={styles.bulletStrong}>{coverageCount}</Text> media
          coverage item{coverageCount === 1 ? '' : 's'} across{' '}
          <Text style={styles.bulletStrong}>{outletCount}</Text> distinct
          outlet{outletCount === 1 ? '' : 's'}.
        </Text>

        <Text style={styles.paragraph}>
          This report summarises the activities conducted and outcomes achieved
          during the engagement period for {displayCompany(client.corporate_name)}&apos;s
          assessment and reference.
        </Text>

        {/* ── 2. Briefings table ─────────────────────────────────── */}
        <Text style={styles.sectionHeading}>
          2. Summary of Analyst / Investor Briefings Conducted
        </Text>
        <Text style={styles.paragraph}>
          The following table summarises all analyst briefings, investor deck
          distributions, and related investor communication activities
          conducted during the engagement period.
        </Text>
        <BriefingsTable rows={briefings} />

        {/* ── 3. Press releases table ────────────────────────────── */}
        <Text style={styles.sectionHeading}>
          3. Summary of Media Releases / Announcements Liaised
        </Text>
        <Text style={styles.paragraph}>
          The following table summarises all press releases and media
          announcements prepared or coordinated during the engagement period.
        </Text>
        <PressReleasesTable rows={pressReleases} />
        <Text style={[styles.paragraph, { marginTop: 6 }]}>
          <Text style={styles.bulletStrong}>Total press releases issued:</Text>{' '}
          {pressReleaseCount} during the engagement period. Confirmed media
          coverage attributable to releases: {coverageCount} placement
          {coverageCount === 1 ? '' : 's'} across {outletCount} distinct outlet
          {outletCount === 1 ? '' : 's'}.
        </Text>

        {/* ── 4. Media relations & coverage ──────────────────────── */}
        <Text style={styles.sectionHeading}>
          4. Media Relations &amp; Coverage Support
        </Text>

        <Text style={styles.subsectionHeading}>4.1 Media Engagements Conducted</Text>
        <MediaInterviewsTable rows={mediaInterviews} />

        <Text style={styles.subsectionHeading}>4.2 Media Coverage Summary</Text>
        {outletCount === 0 ? (
          <Text style={[styles.paragraph, styles.tdMuted]}>
            No media coverage logged in this engagement period yet.
          </Text>
        ) : (
          <>
            <Text style={styles.paragraph}>
              The following media titles provided coverage of{' '}
              {displayCompany(client.corporate_name)} during the engagement
              period, across press releases, interviews, and feature articles:
            </Text>
            <View style={{ marginBottom: 10 }}>
              {outlets.map((o) => (
                <View key={o} style={styles.bulletRow}>
                  <Text style={styles.bulletGlyph}>•</Text>
                  <Text style={styles.bulletText}>{o}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.paragraph}>
              <Text style={styles.bulletStrong}>Total confirmed coverage items:</Text>{' '}
              A minimum of {coverageCount} coverage placement
              {coverageCount === 1 ? ' was' : 's were'} secured across the
              engagement period.
            </Text>
          </>
        )}

        {/* ── 5. Strategic advisory ──────────────────────────────── */}
        <Text style={styles.sectionHeading}>5. Strategic IR / PR Advisory Support</Text>
        <Text style={styles.paragraph}>
          Beyond the execution of press releases and media engagements, we
          provided the following strategic advisory and support services
          throughout the engagement period:
        </Text>
        <AdvisoryBullets
          briefingCount={briefingCount}
          pressReleaseCount={pressReleaseCount}
          interviewCount={interviewCount}
          hasResults={resultsReleases.length > 0}
          tiers={engagement.service_tier}
        />

        {/* ── 6. Outcomes ──────────────────────────────────────────── */}
        <Text style={styles.sectionHeading}>6. Summary of Outcomes</Text>
        <OutcomeBullets
          clientName={displayCompany(client.corporate_name)}
          briefingCount={briefingCount}
          pressReleaseCount={pressReleaseCount}
          coverageCount={coverageCount}
          outletCount={outletCount}
          featureCount={featureCoverage.length}
          dividendCount={dividendReleases.length}
        />

        {/* ── 7. Deliverables scorecard ───────────────────────────── */}
        <Text style={styles.sectionHeading}>7. Engagement Deliverables Scorecard</Text>
        <Text style={styles.paragraph}>
          The following table provides a summary assessment of deliverables
          against the contractual commitments set out in the engagement letter
          dated {fmtDateLong(engagement.start_date)}.
        </Text>
        <DeliverablesScorecard rows={deliverables} />

        {/* ── 8. Conclusion ───────────────────────────────────────── */}
        <Text style={styles.sectionHeading}>8. Conclusion</Text>
        <Text style={styles.paragraph}>
          Over the course of this engagement, the integrated programme has
          provided {displayCompany(client.corporate_name)} with a structured,
          consistent, and professional communications function covering the
          full spectrum of investor relations and media engagement. The
          engagement has delivered tangible outcomes: {coverageCount} media
          coverage item{coverageCount === 1 ? '' : 's'} across {outletCount}{' '}
          distinct outlet{outletCount === 1 ? '' : 's'},{' '}
          {pressReleaseCount} press release{pressReleaseCount === 1 ? '' : 's'},
          and {briefingCount} analyst / investor briefing
          {briefingCount === 1 ? '' : 's'}.
        </Text>
        <Text style={styles.paragraph}>
          {engagement.end_date
            ? `The engagement term runs until ${fmtDateLong(engagement.end_date)}.`
            : 'The engagement is open-ended.'}{' '}
          We remain available to discuss any aspect of the work summarised in
          this report and to provide any additional information that{' '}
          {displayCompany(client.corporate_name)} may require for its
          assessment.
        </Text>
        <Text style={styles.paragraph}>
          We thank the management team of {displayCompany(client.corporate_name)}{' '}
          for their trust and cooperation throughout the engagement period
          and look forward to the opportunity to continue this partnership.
        </Text>

        {/* Tiny generated-at line — closes the document without forcing
            a new page just for it. */}
        <Text
          style={{
            marginTop: 18,
            fontSize: 7.5,
            color: COLORS.gray400,
            fontFamily: 'Helvetica-Oblique',
          }}
        >
          Generated {generatedAt}
          {engagement.contract_value != null
            ? `  ·  Contract value on file: ${fmtCurrency(engagement.contract_value, engagement.currency)}`
            : ''}
        </Text>

        {footer}
      </Page>
    </Document>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components — split out so the main render function stays readable
// and so each table's column widths live next to its header / body code.

// Column flex weights for the briefings table.
const BRIEF_COLS = {
  date: 1.0,
  type: 1.6,
  link: 2.4,
  topic: 3.0,
} as const;

function BriefingsTable({ rows }: { rows: BriefingRow[] }) {
  if (rows.length === 0) {
    return (
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={styles.tdEmpty}>
            No analyst or investor briefings logged in this engagement period.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.thead} fixed>
        <Text style={[styles.th, { flex: BRIEF_COLS.date }]}>Date</Text>
        <Text style={[styles.th, { flex: BRIEF_COLS.type }]}>Type</Text>
        <Text style={[styles.th, { flex: BRIEF_COLS.link }]}>Audience</Text>
        <Text style={[styles.th, { flex: BRIEF_COLS.topic }]}>Topic / Focus</Text>
      </View>
      {rows.map((r, i) => {
        const audience =
          [r.client_name, r.investor_name].filter(Boolean).join(' / ') || '—';
        return (
          <View
            key={r.meeting_id}
            style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}
            wrap={false}
          >
            <Text style={[styles.td, styles.tdStrong, { flex: BRIEF_COLS.date }]}>
              {fmtDateShort(r.meeting_date)}
            </Text>
            <Text style={[styles.td, { flex: BRIEF_COLS.type }]}>
              {MEETING_TYPE_LABEL[r.meeting_type]}
            </Text>
            <Text style={[styles.td, { flex: BRIEF_COLS.link }]}>{audience}</Text>
            <Text style={[styles.td, { flex: BRIEF_COLS.topic }]}>
              {r.topic || '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const PR_COLS = {
  date: 1.0,
  title: 3.0,
  type: 1.3,
  coverage: 2.7,
} as const;

function PressReleasesTable({ rows }: { rows: PressReleaseRow[] }) {
  if (rows.length === 0) {
    return (
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={styles.tdEmpty}>
            No press releases issued in this engagement period.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.thead} fixed>
        <Text style={[styles.th, { flex: PR_COLS.date }]}>Date</Text>
        <Text style={[styles.th, { flex: PR_COLS.title }]}>Title / Topic</Text>
        <Text style={[styles.th, { flex: PR_COLS.type }]}>Type</Text>
        <Text style={[styles.th, { flex: PR_COLS.coverage }]}>Coverage secured</Text>
      </View>
      {rows.map((r, i) => {
        const outlets = r.coverage
          .map((c) => displayCompany(c.publication_name))
          .filter((s, idx, arr) => arr.indexOf(s) === idx) // de-dupe
          .join(', ');
        const outletCount = r.coverage.length;
        return (
          <View
            key={r.press_release_id}
            style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}
            wrap={false}
          >
            <Text style={[styles.td, styles.tdStrong, { flex: PR_COLS.date }]}>
              {fmtDateShort(r.release_date ?? r.distributed_at)}
            </Text>
            <Text style={[styles.td, { flex: PR_COLS.title }]}>{r.title}</Text>
            <Text style={[styles.td, { flex: PR_COLS.type }]}>
              {PRESS_RELEASE_TYPE_LABEL[r.release_type]}
            </Text>
            <Text style={[styles.td, { flex: PR_COLS.coverage }]}>
              {outletCount > 0
                ? `${outlets} (${outletCount} outlet${outletCount === 1 ? '' : 's'})`
                : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const MI_COLS = {
  date: 1.0,
  outlet: 2.0,
  reporter: 1.6,
  format: 1.0,
  topic: 2.4,
  status: 1.0,
} as const;

function MediaInterviewsTable({ rows }: { rows: MediaInterviewRow[] }) {
  if (rows.length === 0) {
    return (
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={styles.tdEmpty}>
            No media interviews scheduled or completed in this period.
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.table}>
      <View style={styles.thead} fixed>
        <Text style={[styles.th, { flex: MI_COLS.date }]}>Date</Text>
        <Text style={[styles.th, { flex: MI_COLS.outlet }]}>Outlet</Text>
        <Text style={[styles.th, { flex: MI_COLS.reporter }]}>Reporter</Text>
        <Text style={[styles.th, { flex: MI_COLS.format }]}>Format</Text>
        <Text style={[styles.th, { flex: MI_COLS.topic }]}>Topic</Text>
        <Text style={[styles.th, { flex: MI_COLS.status }]}>Status</Text>
      </View>
      {rows.map((r, i) => (
        <View
          key={r.interview_id}
          style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}
          wrap={false}
        >
          <Text style={[styles.td, styles.tdStrong, { flex: MI_COLS.date }]}>
            {fmtDateShort(r.interview_date)}
          </Text>
          <Text style={[styles.td, { flex: MI_COLS.outlet }]}>
            {displayCompany(r.publication_name)}
          </Text>
          <Text style={[styles.td, { flex: MI_COLS.reporter }]}>
            {r.reporter_name || '—'}
          </Text>
          <Text style={[styles.td, { flex: MI_COLS.format }]}>
            {INTERVIEW_FORMAT_LABEL[r.interview_format]}
          </Text>
          <Text style={[styles.td, { flex: MI_COLS.topic }]}>
            {r.topic || '—'}
          </Text>
          <Text style={[styles.td, { flex: MI_COLS.status }]}>
            {INTERVIEW_STATUS_LABEL[r.status]}
          </Text>
        </View>
      ))}
    </View>
  );
}

const SC_COLS = {
  deliverable: 3.4,
  committed: 1.4,
  delivered: 1.4,
  status: 1.2,
} as const;

function DeliverablesScorecard({ rows }: { rows: DeliverableRow[] }) {
  if (rows.length === 0) {
    return (
      <View style={styles.table}>
        <View style={styles.tr}>
          <Text style={styles.tdEmpty}>
            No deliverable commitments seeded for this engagement. Open the
            engagement in-app to seed the standard tier deliverables.
          </Text>
        </View>
      </View>
    );
  }
  // Sort by kind (ongoing/recurring first), then label.
  const sorted = [...rows].sort((a, b) => {
    const rank: Record<DeliverableKind, number> = {
      ongoing: 0,
      recurring: 1,
      one_off: 2,
      event_triggered: 3,
    };
    if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
    return a.label.localeCompare(b.label);
  });
  return (
    <View style={styles.table}>
      <View style={styles.thead} fixed>
        <Text style={[styles.th, { flex: SC_COLS.deliverable }]}>Deliverable</Text>
        <Text style={[styles.th, { flex: SC_COLS.committed }]}>Committed</Text>
        <Text style={[styles.th, { flex: SC_COLS.delivered }]}>Delivered</Text>
        <Text style={[styles.th, { flex: SC_COLS.status }]}>Status</Text>
      </View>
      {sorted.map((d, i) => {
        const score = scoreDeliverable(d);
        return (
          <View
            key={d.client_deliverable_id}
            style={[styles.tr, i % 2 === 1 ? styles.trAlt : {}]}
            wrap={false}
          >
            <View style={{ flex: SC_COLS.deliverable, paddingVertical: 6, paddingHorizontal: 7 }}>
              <Text style={[styles.tdStrong, { fontSize: 8.5, lineHeight: 1.4 }]}>
                {d.label}
              </Text>
              <Text style={{ fontSize: 7.5, color: COLORS.gray400, marginTop: 1 }}>
                {DELIVERABLE_KIND_LABEL[d.kind]}
              </Text>
            </View>
            <Text style={[styles.td, { flex: SC_COLS.committed }]}>
              {committedLabel(d)}
            </Text>
            <Text style={[styles.td, { flex: SC_COLS.delivered }]}>
              {score.delivered}
            </Text>
            <View style={{ flex: SC_COLS.status, paddingVertical: 6, paddingHorizontal: 7 }}>
              <Text style={[styles.scoreChip, STATUS_CHIP_STYLE[score.status]]}>
                {STATUS_CHIP_LABEL[score.status]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Narrative bullets

function AdvisoryBullets({
  briefingCount,
  pressReleaseCount,
  interviewCount,
  hasResults,
  tiers,
}: {
  briefingCount: number;
  pressReleaseCount: number;
  interviewCount: number;
  hasResults: boolean;
  tiers: ServiceTier[];
}) {
  const bullets: { strong: string; text: string }[] = [];
  if (pressReleaseCount > 0) {
    bullets.push({
      strong: 'Results Communication Positioning:',
      text: hasResults
        ? `For each results announcement (${pressReleaseCount} release${pressReleaseCount === 1 ? '' : 's'} this period), we worked with management to identify the key financial and operational messages, frame year-on-year comparisons appropriately, and position the results in the context of the company's growth trajectory.`
        : `We drafted and coordinated ${pressReleaseCount} corporate press release${pressReleaseCount === 1 ? '' : 's'}, working with management on key messaging, framing, and positioning ahead of distribution.`,
    });
  }
  if (briefingCount > 0) {
    bullets.push({
      strong: 'Analyst / Investor Briefing Preparation:',
      text: `Management talking points, Q&A preparation documents, and briefing materials were developed for the ${briefingCount} analyst / investor session${briefingCount === 1 ? '' : 's'} held during the engagement.`,
    });
  }
  if (interviewCount > 0) {
    bullets.push({
      strong: 'Media Interview Preparation:',
      text: `Q&A documents and key messaging frameworks were prepared ahead of ${interviewCount} completed media interview${interviewCount === 1 ? '' : 's'} to ensure accurate, clear, and consistent corporate messaging.`,
    });
  }
  bullets.push({
    strong: 'Primary Liaison Function:',
    text: 'We served as the primary point of contact between the company and the investment community and media, handling information requests, coordinating interview logistics, and managing the flow of corporate information throughout the engagement.',
  });
  if (tiers.includes('ir')) {
    bullets.push({
      strong: 'Strategic IR Consultancy:',
      text: 'Continuous strategic IR advisory was provided throughout the engagement, covering investor positioning, capital market communications, and disclosure timing.',
    });
  }
  if (tiers.includes('pr')) {
    bullets.push({
      strong: 'Strategic PR Consultancy:',
      text: 'Continuous strategic PR advisory was provided throughout the engagement, covering reputation positioning, media narrative, and crisis preparedness.',
    });
  }
  bullets.push({
    strong: 'Q&A Document Development:',
    text: 'Anticipated questions and answers were prepared ahead of briefings, interviews, and (where applicable) the Annual General Meeting, covering financial performance, operational matters, strategic direction, and other areas likely to be raised by shareholders and stakeholders.',
  });

  return (
    <View>
      {bullets.map((b, idx) => (
        <View key={idx} style={styles.bulletRow}>
          <Text style={styles.bulletGlyph}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.bulletStrong}>{b.strong} </Text>
            {b.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OutcomeBullets({
  clientName,
  briefingCount,
  pressReleaseCount,
  coverageCount,
  outletCount,
  featureCount,
  dividendCount,
}: {
  clientName: string;
  briefingCount: number;
  pressReleaseCount: number;
  coverageCount: number;
  outletCount: number;
  featureCount: number;
  dividendCount: number;
}) {
  const bullets: { strong: string; text: string }[] = [];
  if (pressReleaseCount > 0) {
    bullets.push({
      strong: 'Consistent capital market communication:',
      text: `${clientName} maintained a regular cadence of financial communication to the investment community and media, with ${pressReleaseCount} press release${pressReleaseCount === 1 ? '' : 's'} supported by structured drafting and proactive media outreach.`,
    });
  }
  if (coverageCount > 0) {
    bullets.push({
      strong: 'Stronger media visibility:',
      text: `A total of ${coverageCount} media coverage item${coverageCount === 1 ? '' : 's'} ${coverageCount === 1 ? 'was' : 'were'} secured across ${outletCount} distinct media platform${outletCount === 1 ? '' : 's'}, extending the company's reach to both institutional and retail investor audiences.`,
    });
  }
  if (featureCount > 0) {
    bullets.push({
      strong: 'Print and online placement:',
      text: `${featureCount} placement${featureCount === 1 ? '' : 's'} in print and online media reinforced the company's positioning across English-language, Chinese-language, and digital financial platforms.`,
    });
  }
  if (briefingCount > 0) {
    bullets.push({
      strong: 'Structured analyst engagement:',
      text: `${briefingCount} analyst / investor session${briefingCount === 1 ? '' : 's'} ensured that the investment community received timely, accurate, and well-presented information on the company's performance and outlook.`,
    });
  }
  if (dividendCount > 0) {
    bullets.push({
      strong: 'Corporate action communication:',
      text: `${dividendCount} corporate action announcement${dividendCount === 1 ? '' : 's'} (including dividends, M&A, capital raising) ${dividendCount === 1 ? 'was' : 'were'} handled with dedicated press releases reinforcing the company's commitment to shareholder transparency.`,
    });
  }
  bullets.push({
    strong: 'Improved management readiness:',
    text: 'Through Q&A preparation, messaging frameworks, and spokesperson support, the management team was better prepared for engagements with analysts and media.',
  });

  return (
    <View>
      {bullets.map((b, idx) => (
        <View key={idx} style={styles.bulletRow}>
          <Text style={styles.bulletGlyph}>•</Text>
          <Text style={styles.bulletText}>
            <Text style={styles.bulletStrong}>{b.strong} </Text>
            {b.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
