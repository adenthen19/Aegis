import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs,
  DetailHeader,
  EmptyMini,
  Field,
  FieldGrid,
  Section,
} from '@/components/detail-shell';
import {
  INDUSTRY_LABEL,
  MARKET_SEGMENT_LABEL,
  type ActionItem,
  type Client,
  type ClientDeliverable,
  type Engagement,
  type Profile,
  type ProjectStatus,
  type ServiceTier,
} from '@/lib/types';
import ClientRowActions from '../row-actions';
import ActionItemToggle from '../../meetings/action-item-toggle';
import NewTodo from '../../todos/new-todo';
import DeliverablesSection from './deliverables-section';
import NewCustomCommitment from './new-custom-commitment';
import EngagementsSection from './engagements-section';

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR', pr: 'PR', esg: 'ESG', virtual_meeting: 'Virtual Meeting',
  ipo: 'IPO', agm_egm: 'AGM/EGM', social_media: 'Social Media', event_management: 'Event Management',
};

const STATUS_DOT: Record<ProjectStatus, string> = {
  pending: 'bg-aegis-gold',
  upcoming: 'bg-aegis-blue',
  completed: 'bg-aegis-gray-300',
};

type Project = {
  project_id: string;
  deliverable_name: string;
  status: ProjectStatus;
  deadline: string | null;
};

type Meeting = {
  meeting_id: string;
  meeting_format: 'physical' | 'online';
  meeting_date: string;
  attendees: string | null;
  key_takeaways: string | null;
  analysts: { institution_name: string } | null;
};

type Todo = ActionItem & {
  profiles: { display_name: string | null; email: string } | null;
  meetings: { meeting_id: string; meeting_date: string } | null;
};

function profileLabel(p: { display_name: string | null; email: string } | null): string {
  if (!p) return 'Unassigned';
  return p.display_name || p.email;
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id } = await params;
  const supabase = await createClient();

  const profileSelect =
    'profiles ( user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role )';

  const [
    clientRes,
    projectsRes,
    meetingsRes,
    directTodosRes,
    meetingTodosRes,
    allClientsRes,
    allProfilesRes,
    userRes,
    deliverablesRes,
    schedulesRes,
    analystsListRes,
    engagementsRes,
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('client_id', client_id).maybeSingle(),
    supabase
      .from('projects')
      .select('project_id, deliverable_name, status, deadline')
      .eq('client_id', client_id)
      .order('deadline', { ascending: true, nullsFirst: false }),
    supabase
      .from('meetings')
      .select('meeting_id, meeting_format, meeting_date, attendees, key_takeaways, analysts ( institution_name )')
      .eq('client_id', client_id)
      .order('meeting_date', { ascending: false })
      .limit(10),
    supabase
      .from('action_items')
      .select(`*, ${profileSelect}, meetings ( meeting_id, meeting_date )`)
      .eq('client_id', client_id)
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('action_items')
      .select(`*, ${profileSelect}, meetings!inner ( meeting_id, meeting_date, client_id )`)
      .eq('meetings.client_id', client_id)
      .eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
    supabase
      .from('profiles')
      .select('user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role')
      .order('display_name'),
    supabase.auth.getUser(),
    supabase
      .from('client_deliverables')
      .select('*')
      .eq('client_id', client_id)
      .order('service_tier', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('deliverable_schedule')
      .select(
        '*, ' +
          'client_deliverables!inner ( client_id ), ' +
          'attendees:deliverable_schedule_attendees ( *, analysts ( full_name, institution_name ) )',
      )
      .eq('client_deliverables.client_id', client_id)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('analysts')
      .select('investor_id, institution_name, full_name')
      .order('institution_name'),
    supabase
      .from('engagements')
      .select('*')
      .eq('client_id', client_id)
      .order('start_date', { ascending: false }),
  ]);

  const client = clientRes.data as Client | null;
  if (!client) notFound();

  const projects = (projectsRes.data ?? []) as Project[];
  const meetings = (meetingsRes.data ?? []) as unknown as Meeting[];

  const todoMap = new Map<string, Todo>();
  for (const t of (directTodosRes.data ?? []) as unknown as Todo[]) {
    todoMap.set(t.action_item_id, t);
  }
  for (const t of (meetingTodosRes.data ?? []) as unknown as Todo[]) {
    if (!todoMap.has(t.action_item_id)) todoMap.set(t.action_item_id, t);
  }
  const todos = Array.from(todoMap.values()).sort((a, b) => {
    const ad = a.due_date ?? '￿';
    const bd = b.due_date ?? '￿';
    if (ad !== bd) return ad.localeCompare(bd);
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });

  const allClients = allClientsRes.data ?? [];
  const allProfiles = (allProfilesRes.data ?? []) as Profile[];
  const currentUserId = userRes.data.user?.id ?? null;
  const allDeliverables = (deliverablesRes.data ?? []) as ClientDeliverable[];
  const engagements = (engagementsRes.data ?? []) as Engagement[];
  const activeEngagement =
    engagements.find((e) => e.status === 'active') ?? null;
  // Scope the visible commitments to the active engagement so the on-track
  // view reflects the current contract period. Deliverables on past
  // engagements remain queryable via the engagements list itself.
  const deliverables = activeEngagement
    ? allDeliverables.filter((d) => d.engagement_id === activeEngagement.engagement_id)
    : allDeliverables;
  const openDeliverableCount = deliverables.filter(
    (d) => d.status !== 'completed' && d.status !== 'not_applicable',
  ).length;

  type ScheduleAttendeeJoin = {
    attendee_id: string;
    schedule_id: string;
    investor_id: string | null;
    name: string | null;
    affiliation: string | null;
    note: string | null;
    created_at: string;
    analysts: { full_name: string | null; institution_name: string } | null;
  };
  type ScheduleJoin = {
    schedule_id: string;
    client_deliverable_id: string;
    engagement_id: string;
    meeting_id: string | null;
    scheduled_at: string;
    location: string | null;
    status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
    notes: string | null;
    created_by_user_id: string | null;
    updated_by_user_id: string | null;
    created_at: string;
    updated_at: string;
    attendees: ScheduleAttendeeJoin[] | null;
  };
  const schedulesRaw = (schedulesRes.data ?? []) as unknown as ScheduleJoin[];
  const schedulesByDeliverable: Record<string, (ScheduleJoin & { attendees: ScheduleAttendeeJoin[] })[]> = {};
  for (const s of schedulesRaw) {
    const list = schedulesByDeliverable[s.client_deliverable_id] ?? [];
    list.push({ ...s, attendees: s.attendees ?? [] });
    schedulesByDeliverable[s.client_deliverable_id] = list;
  }
  const analystsList = (analystsListRes.data ?? []) as {
    investor_id: string;
    institution_name: string;
    full_name: string | null;
  }[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  function isOverdue(due: string | null): boolean {
    if (!due) return false;
    return new Date(due) < today;
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: '/clients', label: 'Clients' },
          { label: client.corporate_name },
        ]}
      />

      <DetailHeader
        title={
          <span className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-aegis-gray-100 bg-aegis-gray-50">
              {client.logo_url ? (
                <Image
                  src={client.logo_url}
                  alt={client.corporate_name}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-[10px] font-medium uppercase text-aegis-gray-300">
                  {client.corporate_name.slice(0, 2)}
                </span>
              )}
            </span>
            <span>{client.corporate_name}</span>
          </span>
        }
        subtitle={
          [
            client.ticker_code && `Ticker ${client.ticker_code}`,
            client.industry && INDUSTRY_LABEL[client.industry],
            client.market_segment && MARKET_SEGMENT_LABEL[client.market_segment],
          ].filter(Boolean).join(' · ') || undefined
        }
        badges={
          <div className="flex flex-wrap gap-1.5">
            {client.service_tier.map((t) => (
              <span
                key={t}
                className="inline-flex rounded-full bg-aegis-navy-50 px-2.5 py-0.5 text-xs font-medium text-aegis-navy"
              >
                {TIER_LABEL[t]}
              </span>
            ))}
          </div>
        }
        actions={<ClientRowActions row={client} />}
      />

      <Section title="Profile">
        <FieldGrid>
          <Field label="Company name">{client.corporate_name}</Field>
          <Field label="Ticker code">
            {client.ticker_code ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Industry">
            {client.industry ? INDUSTRY_LABEL[client.industry] : <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Market segment">
            {client.market_segment ? MARKET_SEGMENT_LABEL[client.market_segment] : <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="CEO">
            {client.ceo_name ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="CFO">
            {client.cfo_name ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Financial year end">
            {client.financial_year_end ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Current financial quarter">
            {client.financial_quarter
              ? new Date(client.financial_quarter).toLocaleDateString()
              : <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="IPO status">
            {client.ipo_status
              ? <span className="capitalize">{client.ipo_status}</span>
              : <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Internal controls audit">
            {client.internal_controls_audit ? 'Yes' : 'No'}
          </Field>
        </FieldGrid>
      </Section>

      {client.advisory_syndicate != null &&
        Array.isArray(client.advisory_syndicate) &&
        (client.advisory_syndicate as unknown[]).length > 0 && (
          <Section title="Advisory syndicate">
            <ul className="flex flex-wrap gap-2">
              {(client.advisory_syndicate as string[]).map((adv, i) => (
                <li
                  key={i}
                  className="inline-flex rounded-md border border-aegis-gray-100 bg-aegis-gray-50/60 px-3 py-1 text-xs text-aegis-gray"
                >
                  {String(adv)}
                </li>
              ))}
            </ul>
          </Section>
        )}

      <Section title={`Engagements (${engagements.length})`}>
        <EngagementsSection
          clientId={client.client_id}
          clientTiers={client.service_tier}
          engagements={engagements}
        />
      </Section>

      <Section
        title={
          activeEngagement
            ? `Commitments — ${activeEngagement.name} (${openDeliverableCount} open · ${deliverables.length} total)`
            : `Commitments (${openDeliverableCount} open · ${deliverables.length} total)`
        }
        action={
          activeEngagement ? (
            <NewCustomCommitment
              clientId={client.client_id}
              clientTiers={activeEngagement.service_tier}
            />
          ) : null
        }
      >
        {!activeEngagement ? (
          <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
            No active engagement. Open one above to start tracking commitments.
          </p>
        ) : (
          <DeliverablesSection
            rows={deliverables}
            schedulesByDeliverable={schedulesByDeliverable}
            analysts={analystsList}
          />
        )}
      </Section>

      <Section
        title={`Open to-dos (${todos.length})`}
        action={
          currentUserId ? (
            <NewTodo
              clients={allClients}
              profiles={allProfiles}
              currentUserId={currentUserId}
              defaultClientId={client.client_id}
              triggerLabel="Add to-do"
            />
          ) : null
        }
      >
        {todos.length === 0 ? (
          <EmptyMini>No pending to-dos for this client.</EmptyMini>
        ) : (
          <ul className="space-y-1.5">
            {todos.map((t) => {
              const overdue = isOverdue(t.due_date);
              return (
                <li
                  key={t.action_item_id}
                  className="flex items-start gap-3 rounded-md border border-aegis-gray-100 bg-white px-3 py-2"
                >
                  <ActionItemToggle actionItemId={t.action_item_id} status={t.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-aegis-gray">{t.item}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
                      <span>PIC: {profileLabel(t.profiles)}</span>
                      {t.due_date && (
                        <span className={overdue ? 'font-medium text-red-600' : ''}>
                          {overdue ? 'Overdue · ' : 'Due '}
                          {new Date(t.due_date).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      )}
                      {t.meetings && (
                        <Link
                          href={`/meetings/${t.meetings.meeting_id}`}
                          className="text-aegis-navy hover:text-aegis-orange"
                        >
                          From meeting ·{' '}
                          {new Date(t.meetings.meeting_date).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title={`Projects (${projects.length})`}
        action={
          <Link href="/projects" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
            View all →
          </Link>
        }
      >
        {projects.length === 0 ? (
          <EmptyMini>No projects logged for this client yet.</EmptyMini>
        ) : (
          <ul className="divide-y divide-aegis-gray-100">
            {projects.map((p) => (
              <li key={p.project_id} className="flex items-center gap-3 py-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status]}`} />
                <Link
                  href={`/projects/${p.project_id}`}
                  className="flex-1 truncate text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                >
                  {p.deliverable_name}
                </Link>
                <span className="shrink-0 text-xs capitalize text-aegis-gray-500">{p.status}</span>
                <span className="shrink-0 text-xs tabular-nums text-aegis-gray-500">
                  {p.deadline ? new Date(p.deadline).toLocaleDateString() : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Recent meetings (${meetings.length})`}
        action={
          <Link href="/meetings" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
            View all →
          </Link>
        }
      >
        {meetings.length === 0 ? (
          <EmptyMini>No meetings logged with this client yet.</EmptyMini>
        ) : (
          <ul className="divide-y divide-aegis-gray-100">
            {meetings.map((m) => (
              <li key={m.meeting_id} className="py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/meetings/${m.meeting_id}`}
                    className="text-xs font-medium tabular-nums text-aegis-navy hover:text-aegis-orange"
                  >
                    {new Date(m.meeting_date).toLocaleString(undefined, {
                      dateStyle: 'medium', timeStyle: 'short',
                    })}
                  </Link>
                  <span className="text-aegis-gray-200">·</span>
                  <span className="text-[11px] uppercase tracking-wide text-aegis-gray-500">
                    {m.meeting_format}
                  </span>
                  {m.analysts?.institution_name && (
                    <>
                      <span className="text-aegis-gray-200">·</span>
                      <span className="text-xs text-aegis-gray-500">{m.analysts.institution_name}</span>
                    </>
                  )}
                </div>
                {m.key_takeaways && (
                  <p className="mt-1 line-clamp-2 text-xs text-aegis-gray-500">{m.key_takeaways}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
