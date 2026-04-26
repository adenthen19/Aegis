import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import FilterTabs from '@/components/ui/filter-tabs';
import ActionItemToggle from '../meetings/action-item-toggle';
import type { ActionItem } from '@/lib/types';

type TodoRow = ActionItem & {
  meetings: {
    meeting_id: string;
    meeting_date: string;
    meeting_type: string;
    clients: { corporate_name: string } | null;
    analysts: { institution_name: string } | null;
  } | null;
};

export default async function TodosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status === 'done' || status === 'all' ? status : 'open';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="My To-Do" description="Your assigned action items." />
        <p className="text-sm text-aegis-gray-500">Sign in to see your to-do list.</p>
      </div>
    );
  }

  let query = supabase
    .from('action_items')
    .select(
      '*, meetings ( meeting_id, meeting_date, meeting_type, clients ( corporate_name ), analysts ( institution_name ) )',
    )
    .eq('pic_user_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (filter !== 'all') query = query.eq('status', filter);

  const { data, error } = await query;
  const rows = (data ?? []) as TodoRow[];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOverdue(due: string | null, status: string): boolean {
    if (status === 'done' || !due) return false;
    return new Date(due) < today;
  }

  return (
    <div>
      <PageHeader
        title="My To-Do"
        description="Action items assigned to you across all meetings."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterTabs
          paramName="status"
          options={[
            { value: '', label: 'Open' },
            { value: 'done', label: 'Done' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-white px-6 py-12 text-center text-sm text-aegis-gray-500">
          {filter === 'open'
            ? 'No open action items. You’re all caught up.'
            : filter === 'done'
              ? 'No completed action items yet.'
              : 'No action items assigned to you.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const overdue = isOverdue(a.due_date, a.status);
            const meetingLink = a.meetings
              ? [a.meetings.clients?.corporate_name, a.meetings.analysts?.institution_name]
                  .filter(Boolean)
                  .join(' × ') ||
                (a.meetings.meeting_type === 'internal' ? 'Internal meeting' : 'Briefing')
              : 'Unknown meeting';
            return (
              <li
                key={a.action_item_id}
                className="flex items-start gap-3 rounded-md border border-aegis-gray-100 bg-white px-3 py-2.5 shadow-sm"
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
                    {a.due_date && (
                      <span className={overdue ? 'font-medium text-red-600' : ''}>
                        {overdue ? 'Overdue · ' : 'Due '}
                        {new Date(a.due_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    )}
                    {a.meetings && (
                      <Link
                        href={`/meetings/${a.meetings.meeting_id}`}
                        className="text-aegis-navy hover:text-aegis-orange"
                      >
                        {meetingLink} ·{' '}
                        {new Date(a.meetings.meeting_date).toLocaleDateString(undefined, {
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
    </div>
  );
}
