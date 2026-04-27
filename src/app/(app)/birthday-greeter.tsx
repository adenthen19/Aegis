'use client';

/**
 * Birthday surface.
 *
 * Two states, mutually exclusive:
 *   1. It's the current user's birthday → full celebratory modal.
 *   2. It's some other team member's birthday → small dismissible banner
 *      pinned to the top of the main content area.
 *
 * Each is shown at most ONCE per local-time day, tracked via localStorage
 * so the user doesn't get pestered after dismissing.
 *
 * Date comparison is intentionally done in the browser so it respects the
 * user's local timezone — a midnight UTC switch can otherwise show
 * "today's birthday" a day off for KL-based staff.
 */

import { useEffect, useState } from 'react';

export type BirthdayProfile = {
  user_id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  birthday: string;
};

const SELF_DISMISS_KEY = 'aegis-birthday-self-dismissed';
const TEAM_DISMISS_KEY = 'aegis-birthday-team-dismissed';

function localToday(): { mm: number; dd: number; iso: string } {
  const d = new Date();
  return {
    mm: d.getMonth() + 1,
    dd: d.getDate(),
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
}

function birthdayMatchesToday(birthday: string): boolean {
  // Birthday stored as YYYY-MM-DD. Parse manually so timezone shifts don't
  // bump the date by one. We only care about month/day.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return false;
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const today = localToday();
  return mm === today.mm && dd === today.dd;
}

function profileLabel(p: BirthdayProfile): string {
  return (p.display_name && p.display_name.trim()) || p.email;
}

function profileInitial(p: BirthdayProfile): string {
  return profileLabel(p).charAt(0).toUpperCase();
}

export default function BirthdayGreeter({
  selfUserId,
  selfBirthday,
  birthdayProfiles,
}: {
  selfUserId: string;
  selfBirthday: string | null;
  birthdayProfiles: BirthdayProfile[];
}) {
  const [showSelfModal, setShowSelfModal] = useState(false);
  const [showTeamBanner, setShowTeamBanner] = useState(false);
  const [todaysOthers, setTodaysOthers] = useState<BirthdayProfile[]>([]);

  useEffect(() => {
    const today = localToday();
    const isSelfBirthday = !!selfBirthday && birthdayMatchesToday(selfBirthday);
    const others = birthdayProfiles.filter(
      (p) => p.user_id !== selfUserId && birthdayMatchesToday(p.birthday),
    );

    if (isSelfBirthday) {
      const dismissedOn = window.localStorage.getItem(SELF_DISMISS_KEY);
      if (dismissedOn !== today.iso) setShowSelfModal(true);
    } else if (others.length > 0) {
      const dismissedOn = window.localStorage.getItem(TEAM_DISMISS_KEY);
      if (dismissedOn !== today.iso) {
        setTodaysOthers(others);
        setShowTeamBanner(true);
      }
    }
  }, [selfUserId, selfBirthday, birthdayProfiles]);

  function dismissSelf() {
    window.localStorage.setItem(SELF_DISMISS_KEY, localToday().iso);
    setShowSelfModal(false);
  }

  function dismissTeam() {
    window.localStorage.setItem(TEAM_DISMISS_KEY, localToday().iso);
    setShowTeamBanner(false);
  }

  if (showSelfModal) {
    return <SelfBirthdayModal onClose={dismissSelf} />;
  }

  if (showTeamBanner && todaysOthers.length > 0) {
    return <TeamBirthdayBanner others={todaysOthers} onDismiss={dismissTeam} />;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Self-birthday celebratory modal
// ─────────────────────────────────────────────────────────────────────────

function SelfBirthdayModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-aegis-navy/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="birthday-self-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Confetti backdrop — pure CSS, no images. */}
        <div className="relative h-40 overflow-hidden bg-gradient-to-br from-aegis-orange via-aegis-gold to-aegis-blue">
          <Confetti />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-7xl drop-shadow-lg" role="img" aria-label="Birthday cake">
              🎂
            </span>
          </div>
        </div>
        <div className="px-6 py-6 text-center">
          <h2
            id="birthday-self-title"
            className="text-2xl font-semibold tracking-tight text-aegis-navy"
          >
            Happy birthday!
          </h2>
          <p className="mt-2 text-sm text-aegis-gray-500">
            From everyone at Aegis — wishing you a fantastic year ahead.
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-aegis-gray-300">
            🎉 🎈 🎁
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-aegis-orange px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
          >
            Thank you
          </button>
        </div>
      </div>
    </div>
  );
}

function Confetti() {
  // 30 little squares scattered across the header. Positions/colours are
  // picked at module-eval so each render is identical (avoids hydration
  // mismatches if the parent ever moves to SSR).
  const pieces = Array.from({ length: 30 }, (_, i) => {
    const left = (i * 37) % 100;
    const top = (i * 53) % 80;
    const rot = ((i * 73) % 90) - 45;
    const palette = ['#fff', '#fff7d6', '#ffd6a5', '#a0d8ff', '#ffd1f0'];
    const bg = palette[i % palette.length];
    const size = 6 + ((i * 3) % 6);
    return { left, top, rot, bg, size, key: i };
  });
  return (
    <div className="pointer-events-none absolute inset-0">
      {pieces.map((p) => (
        <span
          key={p.key}
          aria-hidden
          className="absolute rounded-sm opacity-80"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            backgroundColor: p.bg,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Team birthday banner
// ─────────────────────────────────────────────────────────────────────────

function TeamBirthdayBanner({
  others,
  onDismiss,
}: {
  others: BirthdayProfile[];
  onDismiss: () => void;
}) {
  const names = others.map(profileLabel);
  const intro =
    names.length === 1
      ? `Today is ${names[0]}'s birthday`
      : names.length === 2
        ? `Today is ${names[0]} and ${names[1]}'s birthday`
        : `Today is ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}'s birthday`;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-aegis-orange/30 bg-aegis-orange-50 px-4 py-3 shadow-sm">
      <span
        className="text-2xl"
        role="img"
        aria-label="Party popper"
      >
        🎉
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-aegis-orange-600">{intro}!</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {others.map((p) => (
            <span
              key={p.user_id}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-aegis-navy ring-1 ring-aegis-orange/20"
            >
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatar_url}
                  alt=""
                  className="h-4 w-4 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-aegis-blue-50 text-[9px] font-semibold text-aegis-navy">
                  {profileInitial(p)}
                </span>
              )}
              {profileLabel(p)}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-aegis-gray-500">
          Drop them a wish in the team chat 🎂
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-aegis-orange-600/70 hover:bg-white hover:text-aegis-orange-600"
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
    </div>
  );
}
