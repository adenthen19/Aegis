import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import { EmptyMini, Section } from '@/components/detail-shell';
import {
  DELIVERABLE_KIND_LABEL,
  type DeliverableTemplate,
  type ServiceTier,
} from '@/lib/types';
import NewTemplate from './new-template';
import TemplateRowActions from './row-actions';

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

export default async function AdminDeliverableTemplatesPage() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deliverable_templates')
    .select('*')
    .order('service_tier', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as DeliverableTemplate[];

  const grouped = new Map<ServiceTier, DeliverableTemplate[]>();
  for (const r of rows) {
    const list = grouped.get(r.service_tier) ?? [];
    list.push(r);
    grouped.set(r.service_tier, list);
  }

  return (
    <div>
      <PageHeader
        title="Deliverable Templates"
        description="Standard commitments seeded into a client when a service tier is selected. Only Super Admins see this page."
        action={<NewTemplate />}
      />

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      {rows.length === 0 ? (
        <EmptyMini>
          No templates yet. Add one to start seeding deliverables on new clients.
        </EmptyMini>
      ) : (
        Array.from(grouped.entries()).map(([tier, list]) => (
          <Section key={tier} title={`${TIER_LABEL[tier]} (${list.length})`}>
            <ul className="divide-y divide-aegis-gray-100">
              {list.map((t) => (
                <li
                  key={t.template_id}
                  className="flex items-start gap-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-aegis-gray">{t.label}</span>
                      <span
                        className={[
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                          t.is_active
                            ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
                            : 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
                        ].join(' ')}
                      >
                        {t.is_active ? 'active' : 'disabled'}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
                      <span>{DELIVERABLE_KIND_LABEL[t.kind]}</span>
                      {t.kind === 'recurring' && t.default_target_count != null && (
                        <span>Default target: {t.default_target_count}</span>
                      )}
                      <span>Order: {t.display_order}</span>
                    </div>
                  </div>
                  <TemplateRowActions row={t} />
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </div>
  );
}
