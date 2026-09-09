'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SearchBar from './SearchBar';
import PropertyCard from './PropertyCard';
import { api } from '@/lib/api-client';
import { nightsBetween, nightsLabel, prettyDate, PROPERTY_LABEL } from '@/lib/format';

const KINDS = ['HOTEL', 'RESORT', 'HOMESTAY', 'GUEST_HOUSE', 'LODGE', 'HERITAGE', 'HOSTEL'];
const PLACE_KINDS = [['', 'Everywhere'], ['CITY', 'Cities'], ['TOWN', 'Towns'], ['VILLAGE', 'Villages']];
const BANDS = [
  ['', 'Any price'], ['0-1000', 'Under ₹1,000'], ['1000-2500', '₹1,000 – ₹2,500'],
  ['2500-5000', '₹2,500 – ₹5,000'], ['5000-', 'Above ₹5,000'],
];
const SORTS = [
  ['recommended', 'Recommended'], ['price_low', 'Price: low to high'],
  ['price_high', 'Price: high to low'], ['rating', 'Guest rating'], ['stars', 'Star rating'],
];

const selectClass =
  'w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm outline-none focus:border-forest-600';

export default function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const [minPrice, maxPrice] = (params.get('band') ?? '').split('-');
    return {
      placeId: params.get('placeId') ?? undefined,
      districtId: params.get('districtId') ?? undefined,
      stateSlug: params.get('stateSlug') ?? undefined,
      q: params.get('q') ?? undefined,
      checkIn: params.get('checkIn') ?? undefined,
      checkOut: params.get('checkOut') ?? undefined,
      guests: params.get('guests') ?? '2',
      rooms: params.get('rooms') ?? '1',
      kind: params.get('kind') ?? undefined,
      placeKind: params.get('placeKind') || undefined,
      minStars: params.get('minStars') || undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      sort: params.get('sort') ?? 'recommended',
    };
  }, [params]);

  const key = params.toString();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.properties({ ...query, page, limit: 12 }, controller.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setData(null);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page]);

  const patch = (changes) => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (!value) next.delete(name);
      else next.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }
    setPage(1);
    router.replace(`/search?${next}`, { scroll: false });
  };

  const selectedKinds = (query.kind ?? '').split(',').filter(Boolean);
  const toggleKind = (kind) => {
    const set = new Set(selectedKinds);
    if (set.has(kind)) set.delete(kind);
    else set.add(kind);
    patch({ kind: [...set] });
  };

  const label = params.get('label') ?? params.get('q') ?? 'India';
  const nights = nightsBetween(query.checkIn, query.checkOut);
  const stayQuery = new URLSearchParams({
    ...(query.checkIn ? { checkIn: query.checkIn, checkOut: query.checkOut } : {}),
    guests: query.guests,
    rooms: query.rooms,
  }).toString();

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <SearchBar
        initial={{
          label: params.get('label') ?? '',
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          guests: Number(query.guests),
          rooms: Number(query.rooms),
          selected:
            params.get('placeId') ? { type: 'place', id: Number(params.get('placeId')), label: params.get('label') }
            : params.get('districtId') ? { type: 'district', id: Number(params.get('districtId')), label: params.get('label') }
            : params.get('stateSlug') ? { type: 'state', slug: params.get('stateSlug'), label: params.get('label') }
            : null,
        }}
      />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Stays in {label}</h1>
          <p className="text-sm text-ink-500">
            {query.checkIn
              ? `${prettyDate(query.checkIn)} – ${prettyDate(query.checkOut)} · ${nightsLabel(nights)} · ${query.guests} guests, ${query.rooms} room${query.rooms === '1' ? '' : 's'}`
              : 'Pick dates to see live availability'}
            {data ? ` · ${data.total.toLocaleString('en-IN')} stays` : ''}
          </p>
        </div>
        <label className="grid gap-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">
          Sort
          <select value={query.sort} onChange={(e) => patch({ sort: e.target.value })} className={`${selectClass} min-w-48`}>
            {SORTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[250px_1fr] lg:items-start">
        <aside className="grid gap-5 rounded-2xl border border-sand-200 bg-white p-4 lg:sticky lg:top-20">
          <label className="grid gap-1.5">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">Settlement</span>
            <select value={query.placeKind ?? ''} onChange={(e) => patch({ placeKind: e.target.value })} className={selectClass}>
              {PLACE_KINDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>

          <label className="grid gap-1.5">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">Price per night</span>
            <select value={params.get('band') ?? ''} onChange={(e) => patch({ band: e.target.value })} className={selectClass}>
              {BANDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>

          <div className="grid gap-1.5">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">Type of stay</span>
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map((kind) => {
                const on = selectedKinds.includes(kind);
                return (
                  <button
                    key={kind} type="button" aria-pressed={on} onClick={() => toggleKind(kind)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on ? 'border-forest-700 bg-forest-700 text-white' : 'border-sand-300 bg-white text-ink-500 hover:border-forest-400'
                    }`}
                  >
                    {PROPERTY_LABEL[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-ink-400">Star rating</span>
            <div className="flex gap-1.5">
              {[3, 4, 5].map((stars) => {
                const on = Number(query.minStars) === stars;
                return (
                  <button
                    key={stars} type="button" aria-pressed={on}
                    onClick={() => patch({ minStars: on ? '' : stars })}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      on ? 'border-forest-700 bg-forest-700 text-white' : 'border-sand-300 bg-white text-ink-500 hover:border-forest-400'
                    }`}
                  >
                    {stars}★ &amp; up
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => patch({ kind: '', placeKind: '', band: '', minStars: '' })}
            className="rounded-lg border border-sand-300 px-3 py-2 text-sm font-semibold hover:border-forest-600"
          >
            Clear filters
          </button>
        </aside>

        <div>
          {error ? (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
          ) : null}

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
                  <div className="shimmer aspect-[16/10] w-full" />
                  <div className="grid gap-2 p-4">
                    <div className="shimmer h-4 w-3/4 rounded" />
                    <div className="shimmer h-3 w-1/2 rounded" />
                    <div className="shimmer h-3 w-2/3 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!loading && data && data.properties.length === 0 ? (
            <div className="rounded-2xl border border-sand-200 bg-white px-6 py-14 text-center">
              <h2 className="text-lg font-bold">No stays match those filters</h2>
              <p className="mt-1 text-ink-500">
                Try widening the price band, clearing the filters, or searching the whole district.
              </p>
            </div>
          ) : null}

          {!loading && data?.properties.length ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {data.properties.map((property, index) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    stayQuery={stayQuery}
                    priority={index < 3}
                  />
                ))}
              </div>

              {data.pages > 1 ? (
                <div className="mt-6 flex items-center justify-center gap-4">
                  <button
                    type="button" disabled={page <= 1}
                    onClick={() => { setPage(page - 1); window.scrollTo({ top: 0 }); }}
                    className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-ink-500">Page {data.page} of {data.pages}</span>
                  <button
                    type="button" disabled={page >= data.pages}
                    onClick={() => { setPage(page + 1); window.scrollTo({ top: 0 }); }}
                    className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
