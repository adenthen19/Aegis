import PageHeader from '@/components/page-header';
import { Section } from '@/components/detail-shell';
import { createClient } from '@/lib/supabase/server';
import GoogleConnectionCard from './google-connection-card';

// /integrations — staff-facing connections panel.
//
// Today this hosts the Google Sheets connection (per-user OAuth). Future
// integrations (Slack, Calendar, etc.) would slot in as additional Section
// blocks below.
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Caller layout already redirects unauth, but keep the type-narrow.
    return null;
  }

  const { data: conn } = await supabase
    .from('google_connections')
    .select('google_email, scope, created_at, expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect Aegis to other tools you use to run your events."
      />

      {sp.google === 'connected' && (
        <FlashBanner tone="success">
          Google account connected — you can now push attendance to Google
          Sheets.
        </FlashBanner>
      )}
      {sp.google === 'disconnected' && (
        <FlashBanner tone="info">
          Google account disconnected.
        </FlashBanner>
      )}
      {sp.google === 'error' && (
        <FlashBanner tone="error">
          Google connection failed: {sp.reason ?? 'unknown error'}
        </FlashBanner>
      )}

      <Section title="Google Sheets">
        <GoogleConnectionCard
          connection={
            conn
              ? {
                  google_email: conn.google_email as string,
                  scope: conn.scope as string,
                  created_at: conn.created_at as string,
                  expires_at: conn.expires_at as string,
                }
              : null
          }
        />
      </Section>
    </div>
  );
}

function FlashBanner({
  tone,
  children,
}: {
  tone: 'success' | 'info' | 'error';
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    info: 'border-aegis-blue/30 bg-aegis-blue-50 text-aegis-navy',
    error: 'border-red-200 bg-red-50 text-red-700',
  };
  return (
    <div
      className={[
        'mb-5 rounded-lg border px-4 py-3 text-sm',
        styles[tone],
      ].join(' ')}
    >
      {children}
    </div>
  );
}
