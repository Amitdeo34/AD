import Link from 'next/link';
import { catalogue } from '@/lib/catalogue';

export const metadata = {
  title: 'Browse stays by state',
  description: 'Every state and union territory of India, with districts, towns and villages you can book in.',
};

const REGION_ORDER = ['North', 'West', 'Central', 'East', 'North East', 'South', 'Islands'];

export default function StatesPage() {
  const c = catalogue();
  const rows = c.states.map((state) => {
    const districts = state.districtIds.map((id) => c.districtById.get(id));
    return {
      ...state,
      districtCount: districts.length,
      placeCount: districts.reduce((n, d) => n + d.placeIds.length, 0),
    };
  });

  const byRegion = new Map();
  for (const state of rows) {
    if (!byRegion.has(state.region)) byRegion.set(state.region, []);
    byRegion.get(state.region).push(state);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">States &amp; union territories</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Browse by state</h1>
      <p className="mt-1 max-w-2xl text-ink-500">
        Pick a state to see its districts, then a district to see every city, town and village with
        stays — {c.stats.districts} districts and {c.stats.places.toLocaleString('en-IN')} settlements in all.
      </p>

      {REGION_ORDER.filter((region) => byRegion.has(region)).map((region) => (
        <section key={region} className="mt-7">
          <h2 className="mb-3 text-lg font-bold tracking-tight">{region} India</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {byRegion.get(region).map((state) => (
              <Link
                key={state.id}
                href={`/states/${state.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white px-4 py-3 transition hover:border-forest-600 hover:bg-forest-50"
              >
                <span className="font-medium">
                  {state.name}
                  {state.kind === 'UT' ? <span className="text-ink-400"> · UT</span> : null}
                </span>
                <span className="shrink-0 text-xs text-ink-400">{state.districtCount} districts</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
