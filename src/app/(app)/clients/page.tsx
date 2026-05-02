import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import FilterTabs from '@/components/ui/filter-tabs';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import {
  INDUSTRY_LABEL,
  MARKET_SEGMENT_LABEL,
  type Client,
  type ServiceTier,
} from '@/lib/types';
import { displayCompany } from '@/lib/display-format';
import NewClient from './new-client';
import ClientRowActions from './row-actions';
import ImportClients from './import-clients';

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR', pr: 'PR', esg: 'ESG', virtual_meeting: 'Virtual',
  ipo: 'IPO', agm_egm: 'AGM/EGM', social_media: 'Social', event_management: 'Events',
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(['corporate_name', 'ticker_code', 'industry', 'market_segment', 'created_at']);

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string; scope?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const scope = params.scope === 'mine' ? 'mine' : 'all';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'corporate_name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // "Mine only" definition: clients I have any connection to — either I own
  // a to-do tied to them, or I created an engagement for them. Two short
  // queries up front collect the eligible client_ids; the main query then
  // filters with .in(). Cheap because action_items + engagements are small.
  let mineClientIds: string[] | null = null;
  if (scope === 'mine' && user) {
    const [actionsRes, engagementsRes] = await Promise.all([
      supabase
        .from('action_items')
        .select('client_id')
        .eq('pic_user_id', user.id)
        .not('client_id', 'is', null),
      supabase
        .from('engagements')
        .select('client_id')
        .eq('created_by_user_id', user.id),
    ]);
    const ids = new Set<string>();
    for (const r of actionsRes.data ?? []) {
      const id = r.client_id as string | null;
      if (id) ids.add(id);
    }
    for (const r of engagementsRes.data ?? []) {
      ids.add(r.client_id as string);
    }
    mineClientIds = Array.from(ids);
  }

  let query = supabase.from('clients').select('*', { count: 'exact' });
  if (q) {
    query = query.or(`corporate_name.ilike.%${q}%,ticker_code.ilike.%${q}%`);
  }
  if (mineClientIds !== null) {
    if (mineClientIds.length === 0) {
      // No matches; force an empty result without a malformed `.in('()')`.
      query = query.eq('client_id', '00000000-0000-0000-0000-000000000000');
    } else {
      query = query.in('client_id', mineClientIds);
    }
  }
  query = query.order(sort, { ascending: dir === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as Client[];
  const total = count ?? 0;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Client Database"
        description="All client engagements with company profile, service tiers, and IPO status."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <ImportClients />
            <NewClient />
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search by company or ticker…" />
        <FilterTabs
          paramName="scope"
          options={[
            { value: '', label: 'All clients' },
            { value: 'mine', label: 'Mine only' },
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<Client>
        rows={rows}
        sortState={sortState}
        emptyMessage={
          scope === 'mine'
            ? 'No clients you’re tied to via to-dos or engagements yet.'
            : q
              ? `No clients matching "${q}".`
              : 'No clients yet.'
        }
        columns={[
          {
            header: 'Logo',
            cell: (r) => (
              <div className="flex h-10 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-aegis-gray-100 bg-aegis-gray-50 p-1">
                {r.logo_url ? (
                  <Image
                    src={r.logo_url}
                    alt={displayCompany(r.corporate_name)}
                    width={160}
                    height={80}
                    unoptimized
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-medium uppercase text-aegis-gray-300">
                    {displayCompany(r.corporate_name).slice(0, 2)}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: 'Company',
            sortKey: 'corporate_name',
            cell: (r) => (
              <div className="min-w-0">
                <Link
                  href={`/clients/${r.client_id}`}
                  className="block truncate font-medium text-aegis-navy hover:text-aegis-orange"
                >
                  {displayCompany(r.corporate_name)}
                </Link>
                {r.ticker_code && (
                  <p className="text-[11px] font-medium tabular-nums text-aegis-gray-500">
                    {r.ticker_code}
                  </p>
                )}
              </div>
            ),
          },
          {
            header: 'Industry',
            sortKey: 'industry',
            cell: (r) =>
              r.industry ? (
                <span className="text-xs text-aegis-gray">{INDUSTRY_LABEL[r.industry]}</span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Market',
            sortKey: 'market_segment',
            cell: (r) =>
              r.market_segment ? (
                <span className="inline-flex rounded-full bg-aegis-blue-50 px-2.5 py-0.5 text-xs font-medium text-aegis-navy">
                  {MARKET_SEGMENT_LABEL[r.market_segment].replace(' Market', '')}
                </span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Service Tiers',
            cell: (r) => (
              <div className="flex flex-wrap gap-1">
                {r.service_tier.map((tier) => (
                  <span
                    key={tier}
                    className="inline-flex rounded-full bg-aegis-navy-50 px-2 py-0.5 text-[11px] font-medium text-aegis-navy whitespace-nowrap"
                  >
                    {TIER_LABEL[tier]}
                  </span>
                ))}
              </div>
            ),
          },
          { header: '', cell: (r) => <ClientRowActions row={r} /> },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
