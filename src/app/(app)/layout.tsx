import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Shell from './shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const meta = (user.user_metadata ?? {}) as { display_name?: string; avatar_url?: string };
  const displayName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
  const avatarUrl = typeof meta.avatar_url === 'string' ? meta.avatar_url : null;

  return (
    <Shell
      userId={user.id}
      userEmail={user.email ?? 'user'}
      displayName={displayName}
      avatarUrl={avatarUrl}
    >
      {children}
    </Shell>
  );
}
