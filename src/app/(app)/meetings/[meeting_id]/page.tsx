import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, EmptyMini, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { ActionItem, Meeting, Profile } from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';
import MeetingRowActions from '../row-actions';
import ActionItemToggle from '../action-item-toggle';

type MeetingWithRefs = Meeting & {
  clients: { client_id: string; corporate_name: string } | null;
  analysts: { investor_id: string; institution_name: string } | null;
  meeting_attendees: { user_id: string; profiles: Profile | null }[];
  action_items: (ActionItem & { profiles: Profile | null })[];
};

function profileLabel(p: Profile | null | undefined): string {
  if (!p) return 'Unassigned';
  const friendly = displayName(p.display_name ?? '');
  return friendly || p.email.toLowerCase();
}

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meeting_id: string }>;
}) {
  const { meeting_id } = await params;
  const supabase = await createClient();

  const [meetingRes, clientsRes, analystsRes, profilesRes] = await Promise.all([
    supabase
      .from('meetings')
      .select(
        '*, ' +
          'clients ( client_id, corporate_name ), ' +
          'analysts ( investor_id, institution_name ), ' +
          'meeting_attendees ( user_id, profiles ( user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role, birthday ) ), ' +
          'action_items ( *, profiles ( user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role, birthday ) )',
      )
      .eq('meeting_id', meeting_id)
      .maybeSingle(),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
    supabase.from('analysts').select('investor_id, institution_name').order('institution_name'),
    supabase
      .from('profiles')
      .select('user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role, birthday')
      .order('display_name'),
  ]);

  const meeting = meetingRes.data as unknown as MeetingWithRefs | null;
  if (!meeting) notFound();

  const clientsList = clientsRes.data ?? [];
  const analystsList = analystsRes.data ?? [];
  const profilesList = profilesRes.data ?? [];
  const attendeeUserIds = meeting.meeting_attendees.map((a) => a.user_id);

  const dateLabel = new Date(meeting.meeting_date).toLocaleString(undefined, {
    dateStyle: 'full', timeStyle: 'short',
  });
  const isInternal = meeting.meeting_type === 'internal';
  const linked = [
    meeting.clients?.corporate_name
      ? displayCompany(meeting.clients.corporate_name)
      : null,
    meeting.analysts?.institution_name
      ? displayCompany(meeting.analysts.institution_name)
      : null,
  ]
    .filter(Boolean)
    .join(' × ');

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/meetings', label: 'Meetings' },
        { label: dateLabel },
      ]} />

      <DetailHeader
        title={dateLabel}
        subtitle={isInternal ? 'Internal meeting' : linked || 'Briefing'}
        badges={
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset',
              isInternal
                ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
                : 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20',
            ].join(' ')}
          >
            {meeting.meeting_type}
          </span>
        }
        actions={
          <MeetingRowActions
            row={meeting}
            attendeeUserIds={attendeeUserIds}
            actionItems={meeting.action_items}
            clients={clientsList}
            analysts={analystsList}
            profiles={profilesList}
          />
        }
      />

      <Section title="Engagement">
        <FieldGrid>
          <Field label="Date & time">{dateLabel}</Field>
          <Field label="Format"><span className="capitalize">{meeting.meeting_format}</span></Field>
          <Field label="Location">
            {meeting.location ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          {!isInternal && (
            <>
              <Field label="Client">
                {meeting.clients ? (
                  <Link
                    href={`/clients/${meeting.clients.client_id}`}
                    className="text-aegis-navy hover:text-aegis-orange"
                  >
                    {displayCompany(meeting.clients.corporate_name)}
                  </Link>
                ) : (
                  <span className="text-aegis-gray-300">—</span>
                )}
              </Field>
              <Field label="Investor / fund">
                {meeting.analysts ? (
                  <Link
                    href={`/analysts/${meeting.analysts.investor_id}`}
                    className="text-aegis-navy hover:text-aegis-orange"
                  >
                    {displayCompany(meeting.analysts.institution_name)}
                  </Link>
                ) : (
                  <span className="text-aegis-gray-300">—</span>
                )}
              </Field>
            </>
          )}
        </FieldGrid>
      </Section>

      <Section title="Attendees">
        {meeting.meeting_attendees.length === 0 ? (
          <EmptyMini>No attendees recorded.</EmptyMini>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {meeting.meeting_attendees.map((a) => (
              <li
                key={a.user_id}
                className="inline-flex items-center rounded-full bg-aegis-blue-50 px-2.5 py-0.5 text-xs font-medium text-aegis-navy ring-1 ring-inset ring-aegis-blue/30"
              >
                {profileLabel(a.profiles)}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {isInternal && (
        <Section title="Agenda">
          {meeting.agenda_items.length === 0 ? (
            <EmptyMini>No agenda items.</EmptyMini>
          ) : (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-aegis-gray">
              {meeting.agenda_items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          )}
        </Section>
      )}

      {!isInternal && (
        <Section title="Summary">
          {meeting.summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-aegis-gray">
              {meeting.summary}
            </p>
          ) : (
            <EmptyMini>No summary recorded.</EmptyMini>
          )}
        </Section>
      )}

      <Section title="Action items">
        {meeting.action_items.length === 0 ? (
          <EmptyMini>No action items.</EmptyMini>
        ) : (
          <ul className="space-y-1.5">
            {meeting.action_items.map((a) => (
              <li
                key={a.action_item_id}
                className="flex items-start gap-3 rounded-md border border-aegis-gray-100 bg-white px-3 py-2"
              >
                <ActionItemToggle actionItemId={a.action_item_id} status={a.status} />
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-sm',
                      a.status === 'done' ? 'text-aegis-gray-300 line-through' : 'text-aegis-gray',
                    ].join(' ')}
                  >
                    {a.item}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
                    <span>PIC: {profileLabel(a.profiles)}</span>
                    {a.due_date && (
                      <span>
                        Due {new Date(a.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {meeting.other_remarks && (
        <Section title="Other remarks">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-aegis-gray">
            {meeting.other_remarks}
          </p>
        </Section>
      )}
    </div>
  );
}
