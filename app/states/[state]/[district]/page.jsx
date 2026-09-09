import Link from 'next/link';
import { notFound } from 'next/navigation';
import { catalogue, stateBySlugOrCode, districtIn } from '@/lib/catalogue';
import { defaultStay, inr, PLACE_LABEL } from '@/lib/format';

export async function generateMetadata({ params }) {
  const { state: stateSlug, district: districtSlug } = await params;
  const state = stateBySlugOrCode(stateSlug);
  const district = state ? districtIn(state, districtSlug) : null;
  if (!district) return { title: 'District not found' };
  return {
    title: `Stays in ${district.name} district, ${state.name}`,
    description: `Hotels, homestays and guest houses in every city, town and village of ${district.name} district.`,
  };
}

const GROUPS = [
  ['CITY', 'Cities'],
  ['TOWN', 'Towns'],
  ['VILLAGE', 'Villages'],
];

export default async function DistrictPage({ params }) {
  const { state: stateSlug, district: districtSlug } = await params;
  const state = stateBySlugOrCode(stateSlug);
  const district = state ? districtIn(state, districtSlug) : null;
  if (!district) notFound();

  const c = catalogue();
  const places = district.placeIds.map((id) => {
    const place = c.placeById.get(id);
    return {
      ...place,
      propertyCount: place.propertyIds.length,
      fromPrice: place.propertyIds.length
        ? Math.min(...place.propertyIds.map((pid) => c.propertyById.get(pid).basePrice))
        : null,
    };
  });

  const stay = defaultStay();
  const stayQuery = `checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2&rooms=1`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <Link href="/states" className="hover:underline">States</Link> <span aria-hidden="true">›</span>{' '}
        <Link href={`/states/${state.slug}`} className="hover:underline">{state.name}</Link>{' '}
        <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">{district.name}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{district.name} district</h1>
          <p className="mt-1 text-ink-500">{state.name} · {places.length} settlements with stays</p>
        </div>
        <Link
          href={`/search?districtId=${district.id}&label=${encodeURIComponent(`${district.name}, ${state.name}`)}&${stayQuery}`}
          className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold hover:border-forest-600"
        >
          All stays in this district
        </Link>
      </div>

      {GROUPS.map(([kind, title]) => {
        const group = places.filter((p) => p.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind} className="mt-7">
            <h2 className="mb-3 text-lg font-bold tracking-tight">
              {title} <span className="text-sm font-normal text-ink-400">({group.length})</span>
            </h2>
            <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
              {group.map((place) => (
                <li key={place.id}>
                  <Link
                    href={`/search?placeId=${place.id}&label=${encodeURIComponent(`${place.name}, ${district.name}, ${state.name}`)}&${stayQuery}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-forest-50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{place.name}</span>
                      {place.isHq ? (
                        <span className="ml-2 rounded-full bg-forest-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-forest-800">
                          District HQ
                        </span>
                      ) : null}
                      {place.knownFor ? (
                        <span className="block truncate text-sm text-ink-400">{place.knownFor}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-right text-sm">
                      <span className="block text-ink-400">
                        {PLACE_LABEL[place.kind]} · {place.propertyCount} stays
                      </span>
                      {place.fromPrice ? (
                        <span className="font-semibold">from {inr(place.fromPrice)}</span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
