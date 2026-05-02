import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs, DetailHeader, Field, FieldGrid, Section,
} from '@/components/detail-shell';
import type { MediaContact } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
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

  return (
    <div>
      <Breadcrumbs items={[
        { href: '/media', label: 'Media Contacts' },
        { label: contact.full_name },
      ]} />

      <DetailHeader
        title={contact.full_name}
        subtitle={
          [contact.company_name, contact.state].filter(Boolean).join(' · ') || undefined
        }
        actions={<MediaRowActions row={contact} />}
      />

      <Section title="Profile">
        <FieldGrid>
          <Field label="Name">{contact.full_name}</Field>
          <Field label="Company name">
            {contact.company_name ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="State">
            {contact.state ?? <span className="text-aegis-gray-300">—</span>}
          </Field>
          <Field label="Contact number">
            {contact.contact_number ? (
              (() => {
                const wa = whatsAppUrl(contact.contact_number);
                return wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 tabular-nums text-aegis-navy hover:text-emerald-600"
                    title="Open WhatsApp chat"
                  >
                    <WhatsAppIcon className="h-4 w-4 text-emerald-500" />
                    {contact.contact_number}
                  </a>
                ) : (
                  <span className="tabular-nums text-aegis-gray">{contact.contact_number}</span>
                );
              })()
            ) : (
              <span className="text-aegis-gray-300">—</span>
            )}
          </Field>
          <Field label="Email">
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="text-aegis-navy hover:text-aegis-orange"
              >
                {contact.email}
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
