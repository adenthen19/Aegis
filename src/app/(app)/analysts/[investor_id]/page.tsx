import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, EmptyMini, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { Analyst } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import {
  displayCompany,
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import WhatsAppIcon from '@/components/whatsapp-icon';
import AnalystRowActions from '../row-actions';

type Meeting = {
  meeting_id: string;
  meeting_format: 'physical' | 'online';
  meeting_date: string;
  summary: string | null;
  clients: { corporate_name: string } | null;
};

export default async function AnalystDetailPage({
  params,
}: {
  params: Promise<{ investor_id: string }>;
}) {
  const { investor_id } = await params;
  const supabase = await createClient();

  const [analystRes, meetingsRes] = await Promise.all([
    supabase.from('analysts').select('*').eq('investor_id', investor_id).maybeSingle(),
    supabase
      .from('meetings')
      .select('meeting_id, meeting_format, meeting_date, summary, clients ( corporate_name )')
      .eq('investor_id', investor_id)
      .order('meeting_date', { ascending: false })
      .limit(20),
  ]);

  const analyst = analystRes.data as Analyst | null;
  if (!analyst) notFound();

  const meetings = (meetingsRes.data ?? []) as unknown as Meeting[];
  const niceName = displayName(analyst.full_name ?? null);
  const niceInstitution = displayCompany(analyst.institution_name);
  const headerTitle = niceName || niceInstitution;

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/analysts', label: 'Analysts & Funds' },
        { label: headerTitle },
      ]} />

      <DetailHeader
        title={headerTitle}
        subtitle={
          [
            niceName ? niceInstitution : null,
            analyst.analyst_type === 'buy_side' ? 'Buy-side' : 'Sell-side',
          ].filter(Boolean).join(' · ') || undefined
        }
        actions={<AnalystRowActions row={analyst} />}
      />

      <Section title="Profile">
        <FieldGrid>
          <Field label="Name">
            {niceName || <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Institution">{niceInstitution}</Field>
          <Field label="Type">
            {analyst.analyst_type === 'buy_side' ? 'Buy-side' : 'Sell-side'}
          </Field>
          <Field label="Contact number">
            {analyst.contact_number ? (
              (() => {
                const wa = whatsAppUrl(analyst.contact_number);
                const display = displayPhone(analyst.contact_number);
                return wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 tabular-nums text-aegis-navy hover:text-emerald-600"
                    title="Open WhatsApp chat"
                  >
                    <WhatsAppIcon className="h-4 w-4 text-emerald-500" />
                    {display}
                  </a>
                ) : (
                  <span className="tabular-nums text-aegis-gray">{display}</span>
                );
              })()
            ) : (
              <span className="text-aegis-gray-300">—</span>
            )}
          </Field>
          <Field label="Email">
            {(() => {
              const lower = displayEmail(analyst.email);
              return lower ? (
                <a
                  href={`mailto:${lower}`}
                  className="text-aegis-navy hover:text-aegis-orange"
                >
                  {lower}
                </a>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              );
            })()}
          </Field>
        </FieldGrid>
      </Section>

      <Section
        title={`Meetings (${meetings.length})`}
        action={
          <Link href="/meetings" className="text-xs font-medium text-aegis-navy hover:text-aegis-orange">
            View all →
          </Link>
        }
      >
        {meetings.length === 0 ? (
          <EmptyMini>No meetings logged with this investor yet.</EmptyMini>
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
                  {m.clients?.corporate_name && (
                    <>
                      <span className="text-aegis-gray-200">·</span>
                      <span className="text-xs text-aegis-gray-500">
                        {displayCompany(m.clients.corporate_name)}
                      </span>
                    </>
                  )}
                </div>
                {m.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-aegis-gray-500">{m.summary}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
