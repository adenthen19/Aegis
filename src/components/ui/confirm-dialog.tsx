'use client';

import { useState } from 'react';
import Modal from './modal';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<{ ok: boolean; error: string | null }> | void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

export default function ConfirmDialog({
  open, onClose, onConfirm, title, description,
  confirmLabel = 'Confirm', destructive = false,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setError(null);
    setPending(true);
    try {
      const result = await onConfirm();
      if (result && !result.ok) {
        setError(result.error ?? 'Something went wrong.');
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} description={description}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
            {error}
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className={[
              'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-60',
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-aegis-orange hover:bg-aegis-orange-600',
            ].join(' ')}
          >
            {pending && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {pending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
