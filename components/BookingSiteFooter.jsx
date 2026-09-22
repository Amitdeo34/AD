'use client';

import { usePathname } from 'next/navigation';

/**
 * The booking site's footer. It steps aside on `/pmo`, which is a separate
 * product sharing this deployment and carrying its own chrome.
 */
export default function BookingSiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith('/pmo')) return null;

  return (
    <footer className="safe-bottom border-t border-sand-200 bg-white/60 py-6 text-sm text-ink-400">
      <div className="mx-auto max-w-6xl px-4">
        <p className="mb-1 text-ink-500">
          Easy Hotel Booking lists stays in all 36 states and union territories of India —
          capitals, district towns and villages alike.
        </p>
        <p>
          Listings, tariffs, photographs and the sample review history in this build are
          demonstration data. Location data covers every state, union territory and district.
        </p>
      </div>
    </footer>
  );
}
