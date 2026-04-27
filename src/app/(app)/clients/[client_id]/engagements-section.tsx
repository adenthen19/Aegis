'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  ENGAGEMENT_STATUS_LABEL,
  ENGAGEMENT_TYPE_LABEL,
  type Engagement,
  type EngagementStatus,
  type ServiceTier,
} from '@/lib/types';
import {
  type ActionState,
  createEngagementAction,
  deleteEngagementAction,
  renewEngagementAction,
  updateEngagementAction,
} from '../engagements-actions';
import EngagementFormFields from './engagement-form-fields';

const STATUS_BADGE: Record<EngagementStatus, string> = {
  draft: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200 line-through',
};

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR',
  pr: 'PR',
  esg: 'ESG',
  virtual_meeting: 'Virtual Meeting',
  ipo: 'IPO',
  agm_egm: 'AGM/EGM',
  social_media: 'Social Media',
  event_management: 'Event Management',
};

const initialState: ActionState = { ok: false, error: null };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function daysBetween(start: string, end: string | null): string {
  if (!end) return 'open';
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const days = Math.round((e - s) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'open';
  if (days < 60) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round((days / 365) * 10) / 10} years`;
}

function daysRemaining(end: string | null): string | null {
  if (!end) return null;
  const e = new Date(end).getTime();
  const now = Date.now();
  const days = Math.round((e - now) / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'ends today';
  return `${days} days left`;
}

export default function EngagementsSection({
  clientId,
  clientTiers,
  engagements,
}: {
  clientId: string;
  clientTiers: ServiceTier[];
  engagements: Engagement[];
}) {
  const [newOpen, setNewOpen] = useState(false);

  const sorted = [...engagements].sort((a, b) => {
    // Active first, then by start_date desc
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (b.status === 'active' && a.status !== 'active') return 1;
    return b.start_date.localeCompare(a.start_date);
  });

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + New engagement
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No engagements logged yet. Open one to scope the contract period and seed commitments.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((e) => (
            <EngagementRow
              key={e.engagement_id}
              row={e}
              clientId={clientId}
              clientTiers={clientTiers}
            />
          ))}
        </ul>
      )}

      <NewEngagementModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clientId={clientId}
        clientTiers={clientTiers}
      />
    </>
  );
}

function EngagementRow({
  row,
  clientId,
  clientTiers,
}: {
  row: Engagement;
  clientId: string;
  clientTiers: ServiceTier[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const remaining = row.status === 'active' ? daysRemaining(row.end_date) : null;
  // Renew is offered on active or recently-completed engagements. Drafts and
  // cancelled scopes don't typically renew — the user should edit or open a
  // fresh engagement instead.
  const canRenew = row.status === 'active' || row.status === 'completed';

  return (
    <li className="rounded-md border border-aegis-gray-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-aegis-navy">{row.name}</span>
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                STATUS_BADGE[row.status],
              ].join(' ')}
            >
              {ENGAGEMENT_STATUS_LABEL[row.status]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              {ENGAGEMENT_TYPE_LABEL[row.engagement_type]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
            <span className="tabular-nums">
              {formatDate(row.start_date)} → {formatDate(row.end_date)}
              <span className="text-aegis-gray-300"> · {daysBetween(row.start_date, row.end_date)}</span>
            </span>
            {remaining && (
              <span
                className={
                  remaining.includes('overdue')
                    ? 'font-medium text-red-600'
                    : 'text-aegis-gray-500'
                }
              >
                {remaining}
              </span>
            )}
            {row.contract_value != null && (
              <span className="tabular-nums">
                {row.currency} {row.contract_value.toLocaleString()}
              </span>
            )}
          </div>
          {row.service_tier.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {row.service_tier.map((t) => (
                <span
                  key={t}
                  className="inline-flex rounded bg-aegis-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-aegis-navy"
                >
                  {TIER_LABEL[t]}
                </span>
              ))}
            </div>
          )}
          {row.scope_summary && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
              {row.scope_summary}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canRenew && (
            <button
              type="button"
              onClick={() => setRenewOpen(true)}
              title="Renew engagement (opens a 12-month follow-on)"
              className="inline-flex items-center rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-navy hover:bg-aegis-navy-50"
            >
              <svg
                className="mr-1 h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 4v6h-6" />
              </svg>
              Renew
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            title="Edit engagement"
            aria-label="Edit engagement"
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
            title="Delete engagement"
            aria-label="Delete engagement"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
            </svg>
          </button>
        </div>
      </div>

      <EditEngagementModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
        clientTiers={clientTiers}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteEngagementAction(row.engagement_id)}
        title="Delete engagement?"
        description="All commitments and scheduled sessions under this engagement will be deleted as well. This cannot be undone."
        confirmLabel="Delete engagement"
        destructive
      />
      <ConfirmDialog
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        onConfirm={() => renewEngagementAction(row.engagement_id)}
        title={`Renew "${row.name}"?`}
        description="This closes the current engagement (status → completed) and opens a new 12-month engagement starting the day after this one ends. Tier list, contract value, and scope are copied; commitments + Bursa deadlines + quarterly pre-work to-dos seed automatically."
        confirmLabel="Renew engagement"
      />
    </li>
  );
}

function NewEngagementModal({
  open,
  onClose,
  clientId,
  clientTiers,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientTiers: ServiceTier[];
}) {
  const [state, action] = useActionState(createEngagementAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New engagement"
      description="Open a contracted scope of work. Commitments seed against the tiers selected here."
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <EngagementFormFields clientId={clientId} clientTiers={clientTiers} />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditEngagementModal({
  open,
  onClose,
  row,
  clientId,
  clientTiers,
}: {
  open: boolean;
  onClose: () => void;
  row: Engagement;
  clientId: string;
  clientTiers: ServiceTier[];
}) {
  const [state, action] = useActionState(updateEngagementAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit engagement"
      description="Updating tiers seeds matching templates; existing commitments are preserved."
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <EngagementFormFields
          initial={row}
          clientId={clientId}
          clientTiers={clientTiers}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
