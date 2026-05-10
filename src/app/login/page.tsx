'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // resolveEmail returns:
  //   { kind: 'email', value }       — caller has an address (literal or resolved)
  //   { kind: 'not_found' }          — RPC succeeded, no row matched
  //   { kind: 'error', message }     — RPC itself failed (network, RLS,
  //                                     missing function). Surfacing this
  //                                     separately stops a "no account"
  //                                     toast from masking real ops issues
  //                                     like a missing migration on staging.
  type ResolveResult =
    | { kind: 'email'; value: string }
    | { kind: 'not_found' }
    | { kind: 'error'; message: string };

  async function resolveEmail(input: string): Promise<ResolveResult> {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return { kind: 'email', value: trimmed };
    const { data, error: rpcErr } = await supabase.rpc('get_email_by_username', {
      p_username: trimmed,
    });
    if (rpcErr) {
      return {
        kind: 'error',
        message: `Couldn't look up that username — ${rpcErr.message}`,
      };
    }
    if (typeof data !== 'string' || !data) return { kind: 'not_found' };
    return { kind: 'email', value: data };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const resolved = await resolveEmail(identifier);
    if (resolved.kind === 'error') {
      setLoading(false);
      setError(resolved.message);
      return;
    }
    if (resolved.kind === 'not_found') {
      setLoading(false);
      setError('No account found for that username.');
      return;
    }
    const email = resolved.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen w-full">
      {/* ─── Brand panel ─────────────────────────────────────────────
          Just navy + a typographic moment + a quiet footer. Removed
          the floor-plan scrim — it was reading as "why is there a
          seating chart on the login screen?" rather than thematic
          atmosphere. The display headline carries the page on its
          own. */}
      <div className="hidden w-1/2 flex-col justify-between bg-aegis-navy px-14 py-12 text-white lg:flex">
        <p className="text-[11px] uppercase tracking-[0.24em] text-aegis-blue-100/60">
          Aegis Communication
          <span className="ml-3 text-aegis-gold/80">·</span>
          <span className="ml-3">Kuala Lumpur</span>
        </p>

        <div className="max-w-lg">
          {/* Display type: large weight contrast in a single line.
              Mixed semibold + light italic so the headline reads
              like a designed mark, not a Tailwind default. */}
          <h2 className="text-[64px] font-semibold leading-[0.95] tracking-[-0.02em]">
            Run the
            <span className="block font-light italic text-aegis-gold/95">
              floor.
            </span>
          </h2>
          <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-aegis-blue-100/80">
            The same screen our team reaches for at 06:00 on event
            day — clients, analysts, media, kiosks, every guest at
            every table.
          </p>
        </div>

        <div className="flex items-end justify-between text-[11px] text-aegis-blue-100/55">
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-aegis-gold/70" aria-hidden />
            <span>© {new Date().getFullYear()} Aegis Communication</span>
          </div>
          <span className="tabular-nums">v0.1</span>
        </div>
      </div>

      {/* ─── Login form panel ──────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <Image
              src="/aegis_logo.png"
              alt="Aegis Communication"
              width={400}
              height={140}
              priority
              className="h-12 w-auto"
            />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-aegis-navy">
            Sign in
          </h1>
          <p className="mt-1.5 mb-8 text-sm text-aegis-gray-500">
            Use your username or Aegis email.
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
                Username or email
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                placeholder="sarah.chen or sarah@aegiscomm.com.my"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-md border border-aegis-gray-200 bg-white px-3.5 py-2.5 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setError('Password reset is handled by IT support — please contact them to set a new password.')
                  }
                  className="text-xs text-aegis-navy hover:text-aegis-orange"
                >
                  Forgot?
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-aegis-gray-200 bg-white px-3.5 py-2.5 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2.5 text-xs text-aegis-orange-600">
                <svg
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-aegis-orange px-3 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-aegis-orange-600 hover:shadow-md disabled:opacity-60"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </>
              )}
            </button>
          </form>

          <p className="mt-10 text-center text-xs text-aegis-gray-500">
            Need help signing in?{' '}
            <a href="#" className="font-medium text-aegis-navy hover:text-aegis-orange">
              Contact IT
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
