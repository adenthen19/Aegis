'use client';

/**
 * Render quick-send buttons for a regulatory pre-work todo. Compose links
 * (mailto: and https://wa.me/) prefill the recipient and a templated body so
 * the IR PIC can hand-send via their email client / WhatsApp without
 * retyping. Email/WhatsApp automation is out of scope until Phase 3.
 */

const KEY_PATTERN = /^regulatory:prework:results_q([1-4]):(\d{4})$/;

export type PreworkContact = {
  full_name: string;
  email: string | null;
  phone: string | null;
};

function normalizePhone(raw: string): string {
  // wa.me expects a country-coded number with no plus / dashes / spaces.
  return raw.replace(/[^0-9]/g, '');
}

function buildMailto(args: {
  email: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({ subject: args.subject, body: args.body });
  return `mailto:${encodeURIComponent(args.email)}?${params.toString()}`;
}

function buildWhatsApp(args: { phone: string; body: string }): string {
  const phone = normalizePhone(args.phone);
  if (!phone) return '';
  return `https://wa.me/${phone}?text=${encodeURIComponent(args.body)}`;
}

function templateBody(args: {
  contactName: string;
  clientName: string;
  fyLabel: string;
  quarter: string;
  deadline: string;
}): string {
  return [
    `Hi ${args.contactName},`,
    '',
    `The Bursa deadline for ${args.clientName}'s ${args.fyLabel} ${args.quarter} results announcement is ${args.deadline}.`,
    '',
    'Could you let us know:',
    '  1. Your target release date for the announcement',
    '  2. A draft of the results numbers when ready, so we can prepare the press release in parallel',
    '',
    'Thanks,',
    'Aegis IR/PR team',
  ].join('\n');
}

export default function RegulatoryPreworkButtons({
  autoKey,
  clientName,
  deadline,
  contact,
}: {
  autoKey: string;
  clientName: string;
  deadline: string | null;
  contact: PreworkContact | null;
}) {
  const m = KEY_PATTERN.exec(autoKey);
  if (!m) return null;
  const quarter = `Q${m[1]}`;
  const fyLabel = `FY${m[2]}`;
  const deadlineLabel = deadline
    ? new Date(deadline).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : 'TBC';

  const subject = `${clientName} — ${fyLabel} ${quarter} results: release date + draft request`;
  const body = templateBody({
    contactName: contact?.full_name ?? 'team',
    clientName,
    fyLabel,
    quarter,
    deadline: deadlineLabel,
  });

  const mailto = contact?.email
    ? buildMailto({ email: contact.email, subject, body })
    : null;
  const whatsapp = contact?.phone ? buildWhatsApp({ phone: contact.phone, body }) : null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center rounded-full bg-aegis-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-orange/30">
        Bursa pre-work
      </span>
      {mailto ? (
        <a
          href={mailto}
          className="inline-flex items-center gap-1 rounded border border-aegis-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-aegis-navy hover:bg-aegis-navy-50"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
          Email
        </a>
      ) : (
        <span className="text-[11px] text-aegis-gray-300">No email on file</span>
      )}
      {whatsapp ? (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 21l2-5.5A8.5 8.5 0 1 1 21 11.5z" />
          </svg>
          WhatsApp
        </a>
      ) : (
        <span className="text-[11px] text-aegis-gray-300">No phone on file</span>
      )}
      {contact && (
        <span className="text-[11px] text-aegis-gray-500">
          → {contact.full_name}
        </span>
      )}
    </div>
  );
}

export function isRegulatoryPreworkKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return KEY_PATTERN.test(key);
}
