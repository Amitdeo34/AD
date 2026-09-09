'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const LINKS = [
  { href: '/states', label: 'Browse by state' },
  { href: '/trips', label: 'My trips' },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <header className="safe-top sticky top-0 z-40 bg-forest-700 text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-lg bg-saffron-500 text-base font-black text-forest-800"
          >
            E
          </span>
          <span className="leading-none">
            <span className="block text-[1.05rem] font-bold tracking-tight">Easy Hotel Booking</span>
            <span className="block text-[0.62rem] font-medium uppercase tracking-[0.14em] text-white/70">
              village to city, all India
            </span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname.startsWith(link.href) ? 'bg-white/20' : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {user?.role === 'ADMIN' ? (
            <Link href="/admin/payments" className="rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10">
              Payments
            </Link>
          ) : null}
          <Link
            href="/account"
            className="rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
          >
            {user ? user.name.split(' ')[0] : 'Sign in'}
          </Link>
        </nav>
      </div>
    </header>
  );
}
