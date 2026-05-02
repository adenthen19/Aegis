'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function GoogleConnectionCard({
  connection,
}: {
  connection: {
    google_email: string;
    scope: string;
    created_at: string;
    expires_at: string;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function disconnect() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/google/oauth/disconnect', {
          method: 'POST',
        });
        if (!res.ok) {
          throw new Error(`Disconnect failed (${res.status}).`);
        }
        setConfirmingDisconnect(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Disconnect failed.');
      }
    });
  }

  if (!connection) {
    return (
      <div className="rounded-lg border border-aegis-gray-100 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-aegis-navy">
              <GoogleIcon />
              Not connected
            </h3>
            <p className="mt-1 text-sm text-aegis-gray-500">
              Connect your Google account so Aegis can write event attendance
              into a Google Sheet on your behalf. Aegis only requests access
              to spreadsheets you already have edit permission for.
            </p>
            <ul className="mt-3 space-y-1 text-[12px] text-aegis-gray-500">
              <li>• Pushes appear in Sheets revision history under your name.</li>
              <li>• You can disconnect any time from this page.</li>
              <li>• No service-account keys, no shared robot email.</li>
            </ul>
          </div>
          <a
            href="/api/google/oauth/start"
            className="inline-flex items-center justify-center gap-2 self-start rounded-md bg-aegis-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
          >
            <GoogleIcon />
            Connect Google
          </a>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-600">{error}</p>
        )}
      </div>
    );
  }

  const connectedAt = new Date(connection.created_at).toLocaleDateString(
    undefined,
    { day: 'numeric', month: 'short', year: 'numeric' },
  );

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-aegis-navy">
            <GoogleIcon />
            Connected
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500"
                aria-hidden
              />
              Active
            </span>
          </h3>
          <p className="mt-1 truncate text-sm text-aegis-gray">
            <span className="text-aegis-gray-500">Connected as </span>
            <span className="font-medium text-aegis-navy">
              {connection.google_email}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-aegis-gray-500">
            Connected on {connectedAt}.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {!confirmingDisconnect ? (
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              disabled={pending}
              className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50 disabled:opacity-60"
            >
              Disconnect
            </button>
          ) : (
            <div className="flex flex-col items-end gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[11px] text-red-700">
                Disconnect — pushes from this account will stop working.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(false)}
                  disabled={pending}
                  className="rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-gray hover:bg-aegis-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={pending}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {pending ? 'Disconnecting…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
          {error && (
            <p className="text-[11px] text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
