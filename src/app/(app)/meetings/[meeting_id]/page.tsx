import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, EmptyMini, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { Meeting } from '@/lib/types';
import MeetingRowActions from '../row-actions';

type MeetingWithRefs = Meeting & {
  clients: { client_id: string; corporate_name: string } | null;
  analysts: { investor_id: string; institution_name: string } | null;
};

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meeting_id: string }>;
}) {
  const { meeting_id } = await params;
  const supabase = await createClient();

  const [meetingRes, clientsRes, analystsRes] = await Promise.all([
    supabase
      .from('meetings')
      .select('*, clients ( client_id, corporate_name ), analysts ( investor_id, institution_name )')
      .eq('meeting_id', meeting_id)
      .maybeSingle(),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
    supabase.from('analysts').select('investor_id, institution_name').order('institution_name'),
  ]);

  const meeting = meetingRes.data as unknown as MeetingWithRefs | null;
  if (!meeting) notFound();

  const clientsList = clientsRes.data ?? [];
  const analystsList = analystsRes.data ?? [];

  const dateLabel = new Date(meeting.meeting_date).toLocaleString(undefined, {
    dateStyle: 'full', timeStyle: 'short',
  });

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/meetings', label: 'Meetings' },
        { label: dateLabel },
      ]} />

      <DetailHeader
        title={dateLabel}
        subtitle={
          [meeting.clients?.corporate_name, meeting.analysts?.institution_name]
            .filter(Boolean)
            .join(' × ') || undefined
        }
        badges={
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset',
              meeting.meeting_format === 'physical'
                ? 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20'
                : 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
            ].join(' ')}
          >
            {meeting.meeting_format}
          </span>
        }
        actions={
          <MeetingRowActions row={meeting} clients={clientsList} analysts={analystsList} />
        }
      />

      <Section title="Engagement">
        <FieldGrid>
          <Field label="Date & time">{dateLabel}</Field>
          <Field label="Format"><span className="capitalize">{meeting.meeting_format}</span></Field>
          <Field label="Client">
            {meeting.clients ? (
              <Link
                href={`/clients/${meeting.clients.client_id}`}
                className="text-aegis-navy hover:text-aegis-orange"
              >
                {meeting.clients.corporate_name}
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
                {meeting.analysts.institution_name}
              </Link>
            ) : (
              <span className="text-aegis-gray-300">—</span>
            )}
          </Field>
        </FieldGrid>
      </Section>

      <Section title="Attendees">
        {meeting.attendees ? (
          <p className="text-sm text-aegis-gray">{meeting.attendees}</p>
        ) : (
          <EmptyMini>No attendees recorded.</EmptyMini>
        )}
      </Section>

      <Section title="Key takeaways">
        {meeting.key_takeaways ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-aegis-gray">
            {meeting.key_takeaways}
          </p>
        ) : (
          <EmptyMini>No takeaways recorded.</EmptyMini>
        )}
      </Section>
    </div>
  );
}
