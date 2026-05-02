'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@/lib/types';
import LinkPendingSpinner from '@/components/link-pending-spinner';
import GlobalSearch from './global-search';

type Item = { href: string; label: string; icon: React.ReactNode };
type Section = { caption: string; items: Item[] };

const ICON = {
  className: 'h-[18px] w-[18px] shrink-0',
  strokeWidth: 1.75,
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

const SECTIONS: Section[] = [
  {
    caption: 'Workspace',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg {...ICON}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        ),
      },
      {
        href: '/todos',
        label: 'My To-Do',
        icon: (
          <svg {...ICON}>
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        ),
      },
      {
        href: '/activity',
        label: 'Activity',
        icon: (
          <svg {...ICON}>
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        ),
      },
      {
        href: '/integrations',
        label: 'Integrations',
        icon: (
          <svg {...ICON}>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <path d="M10 7h11" />
            <path d="M3 17h11" />
          </svg>
        ),
      },
    ],
  },
  {
    caption: 'Records',
    items: [
      {
        href: '/clients',
        label: 'Clients',
        icon: (
          <svg {...ICON}>
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            <path d="M3 13h18" />
          </svg>
        ),
      },
      {
        href: '/analysts',
        label: 'Analysts & Funds',
        icon: (
          <svg {...ICON}>
            <path d="M3 17l6-6 4 4 8-8" />
            <path d="M14 7h7v7" />
          </svg>
        ),
      },
      {
        href: '/media',
        label: 'Media Contacts',
        icon: (
          <svg {...ICON}>
            <path d="M4 4h13a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4z" />
            <path d="M8 8h7M8 12h7M8 16h4" />
          </svg>
        ),
      },
    ],
  },
  {
    caption: 'Operations',
    items: [
      // The legacy /projects page is superseded by client_deliverables
      // (commitments) under engagements. Hidden from the nav; the route still
      // exists for any deep links until a future cleanup migration drops the
      // table and the page entirely.
      {
        href: '/meetings',
        label: 'Meeting Minutes',
        icon: (
          <svg {...ICON}>
            <path d="M21 12a8 8 0 1 1-3.4-6.55" />
            <path d="M21 4v5h-5" />
            <path d="M12 8v4l2.5 2" />
          </svg>
        ),
      },
      {
        href: '/events',
        label: 'Events',
        icon: (
          <svg {...ICON}>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
            <path d="M8 15l2.5 2.5L16 12" />
          </svg>
        ),
      },
      {
        href: '/media-interviews',
        label: 'Media Interviews',
        icon: (
          <svg {...ICON}>
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <path d="M12 18v3M8 21h8" />
          </svg>
        ),
      },
    ],
  },
];

const DIRECTOR_SECTION: Section = {
  caption: 'Leadership',
  items: [
    {
      href: '/director',
      label: 'Director Overview',
      icon: (
        <svg {...ICON}>
          <path d="M3 12l2-7h14l2 7" />
          <path d="M3 12v7h18v-7" />
          <path d="M9 19v-4M15 19v-4" />
        </svg>
      ),
    },
  ],
};

const ADMIN_SECTION: Section = {
  caption: 'Administration',
  items: [
    {
      href: '/admin/users',
      label: 'User Management',
      icon: (
        <svg {...ICON}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 11h6M19 8v6" />
        </svg>
      ),
    },
    {
      href: '/admin/deliverable-templates',
      label: 'Deliverable Templates',
      icon: (
        <svg {...ICON}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      ),
    },
    {
      href: '/admin/backup',
      label: 'Backup & Export',
      icon: (
        <svg {...ICON}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      ),
    },
  ],
};

export default function SidebarNav({
  collapsed = false,
  role,
  onNavigate,
}: {
  collapsed?: boolean;
  role: UserRole;
  // Fired after any nav action (including search submit) so the parent can
  // close a mobile drawer. No-op on desktop.
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections: Section[] = [...SECTIONS];
  if (role === 'director' || role === 'super_admin') sections.push(DIRECTOR_SECTION);
  if (role === 'super_admin') sections.push(ADMIN_SECTION);

  return (
    <nav className={collapsed ? 'space-y-3' : 'space-y-7'}>
      {!collapsed && (
        <div className="-mt-1">
          <GlobalSearch onSubmit={onNavigate} />
        </div>
      )}

      {sections.map((section) => (
        <div key={section.caption}>
          {!collapsed && (
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-aegis-blue-100/40">
              {section.caption}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <li key={item.href} className="relative">
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-aegis-orange"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={[
                      'aegis-press group flex items-center rounded-md text-sm transition-colors',
                      collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                      active
                        ? 'bg-aegis-navy-700/80 font-medium text-white'
                        : 'text-aegis-blue-100/70 hover:bg-aegis-navy-700/40 hover:text-white',
                    ].join(' ')}
                  >
                    <span
                      className={
                        active
                          ? 'text-aegis-blue'
                          : 'text-aegis-blue-100/50 transition-colors group-hover:text-white'
                      }
                    >
                      {item.icon}
                    </span>
                    {collapsed ? (
                      <span className="sr-only">{item.label}</span>
                    ) : (
                      <>
                        <span className="flex-1 truncate">{item.label}</span>
                        <LinkPendingSpinner
                          className={
                            active
                              ? 'text-white'
                              : 'text-aegis-blue-100/70 group-hover:text-white'
                          }
                        />
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
