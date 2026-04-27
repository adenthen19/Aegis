import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import { Section, EmptyMini } from '@/components/detail-shell';

const PER_GROUP_LIMIT = 8;

type ClientHit = {
  client_id: string;
  corporate_name: string;
  ticker_code: string | null;
};
type AnalystHit = {
  investor_id: string;
  full_name: string | null;
  institution_name: string;
};
type MediaHit = {
  media_id: string;
  full_name: string;
  company_name: string | null;
};
type MeetingHit = {
  meeting_id: string;
  meeting_date: string;
  summary: string | null;
  clients: { corporate_name: string } | null;
  analysts: { institution_name: string } | null;
};
type PressHit = {
  press_release_id: string;
  title: string;
  release_date: string | null;
  status: string;
  clients: { client_id: string; corporate_name: string } | null;
};
type StakeholderHit = {
  stakeholder_id: string;
  full_name: string;
  role: string;
  email: string | null;
  clients: { client_id: string; corporate_name: string } | null;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q: rawQ } = await searchParams;
  const q = rawQ?.trim() ?? '';

  if (q.length < 2) {
    return (
      <div>
        <PageHeader
          title="Search"
          description="Find clients, stakeholders, analysts, media contacts, meetings, and press releases."
        />
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-12 text-center text-sm text-aegis-gray-500">
          Type at least 2 characters in the search box.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  // PostgREST .or() escapes commas-in-values when wrapped in dotted notation.
  // Wrapping the user term in `%${q}%` for ilike. The term is interpolated
  // directly — Supabase parameterizes it on the wire — but we strip commas
  // up front because the .or() syntax uses commas as separators.
  const safe = q.replace(/[,]/g, ' ');

  const [
    clientsRes,
    analystsRes,
    mediaRes,
    meetingsRes,
    pressRes,
    stakeholdersRes,
  ] = await Promise.all([
    supabase
      .from('clients')
      .select('client_id, corporate_name, ticker_code')
      .or(`corporate_name.ilike.%${safe}%,ticker_code.ilike.%${safe}%`)
      .order('corporate_name')
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('analysts')
      .select('investor_id, full_name, institution_name')
      .or(
        `institution_name.ilike.%${safe}%,full_name.ilike.%${safe}%,email.ilike.%${safe}%`,
      )
      .order('institution_name')
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('media_contacts')
      .select('media_id, full_name, company_name')
      .or(
        `full_name.ilike.%${safe}%,company_name.ilike.%${safe}%,email.ilike.%${safe}%`,
      )
      .order('full_name')
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('meetings')
      .select(
        'meeting_id, meeting_date, summary, clients ( corporate_name ), analysts ( institution_name )',
      )
      .or(`summary.ilike.%${safe}%,location.ilike.%${safe}%`)
      .order('meeting_date', { ascending: false })
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('press_releases')
      .select('press_release_id, title, release_date, status, clients ( client_id, corporate_name )')
      .or(`title.ilike.%${safe}%,body.ilike.%${safe}%`)
      .order('release_date', { ascending: false, nullsFirst: false })
      .limit(PER_GROUP_LIMIT),
    supabase
      .from('client_stakeholders')
      .select(
        'stakeholder_id, full_name, role, email, clients ( client_id, corporate_name )',
      )
      .or(`full_name.ilike.%${safe}%,role.ilike.%${safe}%,email.ilike.%${safe}%`)
      .order('full_name')
      .limit(PER_GROUP_LIMIT),
  ]);

  const clients = (clientsRes.data ?? []) as ClientHit[];
  const analysts = (analystsRes.data ?? []) as AnalystHit[];
  const media = (mediaRes.data ?? []) as MediaHit[];
  const meetings = (meetingsRes.data ?? []) as unknown as MeetingHit[];
  const press = (pressRes.data ?? []) as unknown as PressHit[];
  const stakeholders = (stakeholdersRes.data ?? []) as unknown as StakeholderHit[];

  const totalHits =
    clients.length +
    analysts.length +
    media.length +
    meetings.length +
    press.length +
    stakeholders.length;

  return (
    <div>
      <PageHeader
        title={`Search: "${q}"`}
        description={`${totalHits} match${totalHits === 1 ? '' : 'es'} across the workspace.`}
      />

      {totalHits === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-12 text-center text-sm text-aegis-gray-500">
          No matches. Try a different term.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title={`Clients (${clients.length})`}>
            {clients.length === 0 ? (
              <EmptyMini>No client matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {clients.map((c) => (
                  <li key={c.client_id} className="py-2">
                    <Link
                      href={`/clients/${c.client_id}`}
                      className="text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                    >
                      {c.corporate_name}
                    </Link>
                    {c.ticker_code && (
                      <span className="ml-2 text-[11px] text-aegis-gray-500">
                        {c.ticker_code}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Stakeholders (${stakeholders.length})`}>
            {stakeholders.length === 0 ? (
              <EmptyMini>No stakeholder matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {stakeholders.map((s) => (
                  <li key={s.stakeholder_id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-aegis-navy">
                        {s.full_name}
                      </span>
                      <span className="text-[11px] text-aegis-gray-500">{s.role}</span>
                    </div>
                    {s.clients && (
                      <Link
                        href={`/clients/${s.clients.client_id}`}
                        className="text-[11px] text-aegis-gray-500 hover:text-aegis-navy"
                      >
                        {s.clients.corporate_name}
                      </Link>
                    )}
                    {s.email && (
                      <span className="ml-2 text-[11px] text-aegis-gray-300">{s.email}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Analysts (${analysts.length})`}>
            {analysts.length === 0 ? (
              <EmptyMini>No analyst matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {analysts.map((a) => (
                  <li key={a.investor_id} className="py-2">
                    <Link
                      href={`/analysts/${a.investor_id}`}
                      className="text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                    >
                      {a.full_name ?? a.institution_name}
                    </Link>
                    {a.full_name && (
                      <span className="ml-2 text-[11px] text-aegis-gray-500">
                        {a.institution_name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Media contacts (${media.length})`}>
            {media.length === 0 ? (
              <EmptyMini>No media matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {media.map((m) => (
                  <li key={m.media_id} className="py-2">
                    <Link
                      href={`/media/${m.media_id}`}
                      className="text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                    >
                      {m.full_name}
                    </Link>
                    {m.company_name && (
                      <span className="ml-2 text-[11px] text-aegis-gray-500">
                        {m.company_name}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Meetings (${meetings.length})`}>
            {meetings.length === 0 ? (
              <EmptyMini>No meeting matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {meetings.map((m) => (
                  <li key={m.meeting_id} className="py-2">
                    <Link
                      href={`/meetings/${m.meeting_id}`}
                      className="text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                    >
                      {new Date(m.meeting_date).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })}
                      {m.clients?.corporate_name && (
                        <span className="ml-2 text-[11px] text-aegis-gray-500">
                          {m.clients.corporate_name}
                        </span>
                      )}
                      {m.analysts?.institution_name && (
                        <span className="ml-2 text-[11px] text-aegis-gray-500">
                          {m.analysts.institution_name}
                        </span>
                      )}
                    </Link>
                    {m.summary && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-aegis-gray-500">
                        {m.summary}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={`Press releases (${press.length})`}>
            {press.length === 0 ? (
              <EmptyMini>No press release matches.</EmptyMini>
            ) : (
              <ul className="divide-y divide-aegis-gray-100">
                {press.map((p) => (
                  <li key={p.press_release_id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.clients ? (
                        <Link
                          href={`/clients/${p.clients.client_id}`}
                          className="text-sm font-medium text-aegis-navy hover:text-aegis-orange"
                        >
                          {p.title}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-aegis-navy">{p.title}</span>
                      )}
                      <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
                        {p.status}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-aegis-gray-500">
                      {p.clients?.corporate_name && <span>{p.clients.corporate_name}</span>}
                      {p.release_date && (
                        <span className="tabular-nums">
                          {new Date(p.release_date).toLocaleDateString(undefined, {
                            dateStyle: 'medium',
                          })}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
