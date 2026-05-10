'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { displayCompany, displayName } from '@/lib/display-format';
import { kioskRegisterOperatorAction } from './actions';

const OPERATOR_NAME_KEY = 'aegis-kiosk-operator-name';

// Anonymous-sign-in welcome gate for the kiosk.
//
// Rendered by /kiosk/[event_id]/page.tsx whenever there's no
// authenticated user. We sign in anonymously via Supabase (gives the
// kiosk a real JWT so RLS-protected reads + realtime work), then ask
// the operator to type their name. The name is upserted into a
// profile row by `kioskRegisterOperatorAction` so the existing
// activity-feed JOIN on profiles picks it up — every check-in is
// attributed to a named human even though no one logged in.
//
// Once both steps complete we router.refresh() — the server-rendered
// page re-runs, this time with `me` populated, and KioskShell takes
// over.
//
// Returning visitors on the same device skip the prompt automatically:
// the prior session sticks around in localStorage, and we restore the
// previously-typed name as the input default. They can still change
// it before submitting if a different usher is taking the kiosk.
export default function KioskAnonGate({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<
    'signing-in' | 'name' | 'submitting' | 'fatal'
  >('signing-in');
  const [eventName, setEventName] = useState<string | null>(null);
  const [eventClient, setEventClient] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();

      // Restore prior typed name if any — saves re-typing on a return
      // visit by the same usher.
      try {
        const saved = window.localStorage.getItem(OPERATOR_NAME_KEY);
        if (saved && !cancelled) setName(saved);
      } catch {
        // localStorage can throw in private browsing — ignore
      }

      // Re-use an existing anon session if it's already in storage,
      // otherwise create a fresh one.
      const { data: existing } = await supabase.auth.getSession();
      if (!existing.session) {
        const { error: signInErr } = await supabase.auth.signInAnonymously();
        if (signInErr) {
          if (!cancelled) {
            setError(
              `Couldn't start a kiosk session — ${signInErr.message}. ` +
                'Anonymous sign-in may not be enabled in your Supabase ' +
                'project (Authentication → Providers → Anonymous).',
            );
            setPhase('fatal');
          }
          return;
        }
      }

      // Read enough of the event to render a friendly welcome. Anon
      // users can read events because RLS is `to authenticated`.
      const { data: event } = await supabase
        .from('events')
        .select('name, adhoc_client_name, clients ( corporate_name )')
        .eq('event_id', eventId)
        .maybeSingle();

      if (cancelled) return;

      if (event) {
        const ev = event as unknown as {
          name: string;
          adhoc_client_name: string | null;
          clients: { corporate_name: string } | null;
        };
        setEventName(ev.name);
        setEventClient(ev.clients?.corporate_name ?? ev.adhoc_client_name);
      }
      setPhase('name');
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name to continue.');
      return;
    }
    setError(null);
    setPhase('submitting');

    const res = await kioskRegisterOperatorAction(trimmed);
    if (!res.ok) {
      setError(res.error);
      setPhase('name');
      return;
    }

    try {
      window.localStorage.setItem(OPERATOR_NAME_KEY, trimmed);
    } catch {
      // private browsing — name still saved in profiles, just won't
      // pre-fill on return visits to this device
    }

    // Refresh so the server-rendered page re-runs with the now-active
    // session. The kiosk shell takes over from there.
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-aegis-gray-50/50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-aegis-orange">
          Aegis kiosk
        </p>
        {eventName && (
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-aegis-navy sm:text-3xl">
            {displayName(eventName)}
          </h1>
        )}
        {eventClient && (
          <p className="mt-1 text-sm text-aegis-gray-500">
            For {displayCompany(eventClient)}
          </p>
        )}

        <form
          onSubmit={submit}
          className="mt-8 rounded-2xl border border-aegis-gray-100 bg-white p-6 shadow-sm sm:p-7"
        >
          <label
            htmlFor="kiosk-operator-name"
            className="block text-xs font-medium uppercase tracking-[0.08em] text-aegis-gray-500"
          >
            Your name
          </label>
          <p className="mt-1 text-sm text-aegis-gray-500">
            We log this with each check-in so the post-event report shows
            who handled the door.
          </p>
          <input
            id="kiosk-operator-name"
            type="text"
            autoFocus
            autoComplete="name"
            placeholder="e.g. Sarah Chen"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={phase === 'signing-in' || phase === 'submitting' || phase === 'fatal'}
            className="mt-4 w-full rounded-md border border-aegis-gray-200 bg-white px-3.5 py-2.5 text-base text-aegis-gray-900 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:bg-aegis-gray-50"
          />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
            disabled={phase !== 'name'}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-aegis-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {phase === 'signing-in' && (
              <>
                <Spinner /> Setting up kiosk…
              </>
            )}
            {phase === 'submitting' && (
              <>
                <Spinner /> Saving…
              </>
            )}
            {phase === 'name' && (
              <>
                Start kiosk{' '}
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </>
            )}
            {phase === 'fatal' && 'Cannot start kiosk'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-aegis-gray-500">
          Anyone running this kiosk uses this same screen. No login —
          just your name, so the activity log is clear.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
