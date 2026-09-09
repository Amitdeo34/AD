'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const ICONS = {
  search: <path {...stroke} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" />,
  map: <path {...stroke} d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Zm0 0v15m6-12v15" />,
  ticket: <path {...stroke} d="M3 9V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V15a3 3 0 0 0 0-6Zm11-4v14" />,
  user: <path {...stroke} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0" />,
};

export default function TabBar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const tabs = [
    { href: '/', label: 'Search', icon: 'search', exact: true },
    { href: '/states', label: 'States', icon: 'map' },
    { href: '/trips', label: 'Trips', icon: 'ticket' },
    { href: '/account', label: user ? 'Account' : 'Sign in', icon: 'user' },
  ];

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t border-sand-200 bg-white md:hidden">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold ${
              active ? 'text-forest-700' : 'text-ink-400'
            }`}
          >
            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
              {ICONS[tab.icon]}
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
