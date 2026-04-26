'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  STAKEHOLDER_CATEGORY_LABEL,
  type ClientStakeholder,
  type StakeholderCategory,
} from '@/lib/types';
import {
  type ActionState,
  createStakeholderAction,
  deleteStakeholderAction,
  updateStakeholderAction,
} from '../stakeholders-actions';
import StakeholderFormFields from './stakeholder-form-fields';

const CATEGORY_ORDER: StakeholderCategory[] = ['executive', 'board', 'advisor', 'other'];

const initialState: ActionState = { ok: false, error: null };

export default function StakeholdersSection({
  clientId,
  rows,
}: {
  clientId: string;
  rows: ClientStakeholder[];
}) {
  const [newOpen, setNewOpen] = useState(false);

  const grouped = new Map<StakeholderCategory, ClientStakeholder[]>();
  for (const r of rows) {
    const list = grouped.get(r.category) ?? [];
    list.push(r);
    grouped.set(r.category, list);
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + Add stakeholder
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No stakeholders recorded yet. Add the CEO, CFO, IR director, advisors, etc.
        </p>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => {
            const list = (grouped.get(category) ?? []).slice().sort((a, b) => {
              if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
              return a.role.localeCompare(b.role);
            });
            return (
              <div key={category}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                  {STAKEHOLDER_CATEGORY_LABEL[category]}
                </p>
                <ul className="divide-y divide-aegis-gray-100 rounded-md border border-aegis-gray-100">
                  {list.map((s) => (
                    <StakeholderRow key={s.stakeholder_id} row={s} clientId={clientId} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <NewStakeholderModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clientId={clientId}
      />
    </>
  );
}

function StakeholderRow({
  row,
  clientId,
}: {
  row: ClientStakeholder;
  clientId: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-aegis-navy">{row.full_name}</span>
          <span className="text-[11px] text-aegis-gray-500">{row.role}</span>
          {row.is_primary && (
            <span className="inline-flex items-center rounded-full bg-aegis-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-orange/30">
              Primary
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
          {row.email && (
            <a
              href={`mailto:${row.email}`}
              className="hover:text-aegis-navy"
            >
              {row.email}
            </a>
          )}
          {row.phone && <span className="tabular-nums">{row.phone}</span>}
        </div>
        {row.notes && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
            {row.notes}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          title="Edit"
          aria-label="Edit"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          title="Delete"
          aria-label="Delete"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
          </svg>
        </button>
      </div>

      <EditStakeholderModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteStakeholderAction(row.stakeholder_id)}
        title="Delete stakeholder?"
        description={`This will permanently remove "${row.full_name}" from this client.`}
        confirmLabel="Delete"
        destructive
      />
    </li>
  );
}

function NewStakeholderModal({
  open,
  onClose,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
}) {
  const [state, action] = useActionState(createStakeholderAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add stakeholder"
      description="A named contact on the client side."
    >
      <form action={action} className="space-y-4">
        <StakeholderFormFields clientId={clientId} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditStakeholderModal({
  open,
  onClose,
  row,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  row: ClientStakeholder;
  clientId: string;
}) {
  const [state, action] = useActionState(updateStakeholderAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit stakeholder"
      description={row.full_name}
    >
      <form action={action} className="space-y-4">
        <StakeholderFormFields clientId={clientId} initial={row} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
