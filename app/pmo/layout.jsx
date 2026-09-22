import Link from 'next/link';

export const metadata = {
  title: { default: 'PMO Reporting Engine', template: '%s · PMO Reporting Engine' },
  description:
    'Upload the DPR; generate the weekly exception report, area tracking, interim, monthly, quarterly, digital DPR and schedule update from one set of numbers.',
};

/**
 * The reporting engine has its own chrome: it is a working tool for a PMO,
 * not part of the booking site it shares a deployment with.
 */
export default function PmoLayout({ children }) {
  return (
    <div className="min-h-dvh bg-pmo-50">
      <header className="sticky top-0 z-30 border-b border-pmo-800 bg-pmo-700 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/pmo" className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-white/15 text-sm font-black">
              PMO
            </span>
            <span className="leading-none">
              <span className="block text-[1.02rem] font-bold tracking-tight">Reporting Engine</span>
              <span className="block text-[0.6rem] font-medium uppercase tracking-[0.14em] text-white/60">
                one upload, every report
              </span>
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/pmo" className="rounded-lg px-3 py-2 font-medium text-white/85 hover:bg-white/10">
              Projects
            </Link>
          </nav>
        </div>
      </header>
      <main className="pb-16">{children}</main>
    </div>
  );
}
