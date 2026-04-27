import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';

/**
 * Firm-wide activity feed. Derives from the audit columns on every business
 * table — no separate `activity_log` table — so the feed is always
 * consistent with reality without us needing to remember to write to a
 * journal on every action. Recent rows from each table are merged and
 * sorted by created_at desc.
 */

const PER_TABLE_LIMIT = 30;
const FEED_LIMIT = 100;

type ActorJoin = {
  display_name: string | null;
  email: string;
  avatar_url: string | null;
} | null;

type ClientLink = { client_id: string; corporate_name: string } | null;

type FeedItem = {
  id: string;
  at: string; // ISO timestamp
  actor: ActorJoin;
  verb: string;
  detail: string;
  href: string | null;
  client: ClientLink;
};

function actorLabel(a: ActorJoin): string {
  if (!a) return 'Someone';
  return (a.display_name && a.display_name.trim()) || a.email;
}

function actorInitial(a: ActorJoin): string {
  const name = actorLabel(a);
  return name.charAt(0).toUpperCase() || '?';
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default async function ActivityPage() {
  const supabase = await createClient();
  const profileSelect =
    'profiles!created_by_user_id ( display_name, email, avatar_url )';
  const clientSelect = 'clients ( client_id, corporate_name )';

  const [
    todosRes,
    deliverablesRes,
    schedulesRes,
    pressRes,
    coverageRes,
    engagementsRes,
    stakeholdersRes,
    documentsRes,
    analystsRes,
    mediaRes,
    reportsRes,
  ] = await Promise.all([
    supabase
      .from('action_items')
      .select(`action_item_id, item, created_at, ${profileSelect}, ${clientSelect}`)
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('client_deliverables')
      .select(
        `client_deliverable_id, label, created_at, ${profileSelect}, ${clientSelect}`,
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('deliverable_schedule')
      .select(
        `schedule_id, scheduled_at, location, status, created_at, ${profileSelect}, ` +
          'client_deliverables ( label, clients ( client_id, corporate_name ) )',
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('press_releases')
      .select(
        `press_release_id, title, status, distributed_at, created_at, ${profileSelect}, ${clientSelect}`,
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('media_coverage')
      .select(
        `coverage_id, headline, publication_name, created_at, ${profileSelect}, ${clientSelect}`,
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('engagements')
      .select(`engagement_id, name, status, created_at, ${profileSelect}, ${clientSelect}`)
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('client_stakeholders')
      .select(
        `stakeholder_id, full_name, role, created_at, ${profileSelect}, ${clientSelect}`,
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('documents')
      .select(`document_id, name, category, created_at, ${profileSelect}, ${clientSelect}`)
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('analysts')
      .select(`investor_id, full_name, institution_name, created_at, ${profileSelect}`)
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('media_contacts')
      .select(`media_id, full_name, company_name, created_at, ${profileSelect}`)
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
    supabase
      .from('pr_value_reports')
      .select(
        `report_id, title, period_start, period_end, created_at, ${profileSelect}, ${clientSelect}`,
      )
      .order('created_at', { ascending: false })
      .limit(PER_TABLE_LIMIT),
  ]);

  const items: FeedItem[] = [];

  function pushIfPresent<T>(rows: T[] | null | undefined, fn: (r: T) => FeedItem | null) {
    for (const r of rows ?? []) {
      const item = fn(r);
      if (item) items.push(item);
    }
  }

  type Row = {
    [k: string]: unknown;
    profiles: ActorJoin;
    clients?: ClientLink;
    created_at: string;
  };

  pushIfPresent(todosRes.data as Row[] | null, (r) => ({
    id: `todo:${r.action_item_id as string}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Created to-do',
    detail: (r.item as string) ?? '—',
    href: null,
    client: r.clients ?? null,
  }));

  pushIfPresent(deliverablesRes.data as Row[] | null, (r) => ({
    id: `deliv:${r.client_deliverable_id as string}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Added commitment',
    detail: (r.label as string) ?? '—',
    href: null,
    client: r.clients ?? null,
  }));

  type ScheduleRow = Row & {
    schedule_id: string;
    scheduled_at: string;
    location: string | null;
    status: string;
    client_deliverables: {
      label: string;
      clients: ClientLink;
    } | null;
  };
  pushIfPresent(schedulesRes.data as ScheduleRow[] | null, (r) => {
    const when = new Date(r.scheduled_at).toLocaleDateString(undefined, {
      dateStyle: 'medium',
    });
    const label = r.client_deliverables?.label ?? 'Session';
    return {
      id: `schedule:${r.schedule_id}`,
      at: r.created_at,
      actor: r.profiles,
      verb: 'Scheduled session',
      detail: `${label} — ${when}${r.location ? ` @ ${r.location}` : ''}`,
      href: null,
      client: r.client_deliverables?.clients ?? null,
    };
  });

  type PressRow = Row & {
    press_release_id: string;
    title: string;
    status: string;
    distributed_at: string | null;
  };
  pushIfPresent(pressRes.data as PressRow[] | null, (r) => ({
    id: `press:${r.press_release_id}`,
    at: r.distributed_at ?? r.created_at,
    actor: r.profiles,
    verb: r.status === 'distributed' ? 'Distributed press release' : 'Drafted press release',
    detail: r.title,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  type CoverageRow = Row & {
    coverage_id: string;
    headline: string;
    publication_name: string;
  };
  pushIfPresent(coverageRes.data as CoverageRow[] | null, (r) => ({
    id: `coverage:${r.coverage_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Logged coverage',
    detail: `${r.headline} — ${r.publication_name}`,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  type EngagementRow = Row & {
    engagement_id: string;
    name: string;
    status: string;
  };
  pushIfPresent(engagementsRes.data as EngagementRow[] | null, (r) => ({
    id: `eng:${r.engagement_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Opened engagement',
    detail: r.name,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  type StakeholderRow = Row & {
    stakeholder_id: string;
    full_name: string;
    role: string;
  };
  pushIfPresent(stakeholdersRes.data as StakeholderRow[] | null, (r) => ({
    id: `stake:${r.stakeholder_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Added stakeholder',
    detail: `${r.full_name} (${r.role})`,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  type DocumentRow = Row & {
    document_id: string;
    name: string;
    category: string;
  };
  pushIfPresent(documentsRes.data as DocumentRow[] | null, (r) => ({
    id: `doc:${r.document_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Uploaded document',
    detail: `${r.name} (${r.category.replace(/_/g, ' ')})`,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  type AnalystRow = Row & {
    investor_id: string;
    full_name: string | null;
    institution_name: string;
  };
  pushIfPresent(analystsRes.data as AnalystRow[] | null, (r) => ({
    id: `analyst:${r.investor_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Added analyst',
    detail: r.full_name ? `${r.full_name} — ${r.institution_name}` : r.institution_name,
    href: `/analysts/${r.investor_id}`,
    client: null,
  }));

  type MediaRow = Row & {
    media_id: string;
    full_name: string;
    company_name: string | null;
  };
  pushIfPresent(mediaRes.data as MediaRow[] | null, (r) => ({
    id: `media:${r.media_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Added media contact',
    detail: r.company_name ? `${r.full_name} — ${r.company_name}` : r.full_name,
    href: `/media/${r.media_id}`,
    client: null,
  }));

  type ReportRow = Row & {
    report_id: string;
    title: string;
    period_start: string;
    period_end: string;
  };
  pushIfPresent(reportsRes.data as ReportRow[] | null, (r) => ({
    id: `report:${r.report_id}`,
    at: r.created_at,
    actor: r.profiles,
    verb: 'Generated PR value report',
    detail: `${r.title} (${r.period_start} → ${r.period_end})`,
    href: r.clients ? `/clients/${r.clients.client_id}` : null,
    client: r.clients ?? null,
  }));

  items.sort((a, b) => b.at.localeCompare(a.at));
  const top = items.slice(0, FEED_LIMIT);

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Recent changes across the workspace — to-dos, commitments, sessions, releases, coverage, and team additions."
      />

      {top.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-12 text-center text-sm text-aegis-gray-500">
          No recent activity.
        </p>
      ) : (
        <ol className="space-y-2">
          {top.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-md border border-aegis-gray-100 bg-white px-3 py-2.5"
            >
              {item.actor?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.actor.avatar_url}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-aegis-blue-50 text-[11px] font-semibold text-aegis-navy">
                  {actorInitial(item.actor)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-aegis-gray">
                  <span className="font-medium text-aegis-navy">
                    {actorLabel(item.actor)}
                  </span>{' '}
                  <span className="text-aegis-gray-500">{item.verb.toLowerCase()}</span>
                  {item.client && (
                    <>
                      {' '}
                      <span className="text-aegis-gray-500">on</span>{' '}
                      <Link
                        href={`/clients/${item.client.client_id}`}
                        className="font-medium text-aegis-navy hover:text-aegis-orange"
                      >
                        {item.client.corporate_name}
                      </Link>
                    </>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-aegis-gray-500">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="hover:text-aegis-navy"
                    >
                      {item.detail}
                    </Link>
                  ) : (
                    item.detail
                  )}
                </p>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-aegis-gray-300">
                {fmtTime(item.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
