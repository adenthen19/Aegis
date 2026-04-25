import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import {
  INDUSTRY_LABEL,
  MARKET_SEGMENT_LABEL,
  type Client,
  type ServiceTier,
} from '@/lib/types';
import NewClient from './new-client';
import ClientRowActions from './row-actions';

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR', pr: 'PR', esg: 'ESG', virtual_meeting: 'Virtual',
  ipo: 'IPO', agm_egm: 'AGM/EGM', social_media: 'Social', event_management: 'Events',
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(['corporate_name', 'ticker_code', 'industry', 'market_segment', 'created_at']);

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'corporate_name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  let query = supabase.from('clients').select('*', { count: 'exact' });
  if (q) {
    query = query.or(`corporate_name.ilike.%${q}%,ticker_code.ilike.%${q}%,ceo_name.ilike.%${q}%,cfo_name.ilike.%${q}%`);
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
        action={<NewClient />}
      />

      <div className="mb-4">
        <SearchInput placeholder="Search by company, ticker, CEO, or CFO…" />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<Client>
        rows={rows}
        sortState={sortState}
        emptyMessage={q ? `No clients matching "${q}".` : 'No clients yet.'}
        columns={[
          {
            header: 'Logo',
            cell: (r) => (
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-aegis-gray-100 bg-aegis-gray-50">
                {r.logo_url ? (
                  <Image
                    src={r.logo_url}
                    alt={r.corporate_name}
                    width={40}
                    height={40}
                    unoptimized
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-[10px] font-medium uppercase text-aegis-gray-300">
                    {r.corporate_name.slice(0, 2)}
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
                  {r.corporate_name}
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
