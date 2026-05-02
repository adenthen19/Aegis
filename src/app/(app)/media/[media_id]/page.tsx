import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { MediaContact } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import {
  displayCompany,
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import WhatsAppIcon from '@/components/whatsapp-icon';
import MediaRowActions from '../row-actions';

export default async function MediaDetailPage({
  params,
}: {
  params: Promise<{ media_id: string }>;
}) {
  const { media_id } = await params;
  const supabase = await createClient();

  const { data } = await supabase.from('media_contacts').select('*').eq('media_id', media_id).maybeSingle();
  const contact = data as MediaContact | null;
  if (!contact) notFound();

  const niceName = displayName(contact.full_name);
  const niceCompany = displayCompany(contact.company_name);
  const niceEmail = displayEmail(contact.email);

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/media', label: 'Media Contacts' },
        { label: niceName },
      ]} />

      <DetailHeader
        title={niceName}
        subtitle={
          [niceCompany, contact.state].filter(Boolean).join(' · ') || undefined
        }
        actions={<MediaRowActions row={contact} />}
      />

      <Section title="Profile">
        <FieldGrid>
          <Field label="Name">{niceName}</Field>
          <Field label="Company name">
            {niceCompany || <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="State">
            {contact.state ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Contact number">
            {contact.contact_number ? (
              (() => {
                const wa = whatsAppUrl(contact.contact_number);
                const display = displayPhone(contact.contact_number);
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
            {niceEmail ? (
              <a
                href={`mailto:${niceEmail}`}
                className="text-aegis-navy hover:text-aegis-orange"
              >
                {niceEmail}
              </a>
            ) : (
              <span className="text-aegis-gray-300">—</span>
            )}
          </Field>
        </FieldGrid>
      </Section>
    </div>
  );
}
