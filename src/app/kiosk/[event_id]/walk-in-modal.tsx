'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import TablePicker from '@/components/seating/table-picker';
import { buildTableRows } from '@/lib/seating';
import type { EventGuest, EventTable } from '@/lib/types';
import { kioskAddWalkInAction, type KioskWalkInResult } from './actions';

// Walk-in: a guest with no prior record arrives at the door. We collect
// the bare minimum (name + optional company / contact / table) and create
// an event_guests row. Capacity is checked soft-warning only — usher can
// override and we audit the override.
//
// Two outcome paths driven by the event's requires_walkin_approval flag:
//   • Off — row is created with checked_in=true, walkin_status='approved'.
//           Usher sees "checked in" and the toast confirms.
//   • On  — row is created with checked_in=false, walkin_status='pending'.
//           Usher sees "submitted for approval" toast; supervisor (director
//           / super_admin) approves later from the kiosk's pending queue.

type Props = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  guests: EventGuest[];
  tables: EventTable[];
  defaultCapacity: number | null;
  /** True iff the event gates walk-ins on supervisor approval. */
  requiresApproval: boolean;
  /** Prefill the name field — we hand over the search query so the usher
   *  doesn't have to retype what they just searched. */
  prefillName?: string;
  onSuccess: (result: Extract<KioskWalkInResult, { ok: true }>) => void;
};

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';
const inputClass =
  'w-full rounded-lg border border-aegis-gray-200 bg-white px-3 py-2.5 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

export default function WalkInModal({
  open,
  onClose,
  eventId,
  guests,
  tables,
  defaultCapacity,
  requiresApproval,
  prefillName,
  onSuccess,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(prefillName ?? '');
  const [honorific, setHonorific] = useState('');
  const [preferred, setPreferred] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [cmsrl, setCmsrl] = useState('');
  const [pressCard, setPressCard] = useState('');
  const [notes, setNotes] = useState('');
  const [tableNumber, setTableNumber] = useState<string | null>(null);

  function reset() {
    setError(null);
    setName('');
    setHonorific('');
    setPreferred('');
    setTitle('');
    setCompany('');
    setContact('');
    setEmail('');
    setCmsrl('');
    setPressCard('');
    setNotes('');
    setTableNumber(null);
  }

  function close() {
    reset();
    onClose();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    // Detect "seating past capacity" so the audit can flag it. We replay the
    // same row-builder the picker uses so the picker's visual state and the
    // audit decision can never disagree.
    const rows = buildTableRows(guests, tables, defaultCapacity);
    let capacityOverride = false;
    if (tableNumber) {
      const row = rows.find((r) => r.table_number === tableNumber);
      // If row doesn't exist yet (brand-new table that nobody is on and no
      // override registered), there's nothing to be over capacity of.
      if (row && row.capacity != null && row.used >= row.capacity) {
        capacityOverride = true;
      }
    }

    startTransition(async () => {
      const res = await kioskAddWalkInAction(eventId, {
        full_name: trimmedName,
        title: title.trim() || null,
        company: company.trim() || null,
        contact_number: contact.trim() || null,
        email: email.trim() || null,
        table_number: tableNumber,
        notes: notes.trim() || null,
        honorific: honorific.trim() || null,
        preferred_name: preferred.trim() || null,
        cmsrl_number: cmsrl.trim() || null,
        press_card_no: pressCard.trim() || null,
        capacity_override: capacityOverride,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess(res);
      reset();
    });
  }

  const submitLabel = pending
    ? requiresApproval
      ? 'Submitting…'
      : 'Adding…'
    : requiresApproval
      ? 'Submit for approval'
      : 'Add & check in';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add walk-in"
      description={
        requiresApproval
          ? 'This event requires supervisor approval. The walk-in will land as pending until a director or super admin approves.'
          : "Register a guest who didn't have a prior record. They'll be checked in immediately and flagged in the post-event report."
      }
      size="2xl"
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="walkin_honorific" className={labelClass}>
              Honorific
            </label>
            <input
              id="walkin_honorific"
              value={honorific}
              onChange={(e) => setHonorific(e.target.value)}
              placeholder="Datuk, Tan Sri, Dr…"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_name" className={labelClass}>
              Full name *
            </label>
            <input
              id="walkin_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Guest's full name"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="walkin_preferred" className={labelClass}>
              Preferred name (badge)
            </label>
            <input
              id="walkin_preferred"
              value={preferred}
              onChange={(e) => setPreferred(e.target.value)}
              placeholder="Optional — what to print on the badge"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_title" className={labelClass}>
              Title
            </label>
            <input
              id="walkin_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CFO, Reporter"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_company" className={labelClass}>
              Company
            </label>
            <input
              id="walkin_company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Firm or publication"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_contact" className={labelClass}>
              Contact number
            </label>
            <input
              id="walkin_contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="tel"
              placeholder="+852 1234 5678"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_email" className={labelClass}>
              Email
            </label>
            <input
              id="walkin_email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_cmsrl" className={labelClass}>
              CMSRL number
            </label>
            <input
              id="walkin_cmsrl"
              value={cmsrl}
              onChange={(e) => setCmsrl(e.target.value)}
              placeholder="For sell-side analysts"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="walkin_press_card" className={labelClass}>
              Press card no.
            </label>
            <input
              id="walkin_press_card"
              value={pressCard}
              onChange={(e) => setPressCard(e.target.value)}
              placeholder="For accredited media"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <p className={labelClass}>Table</p>
          <TablePicker
            tables={tables}
            guests={guests}
            defaultCapacity={defaultCapacity}
            value={tableNumber}
            onChange={setTableNumber}
            minFree={1}
            allowUnassigned
          />
        </div>

        <div>
          <label htmlFor="walkin_notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="walkin_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder='Optional — e.g. "VIP guest of CEO", "media — needs press kit"'
            className={`${inputClass} resize-y`}
          />
        </div>

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

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
