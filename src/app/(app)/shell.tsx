'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import SidebarNav from './sidebar-nav';
import SignOutButton from './sign-out-button';
import OnboardingDialog from './onboarding-dialog';
import ProfileDialog from './profile-dialog';
import BirthdayGreeter, { type BirthdayProfile } from './birthday-greeter';
import { displayEmail, displayName as formatName } from '@/lib/display-format';

const STORAGE_KEY = 'aegis-sidebar-collapsed';

import type { UserRole } from '@/lib/types';

export default function Shell({
  userId,
  userEmail,
  displayName,
  avatarUrl,
  birthday,
  birthdayProfiles,
  role,
  children,
}: {
  userId: string;
  userEmail: string;
  displayName: string;
  avatarUrl: string | null;
  birthday: string | null;
  birthdayProfiles: BirthdayProfile[];
  role: UserRole;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const pathname = usePathname();
  const needsOnboarding = !displayName;
  const niceDisplayName = formatName(displayName);
  const niceEmail = displayEmail(userEmail);
  const friendlyName = niceDisplayName || niceEmail;
  const initial = (friendlyName || '?').charAt(0).toUpperCase();

  // Restore desktop collapse preference
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  // Persist desktop collapse preference
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while mobile drawer is open + ESC to close
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-aegis-gray">
      {/* ─── Mobile top bar ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-aegis-gray-100 bg-white/90 px-4 backdrop-blur-sm lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-aegis-gray hover:bg-aegis-gray-50"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        <Image
          src="/aegis_logo.png"
          alt="Aegis Communication"
          width={400}
          height={140}
          priority
          className="h-7 w-auto"
        />
      </header>

      {/* ─── Mobile backdrop ────────────────────────────────────── */}
      <div
        aria-hidden
        onClick={() => setMobileOpen(false)}
        className={[
          'fixed inset-0 z-40 bg-aegis-navy/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />

      {/* ─── Sidebar ────────────────────────────────────────────── */}
      <aside
        aria-label="Primary navigation"
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden bg-gradient-to-b from-aegis-navy to-aegis-navy-800 text-white shadow-xl transition-[width,transform] duration-200 ease-out lg:shadow-none',
          // mobile slide-in
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // desktop always visible; width depends on collapsed
          collapsed ? 'lg:w-16 lg:translate-x-0' : 'lg:w-64 lg:translate-x-0',
        ].join(' ')}
      >
        {/* Atmospheric glow */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full bg-aegis-blue/20 blur-3xl"
        />
        {/* Subtle dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
        {/* Right edge separator */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/5"
        />

        {/* ── Logo + mobile close ── */}
        <div
          className={[
            'relative z-10 flex items-center justify-between gap-2',
            collapsed ? 'px-3 pt-6 pb-6' : 'px-6 pt-7 pb-8',
          ].join(' ')}
        >
          {collapsed ? (
            <span
              aria-label="Aegis"
              title="Aegis Communication"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-base font-semibold tracking-tight text-white"
            >
              A
            </span>
          ) : (
            <Image
              src="/aegis_logo.png"
              alt="Aegis Communication"
              width={400}
              height={140}
              priority
              className="h-11 w-auto brightness-0 invert"
            />
          )}
          {/* Mobile close button — only on small screens */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
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

        {/* ── Nav ── */}
        <div className="aegis-scroll relative z-10 flex-1 overflow-y-auto px-3 pb-4">
          <SidebarNav collapsed={collapsed} role={role} />
        </div>

        {/* ── Desktop collapse toggle ── */}
        <div className="relative z-10 hidden border-t border-white/10 px-3 py-2 lg:block">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={[
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-aegis-blue-100/60 transition-colors hover:bg-white/5 hover:text-white',
              collapsed ? 'justify-center' : '',
            ].join(' ')}
          >
            <svg
              className={[
                'h-4 w-4 transition-transform duration-200',
                collapsed ? 'rotate-180' : '',
              ].join(' ')}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M11 17l-5-5 5-5" />
              <path d="M18 17l-5-5 5-5" />
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        {/* ── User card ── */}
        <div
          className={[
            'relative z-10 mx-3 mb-4 rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-sm',
            collapsed ? 'p-2' : 'p-2',
          ].join(' ')}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title={friendlyName}
                className="relative rounded-full ring-2 ring-transparent transition-shadow hover:ring-aegis-blue/40"
              >
                <UserAvatar size={36} avatarUrl={avatarUrl} initial={initial} />
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-aegis-navy bg-emerald-400"
                />
              </button>
              <SignOutButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="Edit profile"
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/5"
              >
                <span className="relative shrink-0">
                  <UserAvatar size={36} avatarUrl={avatarUrl} initial={initial} />
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-aegis-navy bg-emerald-400"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-white">
                    {friendlyName}
                  </span>
                  <span className="block truncate text-[10px] tracking-wide text-aegis-blue-100/50">
                    {displayName ? niceEmail : 'Signed in'}
                  </span>
                </span>
              </button>
              <SignOutButton />
            </div>
          )}
        </div>
      </aside>

      {/* Profile + first-time onboarding */}
      <ProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        userId={userId}
        email={userEmail}
        displayName={displayName}
        avatarUrl={avatarUrl}
        birthday={birthday}
      />
      {needsOnboarding && <OnboardingDialog email={userEmail} />}

      {/* ─── Main ───────────────────────────────────────────────── */}
      <main
        className={[
          'transition-[padding] duration-200 ease-out',
          collapsed ? 'lg:pl-16' : 'lg:pl-64',
        ].join(' ')}
      >
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <BirthdayGreeter
            selfUserId={userId}
            selfBirthday={birthday}
            birthdayProfiles={birthdayProfiles}
          />
          {children}
        </div>
      </main>
    </div>
  );
}

function UserAvatar({
  size, avatarUrl, initial,
}: { size: number; avatarUrl: string | null; initial: string }) {
  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-aegis-blue text-sm font-semibold text-aegis-navy"
      style={{ width: size, height: size }}
    >
      {initial}
    </span>
  );
}
