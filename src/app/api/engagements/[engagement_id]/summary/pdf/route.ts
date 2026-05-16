import path from 'node:path';
import fs from 'node:fs/promises';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import {
  EngagementSummaryPdf,
  type BriefingRow,
  type CoverageRow,
  type DeliverableRow,
  type MediaInterviewRow,
  type PressReleaseRow,
} from '@/lib/pdf/engagement-summary-pdf';
import {
  BRIEFING_MEETING_TYPES,
  type ClientDeliverable,
  type Engagement,
  type MediaCoverage,
  type MediaInterview,
  type Meeting,
  type PressRelease,
} from '@/lib/types';

// React-PDF needs Node APIs (fs, stream, fonts) — keep this off the Edge.
export const runtime = 'nodejs';

// Cache the brand logo bytes across requests — same pattern as the event
// attendance route. Read lazily so a missing file doesn't crash module init.
let cachedLogo: Buffer | null | undefined;

async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const file = path.join(process.cwd(), 'public', 'aegis_logo.png');
    cachedLogo = await fs.readFile(file);
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

async function fetchClientLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    if (ab.byteLength > 2 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function safeFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'engagement'
  );
}

// Extracts the first useful one-line topic from a meeting:
//   1. First non-empty agenda_items entry
//   2. First sentence of summary (cut at 120 chars)
//   3. null if neither exists
function topicForMeeting(m: Meeting): string | null {
  const agenda = (m.agenda_items ?? []).find((s) => s.trim().length > 0);
  if (agenda) return agenda.length > 120 ? `${agenda.slice(0, 117)}…` : agenda;
  if (m.summary) {
    const firstLine = m.summary.split(/[.\n]/)[0].trim();
    if (firstLine.length > 0) {
      return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
    }
  }
  return null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ engagement_id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { engagement_id } = await params;

  // Optional `?as_of=YYYY-MM-DD` query param lets the user generate a
  // "summary as of date X" — handy for mid-engagement reviews. Default to
  // today (Asia/Kuala_Lumpur wall-clock), capped at the engagement end_date
  // when present.
  const asOfParam = new URL(req.url).searchParams.get('as_of');
  const asOfRaw = asOfParam ?? new Date().toISOString().slice(0, 10);

  // ─── Engagement + client (one round trip with the join) ────────────
  const { data: engagementRow, error: engagementErr } = await supabase
    .from('engagements')
    .select(
      'engagement_id, client_id, name, engagement_type, status, start_date, end_date, ' +
        'service_tier, contract_value, currency, billing_terms, scope_summary, notes, ' +
        'created_by_user_id, updated_by_user_id, created_at, updated_at, ' +
        'clients ( client_id, corporate_name, ticker_code, market_segment, logo_url )',
    )
    .eq('engagement_id', engagement_id)
    .maybeSingle();
  if (engagementErr) {
    return new Response(`Database error: ${engagementErr.message}`, { status: 500 });
  }
  if (!engagementRow) {
    return new Response('Engagement not found', { status: 404 });
  }

  // Pull out + cast — Supabase's TS inference flattens joined relations to a
  // nullable single row for many-to-one. The `as unknown as` cast is the
  // same pattern used elsewhere in this codebase.
  const engagement = engagementRow as unknown as Engagement & {
    clients: {
      client_id: string;
      corporate_name: string;
      ticker_code: string | null;
      market_segment: 'main' | 'ace' | 'leap' | null;
      logo_url: string | null;
    } | null;
  };
  const client = engagement.clients;
  if (!client) {
    return new Response('Engagement is not linked to a client', { status: 500 });
  }

  // Clamp the as-of date to the engagement window. If the user asks for
  // "as of January 2030" on an engagement that ended August 2026, the
  // report should still read as of the actual end.
  const periodStart = engagement.start_date;
  const periodEnd =
    engagement.end_date && asOfRaw > engagement.end_date
      ? engagement.end_date
      : asOfRaw;
  // Hard floor: never query for activity before the engagement started.
  if (periodEnd < periodStart) {
    return new Response('Report as-of date is before engagement start', {
      status: 400,
    });
  }

  // ─── Activity queries — all parallelisable on the client_id+date range
  // (meetings + media_interviews scope by date because they don't carry
  // engagement_id today; press_releases and deliverables carry it directly).

  // Date strings → for timestamptz columns we want full-day inclusivity, so
  // use [start, end+1day) form. For pure date columns (release_date) we use
  // [start, end] BETWEEN.
  const periodEndPlusOne = (() => {
    const d = new Date(`${periodEnd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [
    meetingsRes,
    pressReleasesRes,
    interviewsRes,
    coverageRes,
    deliverablesRes,
  ] = await Promise.all([
    // Briefings: meetings tied to the client (no engagement FK on meetings
    // today) whose meeting_type is a briefing variant, in the period.
    supabase
      .from('meetings')
      .select(
        'meeting_id, meeting_type, client_id, investor_id, meeting_format, ' +
          'meeting_date, location, agenda_items, summary, other_remarks, ' +
          'created_at, updated_at, ' +
          'clients ( corporate_name ), analysts ( institution_name )',
      )
      .eq('client_id', client.client_id)
      .in('meeting_type', BRIEFING_MEETING_TYPES)
      .gte('meeting_date', `${periodStart}T00:00:00Z`)
      .lt('meeting_date', `${periodEndPlusOne}T00:00:00Z`)
      .order('meeting_date', { ascending: true }),

    // Press releases scoped by engagement_id when set, falling back to
    // client_id + release_date window for legacy rows that pre-date the
    // engagement linkage.
    supabase
      .from('press_releases')
      .select(
        'press_release_id, client_id, engagement_id, client_deliverable_id, ' +
          'title, release_type, status, release_date, distributed_at, body, ' +
          'distribution_media_ids, distribution_notes, notes, ' +
          'created_by_user_id, updated_by_user_id, created_at, updated_at, ' +
          'media_coverage ( coverage_id, publication_name, publication_date, url )',
      )
      .or(
        `engagement_id.eq.${engagement_id},and(engagement_id.is.null,client_id.eq.${client.client_id})`,
      )
      .gte('release_date', periodStart)
      .lte('release_date', periodEnd)
      .order('release_date', { ascending: true }),

    // Media interviews — scope same way as press releases.
    supabase
      .from('media_interviews')
      .select(
        'interview_id, client_id, engagement_id, client_deliverable_id, ' +
          'media_id, publication_name, reporter_name, spokesperson_name, ' +
          'interview_date, interview_format, status, topic, ' +
          'expected_publish_date, coverage_id, notes, ' +
          'created_by_user_id, updated_by_user_id, created_at, updated_at',
      )
      .or(
        `engagement_id.eq.${engagement_id},and(engagement_id.is.null,client_id.eq.${client.client_id})`,
      )
      .gte('interview_date', `${periodStart}T00:00:00Z`)
      .lt('interview_date', `${periodEndPlusOne}T00:00:00Z`)
      .order('interview_date', { ascending: true }),

    // All coverage for the client in the period (independent of press
    // release linkage) — used for the distinct-outlets list + totals.
    supabase
      .from('media_coverage')
      .select('*')
      .eq('client_id', client.client_id)
      .gte('publication_date', periodStart)
      .lte('publication_date', periodEnd)
      .order('publication_date', { ascending: true }),

    // Deliverables: scoreboard is engagement-scoped already.
    supabase
      .from('client_deliverables')
      .select('*')
      .eq('engagement_id', engagement_id)
      .order('kind', { ascending: true }),
  ]);

  // Bail early if any of the activity queries failed — partial data would
  // misrepresent the scorecard.
  for (const r of [meetingsRes, pressReleasesRes, interviewsRes, coverageRes, deliverablesRes]) {
    if (r.error) {
      return new Response(`Database error: ${r.error.message}`, { status: 500 });
    }
  }

  // ─── Shape the rows for the PDF component ──────────────────────────
  type MeetingWithJoins = Meeting & {
    clients: { corporate_name: string } | null;
    analysts: { institution_name: string } | null;
  };
  const briefings: BriefingRow[] = ((meetingsRes.data ?? []) as unknown as MeetingWithJoins[]).map(
    (m) => ({
      meeting_id: m.meeting_id,
      meeting_date: m.meeting_date,
      meeting_type: m.meeting_type,
      client_name: m.clients?.corporate_name ?? null,
      investor_name: m.analysts?.institution_name ?? null,
      location: m.location,
      topic: topicForMeeting(m),
    }),
  );

  type PressReleaseWithCoverage = PressRelease & {
    media_coverage: Array<{
      coverage_id: string;
      publication_name: string;
      publication_date: string;
      url: string | null;
    }>;
  };
  const pressReleases: PressReleaseRow[] = (
    (pressReleasesRes.data ?? []) as unknown as PressReleaseWithCoverage[]
  ).map((p) => ({
    press_release_id: p.press_release_id,
    title: p.title,
    release_type: p.release_type,
    release_date: p.release_date,
    distributed_at: p.distributed_at,
    coverage: (p.media_coverage ?? [])
      .filter(
        (c) => c.publication_date >= periodStart && c.publication_date <= periodEnd,
      )
      .map((c) => ({
        publication_name: c.publication_name,
        publication_date: c.publication_date,
        url: c.url,
      })),
  }));

  // Cast via `unknown` first because Supabase's generated row type for the
  // `.or(...)` filtered select can resolve to a union including errors.
  const mediaInterviews: MediaInterviewRow[] = (
    (interviewsRes.data ?? []) as unknown as MediaInterview[]
  ).map((i) => ({
    interview_id: i.interview_id,
    interview_date: i.interview_date,
    publication_name: i.publication_name ?? 'Unknown outlet',
    reporter_name: i.reporter_name,
    interview_format: i.interview_format,
    status: i.status,
    topic: i.topic,
  }));

  const allCoverage: CoverageRow[] = ((coverageRes.data ?? []) as MediaCoverage[]).map(
    (c) => ({
      coverage_id: c.coverage_id,
      publication_name: c.publication_name,
      publication_date: c.publication_date,
      coverage_type: c.coverage_type,
      sentiment: c.sentiment,
    }),
  );

  const deliverables: DeliverableRow[] = (
    (deliverablesRes.data ?? []) as ClientDeliverable[]
  ).map((d) => ({
    client_deliverable_id: d.client_deliverable_id,
    label: d.label,
    kind: d.kind,
    status: d.status,
    target_count: d.target_count,
    completed_count: d.completed_count,
  }));

  // ─── Logos in parallel with everything else above is harder to wire
  // because logos depend on the engagement query result. Fetch now. ────
  const [logo, clientLogo] = await Promise.all([
    loadLogo(),
    fetchClientLogo(client.logo_url),
  ]);

  // ─── Render ────────────────────────────────────────────────────────
  const generatedAt = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const buffer = await renderToBuffer(
    EngagementSummaryPdf({
      engagement: {
        engagement_id: engagement.engagement_id,
        name: engagement.name,
        engagement_type: engagement.engagement_type,
        start_date: engagement.start_date,
        end_date: engagement.end_date,
        service_tier: engagement.service_tier,
        scope_summary: engagement.scope_summary,
        contract_value: engagement.contract_value,
        currency: engagement.currency,
      },
      client: {
        corporate_name: client.corporate_name,
        ticker_code: client.ticker_code,
        market_segment: client.market_segment,
      },
      briefings,
      pressReleases,
      mediaInterviews,
      allCoverage,
      deliverables,
      reportAsOf: periodEnd,
      generatedAt,
      generatedBy: user.email ?? 'Aegis',
      logo,
      clientLogo,
    }),
  );

  const filename = `engagement-summary-${safeFilename(client.corporate_name)}-${periodEnd}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
