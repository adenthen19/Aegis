'use client';

import Image from 'next/image';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function OnboardingDialog({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  // Lock body scroll while open. ESC + backdrop click intentionally do NOT close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter how you’d like to be addressed.');
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  const busy = saving || pending;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Backdrop */}
      <div aria-hidden className="absolute inset-0 bg-aegis-navy/50 backdrop-blur-md" />

      {/* Card */}
      <div className="relative z-10 w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl">
        {/* ── Branded hero ── */}
        <div className="relative overflow-hidden bg-gradient-to-br from-aegis-navy via-aegis-navy to-aegis-navy-800 px-7 pt-9 pb-9 text-white sm:px-9">
          {/* Atmospheric orb */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-aegis-blue/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-aegis-gold/10 blur-3xl"
          />
          {/* Subtle dot grid */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.10]"
            style={{
              backgroundImage:
                'radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />

          {/* Top row: logo + status pill */}
          <div className="relative flex items-center justify-between">
            <Image
              src="/aegis_logo.png"
              alt="Aegis Communication"
              width={400}
              height={140}
              priority
              className="h-9 w-auto brightness-0 invert"
            />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aegis-blue opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aegis-blue" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-aegis-blue-100/90">
                Setup
              </span>
            </span>
          </div>

          {/* Headline */}
          <h2
            id="onboarding-title"
            className="relative mt-7 text-3xl font-semibold leading-[1.1] tracking-tight"
          >
            Welcome aboard.
          </h2>
          <div aria-hidden className="relative mt-3 h-px w-10 bg-aegis-gold" />
          <p className="relative mt-3 max-w-xs text-sm leading-relaxed text-aegis-blue-100/85">
            One quick detail before you dive in — we’ll use this across the portal.
          </p>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7 sm:px-9">
          <div>
            <label
              htmlFor="onboarding-name"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
            >
              How would you like to be addressed?
            </label>
            <input
              id="onboarding-name"
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Chen"
              autoComplete="name"
              className="w-full rounded-md border border-aegis-gray-200 bg-white px-3.5 py-2.5 text-sm text-aegis-gray-900 outline-none placeholder:text-aegis-gray-300 focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
            />
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-aegis-gray-500">
              <svg
                className="h-3 w-3 shrink-0 text-aegis-gray-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              Signed in as <span className="font-medium text-aegis-gray">{email}</span>
            </p>
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
            disabled={busy}
            className="group inline-flex w-full items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-aegis-orange-600 hover:shadow-md disabled:opacity-60"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                Saving…
              </>
            ) : (
              <>
                Get started
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </>
            )}
          </button>

          <p className="text-center text-[11px] leading-relaxed text-aegis-gray-500">
            You can edit your name and add a profile photo anytime from the sidebar.
          </p>
        </form>
      </div>
    </div>
  );
}
