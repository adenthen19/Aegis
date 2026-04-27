import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Shell from './shell';
import type { UserRole } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const meta = (user.user_metadata ?? {}) as { display_name?: string; avatar_url?: string };
  const displayName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
  const avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, birthday')
    .eq('user_id', user.id)
    .maybeSingle();
  const rawRole = profile?.role as string | undefined;
  const role: UserRole =
    rawRole === 'super_admin' || rawRole === 'director'
      ? (rawRole as UserRole)
      : 'member';
  const birthday = (profile?.birthday as string | null) ?? null;

  // Pull every team member with a birthday set so we can decide client-side
  // whether today is anyone's birthday. Cheap query (handful of rows) and the
  // month-day comparison happens in the client component to respect the
  // user's local timezone — server-side "today" can be off by a day for
  // distributed teams.
  const { data: birthdayProfiles } = await supabase
    .from('profiles')
    .select('user_id, display_name, email, avatar_url, birthday')
    .not('birthday', 'is', null);

  return (
    <Shell
      userId={user.id}
      userEmail={user.email ?? 'user'}
      displayName={displayName}
      avatarUrl={avatarUrl}
      birthday={birthday}
      role={role}
      birthdayProfiles={(birthdayProfiles ?? []).map((p) => ({
        user_id: p.user_id as string,
        display_name: (p.display_name as string | null) ?? null,
        email: p.email as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
        birthday: p.birthday as string,
      }))}
    >
      {children}
    </Shell>
  );
}
