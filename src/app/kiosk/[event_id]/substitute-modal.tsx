'use client';

import { useMemo, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import { displayCompany, displayName } from '@/lib/display-format';
import {
  GUEST_TIER_LABEL,
  type EventGuest,
  type GuestTier,
} from '@/lib/types';
import {
  kioskRegisterSubstituteAction,
  type KioskSubstituteResult,
} from './actions';

const TIER_OPTIONS: GuestTier[] = ['vip', 'analyst', 'kol', 'media', 'standard'];

// Substitute-on-arrival: the named invitee did not show, but a colleague
// from the same firm did. Rather than logging a generic walk-in (which
// loses the link back to the original RSVP), this modal captures the
// substitute and points back at the original via substitute_for_guest_id.
//
// UX shape:
//   • Step 1 — pick the original invitee. Filtered by the search term the
//     usher typed at the kiosk; if firm + colleague filter narrows to one
//     row we auto-select it.
//   • Step 2 — capture the substitute's identity. CMSRL / press card show
//     up because compliance often turns on which-named-person attended.
//
// When the event has requires_walkin_approval = true the resulting row
// lands as walkin_status = 'pending' (same compliance bar as a generic
// walk-in — substitution can't be a back-door around quiet-period gates).

type Props = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** All guests for this event — drives the original-invitee picker. */
  guests: EventGuest[];
  /** True iff the event gates walk-ins behind supervisor approval. Drives
   *  the submit-button label and the success copy. */
  requiresApproval: boolean;
  /** Search term the usher had typed; we use it to pre-filter the picker
   *  so the original invitee they were looking for surfaces immediately. */
  prefillName?: string;
  onSuccess: (result: Extract<KioskSubstituteResult, { ok: true }>) => void;
};

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';
const inputClass =
  'w-full rounded-lg border border-aegis-gray-200 bg-white px-3 py-2.5 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

export default function SubstituteModal({
  open,
  onClose,
  eventId,
  guests,
  requiresApproval,
  prefillName,
  onSuccess,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [originalGuestId, setOriginalGuestId] = useState<string>('');
  const [pickerQuery, setPickerQuery] = useState(prefillName ?? '');

  const [name, setName] = useState('');
  const [honorific, setHonorific] = useState('');
  const [preferred, setPreferred] = useState('');
  const [title, setTitle] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [cmsrl, setCmsrl] = useState('');
  const [pressCard, setPressCard] = useState('');
  // Tier inherits the original invitee's tier by default. The override
  // is null until the usher explicitly picks a different value — that
  // way picking a different original re-defaults cleanly without the
  // setState-in-effect anti-pattern.
  const [tierOverride, setTierOverride] = useState<GuestTier | null>(null);
  const [notes, setNotes] = useState('');

  // Show only invitees who have NOT already checked in — substituting an
  // already-attending colleague is nonsensical. Also skip rows that were
  // themselves walk-ins or substitutes (they have walkin_status set), since
  // those aren't pre-RSVP'd invitees you can substitute against.
  const candidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const filtered = guests.filter((g) => {
      if (g.checked_in) return false;
      if (g.walkin_status) return false;
      if (!q) return true;
      return (
        g.full_name.toLowerCase().includes(q) ||
        (g.company?.toLowerCase().includes(q) ?? false) ||
        (g.title?.toLowerCase().includes(q) ?? false)
      );
    });
    // Stable order: by company then by name so colleagues group together.
    filtered.sort((a, b) => {
      const ca = (a.company ?? '').toLowerCase();
      const cb = (b.company ?? '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return a.full_name.localeCompare(b.full_name);
    });
    return filtered.slice(0, 50);
  }, [guests, pickerQuery]);

  const original = guests.find((g) => g.guest_id === originalGuestId) ?? null;

  // Resolved tier: explicit override wins, else inherit from the original,
  // else fall back to 'standard'. Computed on every render so picking a
  // new original re-defaults without an effect.
  const tier: GuestTier = tierOverride ?? original?.tier ?? 'standard';

  // Wrap the original-picker click so changing the original clears any
  // explicit tier override the usher had in mind for the previous
  // selection. Otherwise an analyst tier picked for invitee A would
  // sticky onto invitee B (a media reporter), which is exactly the
  // wrong behaviour.
  function pickOriginal(id: string) {
    setOriginalGuestId(id);
    setTierOverride(null);
  }

  function reset() {
    setError(null);
    setOriginalGuestId('');
    setPickerQuery('');
    setName('');
    setHonorific('');
    setPreferred('');
    setTitle('');
    setContact('');
    setEmail('');
    setCmsrl('');
    setPressCard('');
    setTierOverride(null);
    setNotes('');
  }

  function close() {
    reset();
    onClose();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!originalGuestId) {
      setError('Pick the original invitee being substituted.');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Substitute name is required.');
      return;
    }

    startTransition(async () => {
      const res = await kioskRegisterSubstituteAction(eventId, {
        original_guest_id: originalGuestId,
        full_name: trimmedName,
        title: title.trim() || null,
        contact_number: contact.trim() || null,
        email: email.trim() || null,
        honorific: honorific.trim() || null,
        preferred_name: preferred.trim() || null,
        cmsrl_number: cmsrl.trim() || null,
        press_card_no: pressCard.trim() || null,
        tier,
        notes: notes.trim() || null,
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
    ? 'Registering…'
    : requiresApproval
      ? 'Submit for approval'
      : 'Register & check in';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Register substitute"
      description="Same-firm replacement for an invitee who didn't make it. The original record is kept so post-event reports show who was substituted for whom."
      size="2xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {/* ── Step 1: pick original invitee ─────────────────────── */}
        <div className="rounded-xl border border-aegis-gray-100 bg-aegis-gray-50/50 p-4">
          <p className={labelClass}>Replacing which invitee? *</p>
          <input
            type="search"
            value={pickerQuery}
            onChange={(e) => setPickerQuery(e.target.value)}
            placeholder="Filter by name, firm, or title…"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className={inputClass}
          />
          <ul className="mt-3 max-h-56 divide-y divide-aegis-gray-100 overflow-y-auto rounded-lg border border-aegis-gray-100 bg-white">
            {candidates.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-aegis-gray-500">
                No matching invitees on the no-show list. If the original was already
                checked in, this is a fresh walk-in instead.
              </li>
            ) : (
              candidates.map((g) => {
                const selected = g.guest_id === originalGuestId;
                return (
                  <li key={g.guest_id}>
                    <button
                      type="button"
                      onClick={() => pickOriginal(g.guest_id)}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'bg-aegis-orange-50 ring-1 ring-inset ring-aegis-orange/40'
                          : 'hover:bg-aegis-gray-50',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-aegis-navy">
                          {displayName(g.full_name)}
                        </p>
                        <p className="truncate text-[11px] text-aegis-gray-500">
                          {[
                            g.title ? displayName(g.title) : null,
                            g.company ? displayCompany(g.company) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                      {g.table_number && (
                        <span className="rounded bg-aegis-gold-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-gold/40">
                          T·{g.table_number}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {original && (
            <p className="mt-2 text-[11px] text-aegis-gray-500">
              Substitute will inherit{' '}
              {original.company ? (
                <>
                  the firm{' '}
                  <strong className="text-aegis-navy">
                    {displayCompany(original.company)}
                  </strong>
                </>
              ) : (
                'the original record'
              )}
              {original.table_number && (
                <>
                  {' '}
                  and table{' '}
                  <strong className="text-aegis-navy">
                    {original.table_number}
                  </strong>
                </>
              )}
              .
            </p>
          )}
        </div>

        {/* ── Step 2: substitute identity ───────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sub_honorific" className={labelClass}>
              Honorific
            </label>
            <input
              id="sub_honorific"
              value={honorific}
              onChange={(e) => setHonorific(e.target.value)}
              placeholder="Datuk, Tan Sri, Dr…"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_name" className={labelClass}>
              Full name *
            </label>
            <input
              id="sub_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Substitute's full name"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sub_preferred" className={labelClass}>
              Preferred name (badge)
            </label>
            <input
              id="sub_preferred"
              value={preferred}
              onChange={(e) => setPreferred(e.target.value)}
              placeholder="Optional — what to print on the badge"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_title" className={labelClass}>
              Title
            </label>
            <input
              id="sub_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Analyst, Reporter"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_contact" className={labelClass}>
              Contact number
            </label>
            <input
              id="sub_contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="tel"
              placeholder="+60 12-345 6789"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_email" className={labelClass}>
              Email
            </label>
            <input
              id="sub_email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@example.com"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_cmsrl" className={labelClass}>
              CMSRL number
            </label>
            <input
              id="sub_cmsrl"
              value={cmsrl}
              onChange={(e) => setCmsrl(e.target.value)}
              placeholder="For sell-side analysts"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="sub_press_card" className={labelClass}>
              Press card no.
            </label>
            <input
              id="sub_press_card"
              value={pressCard}
              onChange={(e) => setPressCard(e.target.value)}
              placeholder="For accredited media"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sub_tier" className={labelClass}>
              Audience tier
            </label>
            <select
              id="sub_tier"
              value={tier}
              onChange={(e) => setTierOverride(e.target.value as GuestTier)}
              className={inputClass}
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {GUEST_TIER_LABEL[t]}
                </option>
              ))}
            </select>
            {original && tierOverride === null && (
              <p className="mt-1 text-[11px] text-aegis-gray-500">
                Defaulted to <strong>{GUEST_TIER_LABEL[original.tier]}</strong>{' '}
                (original&apos;s tier). Change only if the substitute is
                genuinely a different role.
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="sub_notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="sub_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder='Optional — e.g. "Junior associate covering for Datuk on leave"'
            className={`${inputClass} resize-y`}
          />
        </div>

        {requiresApproval && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This event gates walk-ins on supervisor approval — the substitute
            will land as <strong>pending</strong> until a director or super
            admin approves.
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
