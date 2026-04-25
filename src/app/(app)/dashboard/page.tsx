import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import type { ProjectStatus, ServiceTier } from '@/lib/types';

type ProjectRow = {
  project_id: string;
  deliverable_name: string;
  status: ProjectStatus;
  deadline: string | null;
  clients: { corporate_name: string } | null;
};

type MeetingRow = {
  meeting_id: string;
  meeting_format: 'physical' | 'online';
  meeting_date: string;
  key_takeaways: string | null;
  clients: { corporate_name: string } | null;
  analysts: { institution_name: string } | null;
};

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

const TIER_COLOR: Record<ServiceTier, string> = {
  ir: 'bg-aegis-navy',
  pr: 'bg-aegis-blue',
  esg: 'bg-aegis-gold',
  virtual_meeting: 'bg-aegis-gray-300',
  ipo: 'bg-aegis-orange',
  agm_egm: 'bg-aegis-navy-700',
  social_media: 'bg-aegis-blue/60',
  event_management: 'bg-aegis-gold/70',
};

const MS_PER_DAY = 86_400_000;

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / MS_PER_DAY);
}

function formatDeadlineDelta(iso: string): { label: string; overdue: boolean } {
  const d = daysFromNow(iso);
  if (d < 0) return { label: `${Math.abs(d)}d overdue`, overdue: true };
  if (d === 0) return { label: 'Due today', overdue: false };
  if (d === 1) return { label: 'Due tomorrow', overdue: false };
  if (d < 30) return { label: `In ${d}d`, overdue: false };
  return { label: new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), overdue: false };
}

function formatMeetingDate(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / MS_PER_DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * MS_PER_DAY).toISOString();
  const { data: { user } } = await supabase.auth.getUser();
  const displayName = (user?.user_metadata?.display_name as string | undefined)?.trim() ?? '';
  const firstName = displayName ? displayName.split(/\s+/)[0] : '';

  const [
    cClients, cAnalysts, cMedia, cProjects,
    cClientsNew, cAnalystsNew, cMediaNew, cProjectsNew,
    rProjects, rMeetings, rAnalysts, rClients,
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('analysts').select('*', { count: 'exact', head: true }),
    supabase.from('media_contacts').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),

    supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('analysts').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('media_contacts').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('projects').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),

    supabase
      .from('projects')
      .select('project_id, deliverable_name, status, deadline, clients ( corporate_name )')
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from('meetings')
      .select('meeting_id, meeting_format, meeting_date, key_takeaways, clients ( corporate_name ), analysts ( institution_name )')
      .order('meeting_date', { ascending: false })
      .limit(4),
    supabase.from('analysts').select('sentiment_score'),
    supabase.from('clients').select('service_tier'),
  ]);

  const projects = (rProjects.data ?? []) as unknown as ProjectRow[];
  const meetings = (rMeetings.data ?? []) as unknown as MeetingRow[];
  const analystSentiments = (rAnalysts.data ?? []) as { sentiment_score: number | null }[];
  const clientTiers = (rClients.data ?? []) as { service_tier: ServiceTier[] | null }[];

  // Pipeline + overdue
  const pipeline: Record<ProjectStatus, number> = {
    pending: projects.filter((p) => p.status === 'pending').length,
    upcoming: projects.filter((p) => p.status === 'upcoming').length,
    completed: projects.filter((p) => p.status === 'completed').length,
  };
  const pipelineTotal = pipeline.pending + pipeline.upcoming + pipeline.completed;
  const overdueCount = projects.filter(
    (p) => p.deadline && new Date(p.deadline).getTime() < Date.now() && p.status !== 'completed',
  ).length;

  // Upcoming deadlines (active only, with deadline)
  const upcoming = projects
    .filter((p) => p.status !== 'completed' && p.deadline)
    .slice(0, 5);

  // Sentiment distribution
  const sentiment = {
    positive: analystSentiments.filter((a) => (a.sentiment_score ?? 0) > 0.2).length,
    neutral: analystSentiments.filter(
      (a) => a.sentiment_score != null && Math.abs(a.sentiment_score) <= 0.2,
    ).length,
    negative: analystSentiments.filter((a) => (a.sentiment_score ?? 0) < -0.2).length,
    unrated: analystSentiments.filter((a) => a.sentiment_score == null).length,
  };
  const sentimentTotal = sentiment.positive + sentiment.neutral + sentiment.negative + sentiment.unrated;

  // Service tier mix — service_tier is an array per client; count occurrences across all rows
  const tiers: Record<ServiceTier, number> = {
    ir: 0, pr: 0, esg: 0, virtual_meeting: 0,
    ipo: 0, agm_egm: 0, social_media: 0, event_management: 0,
  };
  for (const c of clientTiers) {
    for (const t of c.service_tier ?? []) tiers[t] = (tiers[t] ?? 0) + 1;
  }
  const tierTotal = Object.values(tiers).reduce((a, b) => a + b, 0);
  const visibleTiers = (Object.entries(tiers) as [ServiceTier, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const kpis = [
    { label: 'Clients', count: cClients.count ?? 0, delta: cClientsNew.count ?? 0, href: '/clients' },
    { label: 'Investors', count: cAnalysts.count ?? 0, delta: cAnalystsNew.count ?? 0, href: '/analysts' },
    { label: 'Media Contacts', count: cMedia.count ?? 0, delta: cMediaNew.count ?? 0, href: '/media' },
    { label: 'Projects', count: cProjects.count ?? 0, delta: cProjectsNew.count ?? 0, href: '/projects' },
  ];

  return (
    <div>
      <PageHeader
        title={firstName ? `Welcome, ${firstName}.` : 'Welcome back.'}
        description={`${today} · Operations snapshot for the Aegis team.`}
        action={
          overdueCount > 0 ? (
            <Link
              href="/projects"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 sm:w-auto sm:py-2"
            >
              <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {overdueCount} overdue {overdueCount === 1 ? 'project' : 'projects'}
              <span aria-hidden>→</span>
            </Link>
          ) : null
        }
      />

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.href}
            href={k.href}
            className="group relative flex flex-col overflow-hidden rounded-lg border border-aegis-gray-100 bg-white p-5 transition-all hover:border-aegis-navy/30 hover:shadow-sm sm:p-6"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-aegis-blue transition-transform group-hover:scale-x-100"
            />
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
              {k.label}
            </p>
            <div className="mt-3 flex items-baseline gap-2 sm:mt-4">
              <p className="text-3xl font-semibold tabular-nums tracking-tight text-aegis-navy sm:text-4xl">
                {k.count}
              </p>
              {k.delta > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-aegis-blue-50 px-2 py-0.5 text-[11px] font-medium text-aegis-navy">
                  +{k.delta}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-aegis-gray-500">
              {k.delta > 0 ? `+${k.delta} added this week` : 'No change this week'}
            </p>
          </Link>
        ))}
      </section>

      {/* ── Pipeline + Heads-up ───────────────────────────────────── */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Project pipeline"
            right={
              overdueCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-aegis-orange-50 px-2.5 py-0.5 text-xs font-medium text-aegis-orange-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-aegis-orange" />
                  {overdueCount} overdue
                </span>
              ) : null
            }
          />
          {pipelineTotal === 0 ? (
            <EmptyState>No projects yet.</EmptyState>
          ) : (
            <>
              <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-aegis-gray-100">
                {pipeline.pending > 0 && (
                  <div
                    className="bg-aegis-gold"
                    style={{ width: `${(pipeline.pending / pipelineTotal) * 100}%` }}
                    title={`Pending: ${pipeline.pending}`}
                  />
                )}
                {pipeline.upcoming > 0 && (
                  <div
                    className="bg-aegis-blue"
                    style={{ width: `${(pipeline.upcoming / pipelineTotal) * 100}%` }}
                    title={`Upcoming: ${pipeline.upcoming}`}
                  />
                )}
                {pipeline.completed > 0 && (
                  <div
                    className="bg-aegis-gray-300"
                    style={{ width: `${(pipeline.completed / pipelineTotal) * 100}%` }}
                    title={`Completed: ${pipeline.completed}`}
                  />
                )}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 text-center">
                <PipelineStat dotClass="bg-aegis-gold" label="Pending" count={pipeline.pending} total={pipelineTotal} />
                <PipelineStat dotClass="bg-aegis-blue" label="Upcoming" count={pipeline.upcoming} total={pipelineTotal} />
                <PipelineStat dotClass="bg-aegis-gray-300" label="Completed" count={pipeline.completed} total={pipelineTotal} />
              </div>
            </>
          )}
        </Card>

        <aside className="rounded-lg border border-aegis-gold/30 bg-aegis-gold-50 p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-aegis-gold" aria-hidden />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-aegis-gray-700">
              Heads up
            </h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-aegis-gray-700">
            New deliverables in the pipeline appear in{' '}
            <Link href="/projects" className="font-medium text-aegis-navy hover:text-aegis-orange">
              Projects
            </Link>
            . Items past their deadline are flagged in{' '}
            <span className="font-medium text-aegis-orange-600">orange</span> across the portal.
          </p>
        </aside>
      </section>

      {/* ── Deadlines + Recent meetings ───────────────────────────── */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming deadlines"
            right={
              <Link href="/projects" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
                View all →
              </Link>
            }
          />
          {upcoming.length === 0 ? (
            <EmptyState>No active deadlines.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-aegis-gray-100">
              {upcoming.map((p) => {
                const delta = formatDeadlineDelta(p.deadline!);
                return (
                  <li key={p.project_id} className="flex items-center gap-3 py-3">
                    <span
                      className={[
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        delta.overdue ? 'bg-aegis-orange' : p.status === 'pending' ? 'bg-aegis-gold' : 'bg-aegis-blue',
                      ].join(' ')}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-aegis-navy">
                        {p.deliverable_name}
                      </p>
                      <p className="truncate text-xs text-aegis-gray-500">
                        {p.clients?.corporate_name ?? '—'}
                      </p>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ring-1 ring-inset',
                        delta.overdue
                          ? 'bg-aegis-orange-50 text-aegis-orange-600 ring-aegis-orange/30'
                          : 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
                      ].join(' ')}
                    >
                      {delta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent meetings"
            right={
              <Link href="/meetings" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
                View all →
              </Link>
            }
          />
          {meetings.length === 0 ? (
            <EmptyState>No meetings logged.</EmptyState>
          ) : (
            <ul className="mt-2 divide-y divide-aegis-gray-100">
              {meetings.map((m) => (
                <li key={m.meeting_id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium tabular-nums text-aegis-gray-500">
                      {formatMeetingDate(m.meeting_date)}
                    </span>
                    <span className="text-aegis-gray-200">·</span>
                    <span
                      className={[
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                        m.meeting_format === 'physical'
                          ? 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20'
                          : 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
                      ].join(' ')}
                    >
                      {m.meeting_format}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-medium text-aegis-navy">
                    {[m.clients?.corporate_name, m.analysts?.institution_name].filter(Boolean).join(' × ') || '—'}
                  </p>
                  {m.key_takeaways && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-aegis-gray-500">
                      {m.key_takeaways}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ── Sentiment + Service tier ──────────────────────────────── */}
      <section className="mt-6 grid grid-cols-1 gap-5 sm:mt-8 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Investor sentiment"
            right={
              <Link href="/analysts" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
                Analysts →
              </Link>
            }
          />
          {sentimentTotal === 0 ? (
            <EmptyState>No sentiment data yet.</EmptyState>
          ) : (
            <div className="mt-4 space-y-3">
              <DistRow color="bg-aegis-navy" label="Positive" count={sentiment.positive} total={sentimentTotal} />
              <DistRow color="bg-aegis-blue" label="Neutral" count={sentiment.neutral} total={sentimentTotal} />
              <DistRow color="bg-aegis-orange" label="Negative" count={sentiment.negative} total={sentimentTotal} />
              <DistRow color="bg-aegis-gray-300" label="Unrated" count={sentiment.unrated} total={sentimentTotal} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Service tier mix"
            right={
              <Link href="/clients" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
                Clients →
              </Link>
            }
          />
          {tierTotal === 0 ? (
            <EmptyState>No clients yet.</EmptyState>
          ) : (
            <div className="mt-4 space-y-3">
              {visibleTiers.map(([tier, count]) => (
                <DistRow
                  key={tier}
                  color={TIER_COLOR[tier]}
                  label={TIER_LABEL[tier]}
                  count={count}
                  total={tierTotal}
                />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

// ─── Tiny helpers ────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-aegis-gray-100 bg-white p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-aegis-gray-500">
        {title}
      </h3>
      {right}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
      {children}
    </div>
  );
}

function PipelineStat({
  dotClass, label, count, total,
}: { dotClass: string; label: string; count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div className="rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 px-3 py-2.5">
      <div className="flex items-center justify-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aegis-gray-500">
          {label}
        </p>
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums text-aegis-navy">{count}</p>
      <p className="text-[10px] tabular-nums text-aegis-gray-500">{pct}%</p>
    </div>
  );
}

function DistRow({
  color, label, count, total,
}: { color: string; label: string; count: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-aegis-gray">{label}</span>
        <span className="tabular-nums text-aegis-gray-500">
          {count} <span className="text-aegis-gray-300">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-aegis-gray-100">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
