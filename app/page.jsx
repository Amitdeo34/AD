import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import Photo from '@/components/Photo';
import { catalogue } from '@/lib/catalogue';
import { photosFor } from '@/lib/photos';
import { defaultStay, inr, PLACE_LABEL } from '@/lib/format';

const PICKS = ['Manali', 'Gokarna', 'Munnar', 'Jaisalmer', 'Mawlynnong', 'Hampi', 'Chitkul', 'Ziro', 'Khajuraho', 'Tarkarli', 'Spangmik', 'Swaraj Dweep'];

/** Featured destinations, read straight from the catalogue at render time. */
function featured() {
  const c = catalogue();
  return PICKS.map((name) => c.places.find((p) => p.name === name))
    .filter(Boolean)
    .map((place) => ({
      id: place.id,
      name: place.name,
      kind: place.kind,
      knownFor: place.knownFor,
      district: c.districtById.get(place.districtId).name,
      state: c.stateById.get(place.stateId).name,
      properties: place.propertyIds.length,
      fromPrice: Math.min(...place.propertyIds.map((id) => c.propertyById.get(id).basePrice)),
      photo: photosFor(`place-${place.slug}`, 'HOTEL')[0],
    }));
}

export default function HomePage() {
  const stats = catalogue().stats;
  const places = featured();
  const stay = defaultStay();
  const stayQuery = `checkIn=${stay.checkIn}&checkOut=${stay.checkOut}&guests=2&rooms=1`;

  const figures = [
    ['states & UTs', stats.states],
    ['districts', stats.districts],
    ['villages', stats.villages],
    ['towns', stats.towns],
    ['cities', stats.cities],
    ['stays', stats.properties],
  ];

  return (
    <>
      <section className="bg-gradient-to-br from-forest-700 via-forest-800 to-forest-900 py-8 text-white md:py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            Every corner of India has a place to stay
          </h1>
          <p className="mt-3 max-w-xl text-white/80 md:text-lg">
            Hotels, homestays, resorts and guest houses — from state capitals and district towns
            down to villages at the end of the road.
          </p>

          <div className="mt-6">
            <SearchBar />
          </div>

          <dl className="mt-7 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {figures.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/10 px-3 py-2.5">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="block text-xl font-bold tracking-tight">
                    {value.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[0.7rem] text-white/70">{label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <section className="py-8">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold tracking-tight md:text-2xl">Where people are going</h2>
            <Link href="/states" className="text-sm font-semibold text-forest-700 underline">
              Browse every state →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {places.map((place, index) => (
              <Link
                key={place.id}
                href={`/search?placeId=${place.id}&label=${encodeURIComponent(`${place.name}, ${place.district}, ${place.state}`)}&${stayQuery}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative">
                  <Photo
                    photo={place.photo}
                    accent={['teal', 'saffron', 'sea', 'olive', 'plum', 'clay'][index % 6]}
                    kind={place.kind === 'VILLAGE' ? 'HOMESTAY' : 'HOTEL'}
                    priority={index < 3}
                    sizes="(max-width: 640px) 100vw, 360px"
                    className="aspect-[16/10] w-full transition duration-300 group-hover:scale-[1.02]"
                  />
                  <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-ink-700">
                    {PLACE_LABEL[place.kind]}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h3 className="font-semibold">{place.name}</h3>
                  <p className="text-sm text-ink-400">{place.district}, {place.state}</p>
                  {place.knownFor ? (
                    <p className="text-sm text-ink-500">{place.knownFor}</p>
                  ) : null}
                  <div className="mt-auto flex items-end justify-between pt-3 text-sm">
                    <span className="text-ink-400">{place.properties} stays</span>
                    <span className="font-semibold">from {inr(place.fromPrice)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="pb-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight md:text-2xl">How it works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Search anywhere in India', 'Type a village, town, city, district or state. Every settlement in the catalogue is searchable, and results show live availability for your dates.'],
              ['See it before you book', 'Photographs of the property and rooms, the full amenity list, and reviews written by guests who actually stayed.'],
              ['Pay by UPI, straight to the property', 'Scan the QR or open your usual UPI app. No card details, no wallet — or reserve now and settle at the property.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-sand-200 bg-white p-5">
                <h3 className="mb-1.5 font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-500">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
