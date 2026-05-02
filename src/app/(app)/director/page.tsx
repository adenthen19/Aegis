import Link from 'next/link';
import { requireDirectorOrAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import { Section, EmptyMini } from '@/components/detail-shell';
import {
  PRESS_RELEASE_STATUS_LABEL,
  SCHEDULE_STATUS_LABEL,
  type ClientDeliverable,
  type PressReleaseStatus,
  type ScheduleStatus,
} from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';
import { currentBlackout } from '../clients/blackout-helpers';

const PRESS_BADGE: Record<PressReleaseStatus, string> = {
  draft: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  approved: 'bg-amber-50 text-amber-700 ring-amber-200',
  distributed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200',
};

const SCHEDULE_BADGE: Record<ScheduleStatus, string> = {
  planned: 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
  confirmed: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function DirectorDashboardPage() {
  await requireDirectorOrAdmin();

  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString().slice(0, 10);
  const in14 = new Date(today);
  in14.setDate(today.getDate() + 14);
  const in60 = new Date(today);
  in60.setDate(today.getDate() + 60);
  const in7 = new Date(today);
  in7.setDate(today.getDate() + 7);

  const in30 = new Date(today);
  in30.setDate(today.getDate() + 30);

  const [
    activeEngagementsRes,
    activeClientsRes,
    openDeliverablesRes,
    overdueTodosRes,
    upcomingDeadlinesRes,
    weekSessionsRes,
    endingSoonRes,
    recentDistributionsRes,
    recentCoverageRes,
    blackoutCommitmentsRes,
  ] = await Promise.all([
    // Active engagements (count + total contract value)
    supabase
      .from('engagements')
      .select('engagement_id, contract_value, currency', { count: 'exact' })
      .eq('status', 'active'),
    // Distinct clients with at least one active engagement
    supabase
      .from('engagements')
      .select('client_id')
      .eq('status', 'active'),
    // Commitments still open (pending or in_progress)
    supabase
      .from('client_deliverables')
      .select('client_deliverable_id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_progress']),
    // Overdue todos across the firm
    supabase
      .from('action_items')
      .select('action_item_id', { count: 'exact', head: true })
      .eq('status', 'open')
      .not('due_date', 'is', null)
      .lt('due_date', todayIso),
    // Upcoming Bursa / regulatory + other dated commitments — next 14 days
    supabase
      .from('client_deliverables')
      .select(
        'client_deliverable_id, label, due_date, status, auto_generated_key, ' +
          'clients ( client_id, corporate_name )',
      )
      .in('status', ['pending', 'in_progress'])
      .gte('due_date', todayIso)
      .lte('due_date', in14.toISOString().slice(0, 10))
      .order('due_date', { ascending: true })
      .limit(20),
    // Confirmed / planned sessions in the next 7 days
    supabase
      .from('deliverable_schedule')
      .select(
        'schedule_id, scheduled_at, location, status, ' +
          'client_deliverables ( label, clients ( client_id, corporate_name ) )',
      )
      .in('status', ['planned', 'confirmed'])
      .gte('scheduled_at', today.toISOString())
      .lte('scheduled_at', in7.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(20),
    // Engagements ending in the next 60 days (renewal pipeline)
    supabase
      .from('engagements')
      .select('engagement_id, name, end_date, contract_value, currency, clients ( client_id, corporate_name )')
      .eq('status', 'active')
      .not('end_date', 'is', null)
      .gte('end_date', todayIso)
      .lte('end_date', in60.toISOString().slice(0, 10))
      .order('end_date', { ascending: true })
      .limit(15),
    // Recently distributed press releases
    supabase
      .from('press_releases')
      .select('press_release_id, title, distributed_at, release_type, clients ( client_id, corporate_name )')
      .eq('status', 'distributed')
      .not('distributed_at', 'is', null)
      .order('distributed_at', { ascending: false })
      .limit(8),
    // Latest media coverage
    supabase
      .from('media_coverage')
      .select(
        'coverage_id, headline, publication_name, publication_date, sentiment, ave_value, prv_value, currency, ' +
          'clients ( client_id, corporate_name )',
      )
      .order('publication_date', { ascending: false })
      .limit(8),
    // Quarterly-results commitments whose due date is within the next 30
    // days — feeds the blackout-period card. We fetch the full row so the
    // shared helper can pick the right one per client.
    supabase
      .from('client_deliverables')
      .select('*, clients ( client_id, corporate_name )')
      .like('auto_generated_key', 'bursa:results_q%')
      .gte('due_date', todayIso)
      .lte('due_date', in30.toISOString().slice(0, 10))
      .order('due_date', { ascending: true }),
  ]);

  const activeEngagementCount = activeEngagementsRes.count ?? 0;
  const totalContractValue = (activeEngagementsRes.data ?? []).reduce(
    (sum, e) => sum + Number((e.contract_value as number | null) ?? 0),
    0,
  );
  const distinctActiveClients = new Set(
    (activeClientsRes.data ?? []).map((e) => e.client_id as string),
  ).size;
  const openCommitmentCount = openDeliverablesRes.count ?? 0;
  const overdueTodoCount = overdueTodosRes.count ?? 0;

  type DeadlineRow = {
    client_deliverable_id: string;
    label: string;
    due_date: string;
    status: string;
    auto_generated_key: string | null;
    clients: { client_id: string; corporate_name: string } | null;
  };
  const upcomingDeadlines = (upcomingDeadlinesRes.data ?? []) as unknown as DeadlineRow[];

  type SessionRow = {
    schedule_id: string;
    scheduled_at: string;
    location: string | null;
    status: ScheduleStatus;
    client_deliverables: {
      label: string;
      clients: { client_id: string; corporate_name: string } | null;
    } | null;
  };
  const weekSessions = (weekSessionsRes.data ?? []) as unknown as SessionRow[];

  type EndingRow = {
    engagement_id: string;
    name: string;
    end_date: string;
    contract_value: number | null;
    currency: string;
    clients: { client_id: string; corporate_name: string } | null;
  };
  const endingSoon = (endingSoonRes.data ?? []) as unknown as EndingRow[];

  type DistRow = {
    press_release_id: string;
    title: string;
    distributed_at: string;
    release_type: string;
    clients: { client_id: string; corporate_name: string } | null;
  };
  const recentDistributions = (recentDistributionsRes.data ?? []) as unknown as DistRow[];

  type CoverageRow = {
    coverage_id: string;
    headline: string;
    publication_name: string;
    publication_date: string;
    sentiment: 'positive' | 'neutral' | 'negative' | null;
    ave_value: number | null;
    prv_value: number | null;
    currency: string;
    clients: { client_id: string; corporate_name: string } | null;
  };
  const recentCoverage = (recentCoverageRes.data ?? []) as unknown as CoverageRow[];

  // Group quarterly-results commitments by client, then ask the blackout
  // helper for the active window (if any) per client. Keeps the rule in
  // one place — the helper also drives the per-client banner.
  type BlackoutCommit = ClientDeliverable & {
    clients: { client_id: string; corporate_name: string } | null;
  };
  const blackoutCommits = (blackoutCommitmentsRes.data ?? []) as unknown as BlackoutCommit[];
  const byClient = new Map<
    string,
    { name: string; deliverables: ClientDeliverable[] }
  >();
  for (const c of blackoutCommits) {
    if (!c.clients) continue;
    const cur = byClient.get(c.clients.client_id) ?? {
      name: displayCompany(c.clients.corporate_name),
      deliverables: [],
    };
    cur.deliverables.push(c);
    byClient.set(c.clients.client_id, cur);
  }
  const clientsInBlackout: Array<{
    client_id: string;
    name: string;
    label: string;
    days_to_end: number;
  }> = [];
  for (const [clientId, info] of byClient.entries()) {
    const w = currentBlackout(info.deliverables);
    if (!w) continue;
    clientsInBlackout.push({
      client_id: clientId,
      name: info.name,
      label: w.label,
      days_to_end: w.days_to_end,
    });
  }
  clientsInBlackout.sort((a, b) => a.days_to_end - b.days_to_end);

  return (
    <div>
      <PageHeader
        title="Director Overview"
        description="Firm-wide snapshot — at-risk deadlines, this week's sessions, recent press, and renewal pipeline."
      />

      {/* KPI strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Active engagements" value={activeEngagementCount.toString()} />
        <Kpi label="Active clients" value={distinctActiveClients.toString()} />
        <Kpi label="Open commitments" value={openCommitmentCount.toString()} />
        <Kpi
          label="Overdue to-dos"
          value={overdueTodoCount.toString()}
          tone={overdueTodoCount > 0 ? 'warn' : undefined}
        />
        <Kpi
          label="Total contract value"
          value={`MYR ${totalContractValue.toLocaleString()}`}
        />
      </div>

      {clientsInBlackout.length > 0 && (
        <div
          role="alert"
          className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-xl" aria-hidden>
              ⚠️
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-800">
                Bursa closed period — {clientsInBlackout.length} client
                {clientsInBlackout.length === 1 ? '' : 's'} in blackout
              </p>
              <p className="mt-0.5 text-[12px] text-amber-700">
                Avoid distributing non-public financials, hosting briefings on
                unannounced numbers, or sharing draft results until the
                announcement is filed.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {clientsInBlackout.map((c) => (
                  <li key={c.client_id}>
                    <Link
                      href={`/clients/${c.client_id}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                    >
                      {c.name}
                      <span className="text-[10px] uppercase tracking-wide text-amber-600">
                        · {c.label}
                      </span>
                      <span className="text-[10px] tabular-nums text-amber-700">
                        {c.days_to_end <= 0
                          ? 'today'
                          : `${c.days_to_end}d`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <Section title={`Upcoming deadlines · next 14 days (${upcomingDeadlines.length})`}>
          {upcomingDeadlines.length === 0 ? (
            <EmptyMini>No commitments due in the next 14 days.</EmptyMini>
          ) : (
            <ul className="divide-y divide-aegis-gray-100">
              {upcomingDeadlines.map((d) => {
                const days = daysFromNow(d.due_date) ?? 0;
                const isBursa = d.auto_generated_key?.startsWith('bursa:');
                return (
                  <li key={d.client_deliverable_id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {d.clients && (
                        <Link
                          href={`/clients/${d.clients.client_id}`}
                          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
                        >
                          {displayCompany(d.clients.corporate_name)}
                        </Link>
                      )}
                      {isBursa && (
                        <span className="inline-flex items-center rounded-full bg-aegis-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-orange/30">
                          Bursa
                        </span>
                      )}
                      <span className="ml-auto text-[11px] tabular-nums text-aegis-gray-500">
                        {fmtDate(d.due_date)}
                        <span
                          className={
                            days <= 3 ? ' font-medium text-red-600' : ' text-aegis-gray-300'
                          }
                        >
                          {' '}
                          · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`}
                        </span>
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-aegis-gray">{d.label}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* This week's sessions */}
        <Section title={`This week's sessions (${weekSessions.length})`}>
          {weekSessions.length === 0 ? (
            <EmptyMini>No sessions scheduled in the next 7 days.</EmptyMini>
          ) : (
            <ul className="divide-y divide-aegis-gray-100">
              {weekSessions.map((s) => (
                <li key={s.schedule_id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium tabular-nums text-aegis-navy">
                      {fmtDateTime(s.scheduled_at)}
                    </span>
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                        SCHEDULE_BADGE[s.status],
                      ].join(' ')}
                    >
                      {SCHEDULE_STATUS_LABEL[s.status]}
                    </span>
                    {s.client_deliverables?.clients && (
                      <Link
                        href={`/clients/${s.client_deliverables.clients.client_id}`}
                        className="ml-auto text-[11px] text-aegis-gray-500 hover:text-aegis-navy"
                      >
                        {displayCompany(s.client_deliverables.clients.corporate_name)}
                      </Link>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-aegis-gray">
                    {s.client_deliverables?.label ?? '—'}
                    {s.location && (
                      <span className="text-aegis-gray-500"> · {s.location}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Renewal pipeline */}
        <Section title={`Engagements ending soon · 60 days (${endingSoon.length})`}>
          {endingSoon.length === 0 ? (
            <EmptyMini>No engagements ending in the next 60 days.</EmptyMini>
          ) : (
            <ul className="divide-y divide-aegis-gray-100">
              {endingSoon.map((e) => {
                const days = daysFromNow(e.end_date) ?? 0;
                return (
                  <li key={e.engagement_id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.clients && (
                        <Link
                          href={`/clients/${e.clients.client_id}`}
                          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
                        >
                          {displayCompany(e.clients.corporate_name)}
                        </Link>
                      )}
                      <span className="text-[11px] text-aegis-gray-500">{displayName(e.name)}</span>
                      <span className="ml-auto text-[11px] tabular-nums text-aegis-gray-500">
                        Ends {fmtDate(e.end_date)}
                        <span
                          className={
                            days <= 14 ? ' font-medium text-amber-700' : ' text-aegis-gray-300'
                          }
                        >
                          {' '}
                          · in {days}d
                        </span>
                      </span>
                    </div>
                    {e.contract_value != null && (
                      <p className="mt-0.5 text-[11px] tabular-nums text-aegis-gray-500">
                        {e.currency} {e.contract_value.toLocaleString()}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        {/* Recent distributions */}
        <Section title={`Recently distributed press releases (${recentDistributions.length})`}>
          {recentDistributions.length === 0 ? (
            <EmptyMini>No press releases distributed yet.</EmptyMini>
          ) : (
            <ul className="divide-y divide-aegis-gray-100">
              {recentDistributions.map((p) => (
                <li key={p.press_release_id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.clients && (
                      <Link
                        href={`/clients/${p.clients.client_id}`}
                        className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
                      >
                        {displayCompany(p.clients.corporate_name)}
                      </Link>
                    )}
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                        PRESS_BADGE.distributed,
                      ].join(' ')}
                    >
                      {PRESS_RELEASE_STATUS_LABEL.distributed}
                    </span>
                    <span className="ml-auto text-[11px] tabular-nums text-aegis-gray-500">
                      {fmtDate(p.distributed_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-aegis-gray">{p.title}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Recent coverage */}
        <Section title={`Latest media coverage (${recentCoverage.length})`}>
          {recentCoverage.length === 0 ? (
            <EmptyMini>No coverage logged yet.</EmptyMini>
          ) : (
            <ul className="divide-y divide-aegis-gray-100">
              {recentCoverage.map((c) => (
                <li key={c.coverage_id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {c.clients && (
                      <Link
                        href={`/clients/${c.clients.client_id}`}
                        className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
                      >
                        {displayCompany(c.clients.corporate_name)}
                      </Link>
                    )}
                    {c.sentiment && (
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                          c.sentiment === 'positive'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : c.sentiment === 'negative'
                              ? 'bg-red-50 text-red-700 ring-red-200'
                              : 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
                        ].join(' ')}
                      >
                        {c.sentiment}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-aegis-gray-500">
                      {fmtDate(c.publication_date)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-aegis-gray">
                    {c.headline}
                    <span className="text-aegis-gray-500"> · {displayCompany(c.publication_name)}</span>
                  </p>
                  {(c.ave_value != null || c.prv_value != null) && (
                    <p className="mt-0.5 text-[11px] tabular-nums text-aegis-gray-500">
                      {c.ave_value != null && (
                        <>AVE: {c.currency} {c.ave_value.toLocaleString()}</>
                      )}
                      {c.ave_value != null && c.prv_value != null && ' · '}
                      {c.prv_value != null && (
                        <>PRV: {c.currency} {c.prv_value.toLocaleString()}</>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warn';
}) {
  return (
    <div
      className={[
        'rounded-lg border px-4 py-3',
        tone === 'warn'
          ? 'border-red-200 bg-red-50/40'
          : 'border-aegis-gray-100 bg-white',
      ].join(' ')}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
        {label}
      </p>
      <p
        className={[
          'mt-1 text-lg font-semibold tabular-nums',
          tone === 'warn' ? 'text-red-600' : 'text-aegis-navy',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
