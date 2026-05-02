'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import GuestFormFields from './guest-form-fields';
import {
  deleteGuestAction,
  toggleGuestCheckInAction,
  updateGuestAction,
  type ActionState,
} from '../actions';
import type { EventGuest } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import {
  displayCompany,
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import WhatsAppIcon from '@/components/whatsapp-icon';

const initialState: ActionState = { ok: false, error: null };

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function GuestDetailModal({
  guest,
  open,
  onClose,
}: {
  guest: EventGuest | null;
  open: boolean;
  onClose: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset to view mode whenever a different guest opens.
  useEffect(() => {
    if (open) {
      setEditMode(false);
      setError(null);
    }
  }, [open, guest?.guest_id]);

  if (!guest) return null;

  function onToggle() {
    if (!guest) return;
    const target = guest;
    startTransition(async () => {
      setError(null);
      const r = await toggleGuestCheckInAction(target.guest_id, !target.checked_in);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editMode ? 'Edit guest' : displayName(guest.full_name)}
        description={
          editMode
            ? 'Update contact info or notes.'
            : guest.checked_in
              ? `Checked in ${formatDateTime(guest.checked_in_at)}`
              : 'Not yet checked in.'
        }
      >
        {editMode ? (
          <EditForm guest={guest} onDone={() => setEditMode(false)} />
        ) : (
          <div className="space-y-5">
            {guest.table_number && (
              <div className="flex items-center gap-3 rounded-lg border border-aegis-blue/30 bg-aegis-blue-50 px-4 py-3">
                <svg
                  className="h-5 w-5 text-aegis-navy"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M3 10h18M5 10v10M19 10v10M3 6h18" />
                </svg>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                    Table
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-aegis-navy">
                    {guest.table_number}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <Row label="Title">{guest.title ? displayName(guest.title) : '—'}</Row>
              <Row label="Company">{guest.company ? displayCompany(guest.company) : '—'}</Row>
              <Row label="Contact number">
                {guest.contact_number ? (
                  (() => {
                    const wa = whatsAppUrl(guest.contact_number);
                    const display = displayPhone(guest.contact_number);
                    return wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-aegis-navy hover:text-emerald-600"
                        title="Open WhatsApp chat"
                      >
                        <WhatsAppIcon className="h-3.5 w-3.5 text-emerald-500" />
                        {display}
                      </a>
                    ) : (
                      <span className="tabular-nums text-aegis-gray">{display}</span>
                    );
                  })()
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Email">
                {(() => {
                  const lower = displayEmail(guest.email);
                  return lower ? (
                    <a
                      href={`mailto:${lower}`}
                      className="text-aegis-navy hover:text-aegis-orange"
                    >
                      {lower}
                    </a>
                  ) : (
                    '—'
                  );
                })()}
              </Row>
              {!guest.table_number && <Row label="Table">—</Row>}
              {guest.notes && (
                <Row label="Notes">
                  <span className="whitespace-pre-wrap">{guest.notes}</span>
                </Row>
              )}
            </div>

            <button
              type="button"
              onClick={onToggle}
              disabled={pending}
              className={[
                'flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60',
                guest.checked_in
                  ? 'border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700',
              ].join(' ')}
            >
              {guest.checked_in ? (
                <>
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12l5 5 9-11" />
                  </svg>
                  Checked in — tap to undo
                </>
              ) : (
                <>
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M5 12l5 5 9-11" />
                  </svg>
                  Check in
                </>
              )}
            </button>

            {error && (
              <p className="text-center text-xs text-red-600">{error}</p>
            )}

            <div className="flex flex-col gap-2 border-t border-aegis-gray-100 pt-4 sm:flex-row sm:justify-between">
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Remove from list
              </button>
              <div className="flex gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
                >
                  Edit details
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          const r = await deleteGuestAction(guest.guest_id);
          if (r.ok) onClose();
          return r;
        }}
        title="Remove guest?"
        description={`Removes "${guest.full_name}" from the guest list.`}
        confirmLabel="Remove"
        destructive
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-32 shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-sm text-aegis-gray">{children}</span>
    </div>
  );
}

function EditForm({ guest, onDone }: { guest: EventGuest; onDone: () => void }) {
  const [state, action] = useActionState(updateGuestAction, initialState);

  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="guest_id" value={guest.guest_id} />
      <GuestFormFields initial={guest} />
      <FormError message={state.error} />
      <FormActions onCancel={onDone} submitLabel="Update" />
    </form>
  );
}
