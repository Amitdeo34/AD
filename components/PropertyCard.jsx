import Link from 'next/link';
import Photo from './Photo';
import { RatingBadge, Stars } from './Stars';
import { inr, nightsLabel, PLACE_LABEL, PROPERTY_LABEL } from '@/lib/format';

export default function PropertyCard({ property, stayQuery = '', priority = false }) {
  const stay = property.stay;
  return (
    <Link
      href={`/hotels/${property.slug}${stayQuery ? `?${stayQuery}` : ''}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-sand-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative">
        <Photo
          photo={property.photo}
          accent={property.accent}
          kind={property.kind}
          priority={priority}
          sizes="(max-width: 768px) 100vw, 320px"
          className="aspect-[16/10] w-full transition duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-ink-700">
          {PROPERTY_LABEL[property.kind]}
        </span>
        {stay && stay.available <= 3 ? (
          <span className="absolute right-3 top-3 rounded-md bg-rose-600 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-white">
            {stay.available} left
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug text-ink-900">{property.name}</h3>
          <RatingBadge rating={property.rating} />
        </div>

        <p className="text-sm text-ink-400">
          {property.place.name} · {PLACE_LABEL[property.place.kind]} in {property.district.name},{' '}
          {property.state.name}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Stars count={property.starRating} className="text-xs" />
          {property.amenities.slice(0, 2).map((amenity) => (
            <span key={amenity} className="rounded-full bg-sand-100 px-2 py-0.5 text-[0.7rem] text-ink-500">
              {amenity}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div>
            <div className="text-lg font-bold tracking-tight">
              {inr(stay?.pricePerNight ?? property.basePrice)}
            </div>
            <div className="text-xs text-ink-400">
              per night{stay?.roomName ? ` · ${stay.roomName}` : ''}
            </div>
          </div>
          {stay?.nights ? (
            <div className="text-right">
              <div className="text-xs text-ink-400">{nightsLabel(stay.nights)} incl. GST</div>
              <div className="font-semibold">{inr(stay.grandTotal)}</div>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
