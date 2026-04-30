'use client';

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  bulkSetCheckInAction,
  createGuestAction,
  deleteGuestAction,
  toggleGuestCheckInAction,
  updateGuestAction,
  type ActionState,
} from '../actions';
import GuestFormFields from './guest-form-fields';
import ImportGuests from './import-guests';
import type { EventGuest } from '@/lib/types';

const initialState: ActionState = { ok: false, error: null };

function formatTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GuestList({
  eventId,
  guests,
}: {
  eventId: string;
  guests: EventGuest[];
}) {
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [bulkCheckOutOpen, setBulkCheckOutOpen] = useState(false);

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;
  const pending = total - checkedIn;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return guests;
    return guests.filter((g) => {
      return (
        g.full_name.toLowerCase().includes(term) ||
        (g.title?.toLowerCase().includes(term) ?? false) ||
        (g.company?.toLowerCase().includes(term) ?? false) ||
        (g.email?.toLowerCase().includes(term) ?? false) ||
        (g.contact_number?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [guests, search]);

  const exportHref = `/api/events/${eventId}/attendance`;

  return (
    <section className="rounded-lg border border-aegis-gray-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-aegis-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-aegis-navy">Guest list</h3>
          <div className="flex items-center gap-2 text-[11px] text-aegis-gray-500">
            <span className="inline-flex items-center gap-1 rounded-full bg-aegis-navy-50 px-2 py-0.5 font-medium text-aegis-navy tabular-nums">
              {total} total
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 tabular-nums">
              {checkedIn} checked in
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-aegis-gray-50 px-2 py-0.5 font-medium text-aegis-gray tabular-nums">
              {pending} pending
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
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
              <path d="M12 3v12" />
              <path d="M7 12l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            Export attendance
          </a>
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

      <div className="flex flex-col gap-3 border-b border-aegis-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="relative w-full sm:max-w-sm">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aegis-gray-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, email, phone…"
            className="w-full rounded-md border border-aegis-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-aegis-gray-900 outline-none placeholder:text-aegis-gray-300 focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
          />
        </div>
        {checkedIn > 0 && (
          <button
            type="button"
            onClick={() => setBulkCheckOutOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50"
          >
            Reset all check-ins
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-aegis-gray-500">
          {total === 0
            ? 'No guests yet — add one or import a CSV.'
            : `No guests matching "${search}".`}
        </p>
      ) : (
        <ul className="divide-y divide-aegis-gray-100">
          {filtered.map((g) => (
            <GuestRow key={g.guest_id} guest={g} />
          ))}
        </ul>
      )}

      <NewGuestModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={eventId}
      />

      <ConfirmDialog
        open={bulkCheckOutOpen}
        onClose={() => setBulkCheckOutOpen(false)}
        onConfirm={() => bulkSetCheckInAction(eventId, false)}
        title="Reset all check-ins?"
        description="Marks every guest as not checked in. Useful if the event hasn't started yet or you accidentally bulk-checked."
        confirmLabel="Reset"
        destructive
      />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────

function GuestRow({ guest }: { guest: EventGuest }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggle() {
    startTransition(async () => {
      setError(null);
      const r = await toggleGuestCheckInAction(guest.guest_id, !guest.checked_in);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li
      className={[
        'flex flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap sm:px-5',
        guest.checked_in ? 'bg-emerald-50/40' : '',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={guest.checked_in}
        title={guest.checked_in ? 'Mark not checked in' : 'Check in'}
        className={[
          'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors',
          guest.checked_in
            ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
            : 'border-aegis-gray-200 bg-white text-transparent hover:border-aegis-navy hover:text-aegis-navy/30',
          pending ? 'opacity-50' : '',
        ].join(' ')}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12l5 5 9-11" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-aegis-navy">{guest.full_name}</span>
          {guest.title && (
            <span className="text-[11px] text-aegis-gray-500">{guest.title}</span>
          )}
          {guest.company && (
            <span className="text-[11px] text-aegis-gray-500">· {guest.company}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
          {guest.email && (
            <a href={`mailto:${guest.email}`} className="hover:text-aegis-navy">
              {guest.email}
            </a>
          )}
          {guest.contact_number && <span>{guest.contact_number}</span>}
          {guest.checked_in && guest.checked_in_at && (
            <span className="font-medium text-emerald-700">
              Checked in {formatTime(guest.checked_in_at)}
            </span>
          )}
        </div>
        {guest.notes && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
            {guest.notes}
          </p>
        )}
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          title="Edit guest"
          aria-label="Edit guest"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          title="Remove guest"
          aria-label="Remove guest"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 6h18" />
            <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
          </svg>
        </button>
      </div>

      <EditGuestModal
        guest={guest}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteGuestAction(guest.guest_id)}
        title="Remove guest?"
        description={`Removes "${guest.full_name}" from the guest list.`}
        confirmLabel="Remove"
        destructive
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Add / edit modals
// ─────────────────────────────────────────────────────────────────────────

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

function EditGuestModal({
  guest,
  open,
  onClose,
}: {
  guest: EventGuest;
  open: boolean;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateGuestAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit guest" description="Update contact info or notes.">
      <form action={action} className="space-y-4">
        <input type="hidden" name="guest_id" value={guest.guest_id} />
        <GuestFormFields initial={guest} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
