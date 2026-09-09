import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogue, stateBySlugOrCode } from '@/lib/catalogue';
import { defaultStay } from '@/lib/format';

export async function generateMetadata({ params }) {
  const { state: slug } = await params;
  const state = stateBySlugOrCode(slug);
  if (!state) return { title: 'State not found' };
  return {
    title: `Hotels and homestays in ${state.name}`,
    description: `Browse stays across every district of ${state.name} — cities, towns and villages.`,
  };
}

export default async function StatePage({ params }) {
  const { state: slug } = await params;
  const state = stateBySlugOrCode(slug);
  if (!state) notFound();

  const c = catalogue();
  const districts = state.districtIds
    .map((id) => c.districtById.get(id))
    .map((district) => {
      const places = district.placeIds.map((pid) => c.placeById.get(pid));
      return {
        ...district,
        placeCount: places.length,
        villageCount: places.filter((p) => p.kind === 'VILLAGE').length,
        propertyCount: places.reduce((n, p) => n + p.propertyIds.length, 0),
      };
    });

  const stay = defaultStay();
  const totals = districts.reduce(
    (acc, d) => ({ places: acc.places + d.placeCount, villages: acc.villages + d.villageCount }),
    { places: 0, villages: 0 },
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <Link href="/states" className="hover:underline">States</Link> <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">{state.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{state.name}</h1>
          <p className="mt-1 text-ink-500">
            {state.kind === 'UT' ? 'Union territory' : 'State'}
            {state.capital ? ` · capital ${state.capital}` : ''} · {districts.length} districts ·{' '}
            {totals.places.toLocaleString('en-IN')} settlements, {totals.villages} of them villages
          </p>
        </div>
        <Link
          href={`/search?stateSlug=${state.slug}&label=${encodeURIComponent(state.name)}&checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2&rooms=1`}
          className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold hover:border-forest-600"
        >
          All stays in {state.name}
        </Link>
      </div>

      <h2 className="mb-3 mt-7 text-lg font-bold tracking-tight">Districts</h2>
      <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
        {districts.map((district) => (
          <li key={district.id}>
            <Link
              href={`/states/${state.slug}/${district.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-forest-50"
            >
              <span>
                <span className="font-medium">{district.name}</span>
                <span className="text-sm text-ink-400">
                  {' '}· {district.placeCount} settlement{district.placeCount === 1 ? '' : 's'}
                  {district.villageCount ? `, ${district.villageCount} village${district.villageCount === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm text-ink-400">{district.propertyCount} stays →</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
