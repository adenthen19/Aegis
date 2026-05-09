'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import { displayCompany, displayName, displayPhone } from '@/lib/display-format';
import type { EventGuest, UserRole } from '@/lib/types';
import {
  kioskApproveWalkInAction,
  kioskRejectWalkInAction,
} from './actions';

// Pending walk-in approval queue.
//
// At a quiet-period IPO event, walk-ins land as walkin_status='pending'
// and accumulate here. A director or super_admin opens this panel from
// the kiosk header and approves / rejects each entry. The server actions
// re-check the role on every call, so a tampered client can't bypass —
// the role hint passed in here is purely a UX nicety to show / hide the
// buttons.
//
// We deliberately keep this dialog non-modal-blocking: ushers can keep
// processing pre-registered guests while a supervisor works the queue.

type Props = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  pending: EventGuest[];
  /** Logged-in operator's role; controls whether Approve/Reject are enabled. */
  userRole: UserRole;
};

export default function ApprovalQueue({
  open,
  onClose,
  eventId,
  pending,
  userRole,
}: Props) {
  const canApprove = userRole === 'director' || userRole === 'super_admin';
  const [busyGuestId, setBusyGuestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transition, startTransition] = useTransition();

  function approve(guestId: string) {
    if (transition) return;
    setBusyGuestId(guestId);
    setError(null);
    startTransition(async () => {
      const res = await kioskApproveWalkInAction(eventId, guestId);
      setBusyGuestId(null);
      if (!res.ok) setError(res.error);
    });
  }

  function reject(guestId: string) {
    if (transition) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Reject this walk-in? They will not be checked in. The record stays for the audit trail.',
      )
    ) {
      return;
    }
    setBusyGuestId(guestId);
    setError(null);
    startTransition(async () => {
      const res = await kioskRejectWalkInAction(eventId, guestId);
      setBusyGuestId(null);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Walk-in approvals"
      description={
        canApprove
          ? 'Approve or reject each pending walk-in. Approval flips them to checked-in immediately.'
          : 'Only directors and super admins can approve walk-ins. A supervisor must sign in to take action.'
      }
      size="2xl"
    >
      <div className="space-y-4">
        {!canApprove && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You&apos;re signed in as a <strong>member</strong>. Ask a director or
            super admin to sign in on this device (or another kiosk) to clear
            the queue. Existing walk-ins stay <strong>pending</strong> in the
            meantime.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-aegis-gray-200 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-aegis-navy">
              No pending walk-ins.
            </p>
            <p className="mt-1 text-xs text-aegis-gray-500">
              When ushers submit walk-ins they&apos;ll appear here for approval.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-aegis-gray-100 rounded-2xl border border-aegis-gray-100 bg-white">
            {pending.map((g) => {
              const busy = busyGuestId === g.guest_id && transition;
              const isSubstitute = !!g.substitute_for_guest_id;
              return (
                <li
                  key={g.guest_id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {g.honorific && (
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-aegis-orange">
                          {g.honorific}
                        </span>
                      )}
                      <p className="truncate text-sm font-semibold text-aegis-navy">
                        {displayName(g.preferred_name ?? g.full_name)}
                      </p>
                      {isSubstitute && (
                        <span className="rounded bg-aegis-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-aegis-navy ring-1 ring-inset ring-aegis-blue/30">
                          Substitute
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-aegis-gray-500">
                      {[
                        g.title ? displayName(g.title) : null,
                        g.company ? displayCompany(g.company) : null,
                        g.contact_number ? displayPhone(g.contact_number) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </p>
                    {(g.cmsrl_number || g.press_card_no) && (
                      <p className="mt-0.5 text-[11px] text-aegis-gray-500">
                        {g.cmsrl_number && (
                          <>
                            CMSRL{' '}
                            <span className="font-mono text-aegis-navy">
                              {g.cmsrl_number}
                            </span>
                          </>
                        )}
                        {g.cmsrl_number && g.press_card_no && ' · '}
                        {g.press_card_no && (
                          <>
                            Press{' '}
                            <span className="font-mono text-aegis-navy">
                              {g.press_card_no}
                            </span>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => reject(g.guest_id)}
                      disabled={!canApprove || busy}
                      className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => approve(g.guest_id)}
                      disabled={!canApprove || busy}
                      className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Approving…' : 'Approve & check in'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
