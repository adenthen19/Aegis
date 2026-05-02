'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  bulkSetCheckInAction,
  createGuestAction,
  type ActionState,
} from '../actions';
import GuestFormFields from './guest-form-fields';
import ImportGuests from './import-guests';
import GuestDetailModal from './guest-detail-modal';
import GuestListView from './guest-list-view';
import GuestSearchCheckin from './guest-search-checkin';
import GuestReport from './guest-report';
import type { EventGuest } from '@/lib/types';

const initialState: ActionState = { ok: false, error: null };

type Tab = 'list' | 'search' | 'report';

export default function GuestList({
  eventId,
  eventName,
  guests,
}: {
  eventId: string;
  eventName: string;
  guests: EventGuest[];
}) {
  const [tab, setTab] = useState<Tab>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Re-resolve the selected guest from props on every render so the modal
  // reflects the latest server state after a check-in toggle.
  const selected = useMemo(
    () => guests.find((g) => g.guest_id === selectedId) ?? null,
    [guests, selectedId],
  );

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;

  return (
    <section className="rounded-lg border border-aegis-gray-100 bg-white">
      {/* Toolbar — mode-agnostic actions */}
      <div className="flex flex-col gap-3 border-b border-aegis-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 print:hidden">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-aegis-navy">Guests</h3>
          <span className="text-[11px] text-aegis-gray-500 tabular-nums">
            <span className="font-medium text-aegis-navy">{checkedIn}</span>
            <span className="text-aegis-gray-300"> / {total}</span> checked in
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/kiosk/${eventId}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-1.5 text-xs font-semibold text-aegis-orange-600 hover:bg-aegis-orange-100"
            title="Open the front-desk check-in kiosk in a new tab — designed for ad-hoc ushers on mobile or tablet."
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4" width="18" height="14" rx="2" />
              <path d="M7 21h10M9 18v3M15 18v3" />
              <path d="M8 11h8" />
            </svg>
            Kiosk mode
          </Link>
          <ImportGuests eventId={eventId} />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-aegis-orange px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-aegis-orange-600"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add guest
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-3 border-b border-aegis-gray-100 px-4 sm:px-5 print:hidden">
        <div role="tablist" aria-label="Guest views" className="flex">
          <TabButton active={tab === 'list'} onClick={() => setTab('list')}>
            List
          </TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
            Search &amp; check-in
          </TabButton>
          <TabButton active={tab === 'report'} onClick={() => setTab('report')}>
            Report
          </TabButton>
        </div>
        {tab === 'list' && checkedIn > 0 && (
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className="text-[11px] font-medium text-aegis-gray-500 hover:text-red-600"
          >
            Reset all check-ins
          </button>
        )}
      </div>

      {/* Active view */}
      {tab === 'list' && (
        <GuestListView guests={guests} onPick={(g) => setSelectedId(g.guest_id)} />
      )}
      {tab === 'search' && (
        <GuestSearchCheckin
          guests={guests}
          onPick={(g) => setSelectedId(g.guest_id)}
        />
      )}
      {tab === 'report' && (
        <GuestReport eventId={eventId} eventName={eventName} guests={guests} />
      )}

      <NewGuestModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={eventId}
      />

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => bulkSetCheckInAction(eventId, false)}
        title="Reset all check-ins?"
        description="Marks every guest as not checked in. Useful if the event hasn't started yet or you accidentally bulk-checked."
        confirmLabel="Reset"
        destructive
      />

      <GuestDetailModal
        guest={selected}
        open={selected !== null}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        '-mb-px border-b-2 px-3 py-3 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
        active
          ? 'border-aegis-orange text-aegis-navy'
          : 'border-transparent text-aegis-gray-500 hover:text-aegis-navy',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function NewGuestModal({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const [state, action] = useActionState(createGuestAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Add guest" description="Add one guest to the list.">
      <form action={action} className="space-y-4">
        <input type="hidden" name="event_id" value={eventId} />
        <GuestFormFields />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
