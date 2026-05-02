import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable from '@/components/data-table';
import type { Profile } from '@/lib/types';
import {
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import NewUser from './new-user';
import UserRowActions from './row-actions';

export default async function AdminUsersPage() {
  const me = await requireSuperAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role, birthday')
    .order('display_name', { ascending: true, nullsFirst: false });

  const rows = (data ?? []) as Profile[];

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Add, edit, or remove staff accounts. Only Super Admins see this page."
        action={<NewUser />}
      />

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<Profile>
        rows={rows}
        emptyMessage="No users yet."
        columns={[
          {
            header: 'Name',
            cell: (r) => (
              <div className="flex items-center gap-3">
                {r.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-aegis-blue-50 text-xs font-semibold text-aegis-navy">
                    {(displayName(r.display_name ?? '') || r.email)
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
                <span className="font-medium text-aegis-navy">
                  {r.display_name ? (
                    displayName(r.display_name)
                  ) : (
                    <span className="text-aegis-gray-300">—</span>
                  )}
                </span>
              </div>
            ),
          },
          {
            header: 'Username',
            cell: (r) =>
              r.username ? (
                <span className="tabular-nums text-sm text-aegis-gray">{r.username}</span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Company email',
            cell: (r) => (
              <span className="text-sm text-aegis-gray-500">{displayEmail(r.email)}</span>
            ),
          },
          {
            header: 'Gmail',
            cell: (r) =>
              r.gmail_address ? (
                <span className="text-xs text-aegis-gray-500">{displayEmail(r.gmail_address)}</span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Contact',
            cell: (r) =>
              r.contact_number ? (
                <span className="tabular-nums text-xs text-aegis-gray-500">
                  {displayPhone(r.contact_number)}
                </span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Role',
            cell: (r) => {
              const cls =
                r.role === 'super_admin'
                  ? 'bg-aegis-orange-50 text-aegis-orange-600 ring-aegis-orange/30'
                  : r.role === 'director'
                    ? 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20'
                    : 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200';
              const label =
                r.role === 'super_admin'
                  ? 'Super Admin'
                  : r.role === 'director'
                    ? 'Director'
                    : 'Member';
              return (
                <span
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                    cls,
                  ].join(' ')}
                >
                  {label}
                </span>
              );
            },
          },
          {
            header: '',
            cell: (r) => <UserRowActions row={r} isSelf={r.user_id === me.id} />,
          },
        ]}
      />
    </div>
  );
}
