'use client';

import { useEffect } from 'react';

type Size = 'lg' | '2xl';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  size?: Size;
};

const SIZE_CLASS: Record<Size, string> = {
  lg: 'sm:max-w-lg',
  '2xl': 'sm:max-w-2xl',
};

// ─── Shared body-scroll lock (reference-counted) ──────────────────
//
// Multiple modals can stack — e.g. GuestDetailModal opening
// ConfirmDialog when "Remove guest" is tapped. If each modal
// independently saves and restores `body.style.overflow`, the inner
// modal captures the *already-locked* value ('hidden') as its "prev"
// and ends up restoring the body to 'hidden' on close — leaving the
// page un-scrollable after the operation completes.
//
// A shared counter fixes this: only the FIRST mount captures the
// pre-modal value and locks; only the LAST unmount restores. All
// the in-between modals are no-ops on this state.
let modalLockCount = 0;
let savedBodyOverflow = '';

function lockBodyScroll() {
  if (modalLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  modalLockCount += 1;
}

function unlockBodyScroll() {
  modalLockCount = Math.max(0, modalLockCount - 1);
  if (modalLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

export default function Modal({
  open, onClose, title, description, children, dismissible = true, size = 'lg',
}: Props) {
  // Body scroll lock — depends ONLY on `open`. If we also depended on
  // `onClose` here, every parent re-render that recreates the callback
  // (e.g. GuestList polls every 15s and refreshes via realtime, churning
  // its `() => setAddOpen(false)` arrow) would cycle unlock→lock. During
  // the unlock half of that cycle savedBodyOverflow gets re-captured —
  // and if any code reads body.style.overflow while it's transiently
  // 'hidden' (or another lock briefly co-exists), the saved value sticks
  // as 'hidden' and the page stays scroll-locked after the modal closes.
  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [open]);

  // ESC-to-close lives in its own effect so it can depend on onClose +
  // dismissible without disturbing the scroll lock above.
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center">
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-aegis-navy/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        // On mobile: full-screen sheet (h-full + 100dvh ceiling so the
        // iOS keyboard never hides the focused field). On sm+: centred
        // dialog with the legacy 90vh cap and rounded corners.
        // 100dvh tracks the visual viewport — when the keyboard opens,
        // the available height shrinks and the inner overflow-y-auto
        // form keeps the focused input visible.
        className={`relative z-10 flex h-full max-h-[100dvh] w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-xl ${SIZE_CLASS[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-aegis-gray-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-aegis-navy">
              {title}
            </h2>
            {description && (
              <p className="mt-0.5 text-xs text-aegis-gray-500">{description}</p>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-aegis-gray-100 hover:text-aegis-gray"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          )}
        </div>

        <div className="aegis-scroll flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
