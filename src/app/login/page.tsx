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

  async function resolveEmail(input: string): Promise<string | null> {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    const { data, error: rpcErr } = await supabase.rpc('get_email_by_username', {
      p_username: trimmed,
    });
    if (rpcErr) return null;
    return typeof data === 'string' ? data : null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = await resolveEmail(identifier);
    if (!email) {
      setLoading(false);
      setError('No account found for that username.');
      return;
    }

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
      {/* ─── Brand panel ───────────────────────────────────────────── */}
      <div className="relative hidden w-1/2 overflow-hidden bg-aegis-navy text-white lg:flex lg:flex-col lg:justify-between">
        {/* Atmospheric color orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-aegis-blue/30 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/3 -right-32 h-[24rem] w-[24rem] rounded-full bg-aegis-gold/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full bg-aegis-orange/10 blur-3xl"
        />

        {/* Subtle dot grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.55) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />

        {/* Large decorative mountain motif (echoes the logo mark) */}
        <svg
          aria-hidden
          viewBox="0 0 600 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 w-full text-white/[0.04]"
          fill="currentColor"
        >
          <path d="M0 400 L260 90 L360 240 L600 60 L600 400 Z" />
          <path d="M0 400 L180 200 L300 320 L500 180 L600 280 L600 400 Z" opacity="0.7" />
        </svg>

        {/* ── Top: status badge ── */}
        <div className="relative z-10 px-12 pt-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aegis-blue opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-aegis-blue" />
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-aegis-blue-100/90">
              Secure Internal Portal
            </span>
          </div>
        </div>

        {/* ── Middle: headline ── */}
        <div className="relative z-10 max-w-lg px-12">
          <h2 className="text-4xl font-semibold leading-[1.15] tracking-tight">
            Strategic IR, PR, Events, AGM/EGM &amp; IPO operations,
            <span className="block text-aegis-blue">all in one portal.</span>
          </h2>
          <div className="mt-4 h-px w-12 bg-aegis-gold" />
          <p className="mt-5 max-w-md text-sm leading-relaxed text-aegis-blue-100/85">
            Manage clients, investor coverage, media relationships, and project
            deliverables from a single workspace built for the Aegis team.
          </p>
        </div>

        {/* ── Bottom: service strip + copyright ── */}
        <div className="relative z-10 px-12 pb-10">
          <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium uppercase tracking-[0.18em] text-aegis-blue-100/60">
            <span>Investor Relations</span>
            <span className="h-1 w-1 rounded-full bg-aegis-blue/60" />
            <span>Public Relations</span>
            <span className="h-1 w-1 rounded-full bg-aegis-blue/60" />
            <span>Corporate Events</span>
            <span className="h-1 w-1 rounded-full bg-aegis-blue/60" />
            <span>AGM/EGM</span>
            <span className="h-1 w-1 rounded-full bg-aegis-blue/60" />
            <span>IPO</span>
          </div>
          <div className="flex items-end justify-between border-t border-white/10 pt-5 text-[11px] text-aegis-blue-100/60">
            <span>© {new Date().getFullYear()} Aegis Communication</span>
            <span className="tabular-nums">v0.1</span>
          </div>
        </div>
      </div>

      {/* ─── Login form panel ──────────────────────────────────────── */}
      <div className="relative flex w-full flex-col items-center justify-center bg-white px-6 py-12 lg:w-1/2">
        {/* Quiet decorative arc, top-right */}
        <svg
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 h-64 w-64 text-aegis-blue/10"
          viewBox="0 0 200 200"
          fill="none"
        >
          <circle cx="200" cy="0" r="160" stroke="currentColor" strokeWidth="1" />
          <circle cx="200" cy="0" r="110" stroke="currentColor" strokeWidth="1" />
          <circle cx="200" cy="0" r="60" stroke="currentColor" strokeWidth="1" />
        </svg>

        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-12">
            <Image
              src="/aegis_logo.png"
              alt="Aegis Communication"
              width={400}
              height={140}
              priority
              className="h-14 w-auto"
            />
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-aegis-navy">
            Welcome back.
          </h1>
          <p className="mt-2 mb-10 text-sm text-aegis-gray-500">
            Sign in with your username or Aegis email to continue.
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
