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

export default function Modal({
  open, onClose, title, description, children, dismissible = true, size = 'lg',
}: Props) {
  // Body scroll lock + (optional) ESC-to-close
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (dismissible && e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div
        aria-hidden
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 bg-aegis-navy/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${SIZE_CLASS[size]}`}
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
