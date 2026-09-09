'use client';

import { useRouter } from 'next/navigation';
import { inr, nightsLabel } from '@/lib/format';

/** The bookable rooms, priced for the stay the guest asked about. */
export default function RoomList({ slug, roomTypes, checkIn, checkOut, rooms, guests }) {
  const router = useRouter();

  const book = (room) => {
    const params = new URLSearchParams({
      slug,
      roomTypeId: String(room.id),
      rooms: String(rooms),
      guests: String(guests),
      ...(checkIn ? { checkIn, checkOut } : {}),
    });
    router.push(`/checkout?${params}`);
  };

  return (
    <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
      {roomTypes.map((room) => (
        <li key={room.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h3 className="font-semibold">{room.name}</h3>
            <p className="mt-0.5 text-sm text-ink-500">{room.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs text-ink-500">{room.bed}</span>
              <span className="rounded-full bg-sand-100 px-2 py-0.5 text-xs text-ink-500">
                Sleeps {room.maxGuests}
              </span>
              {room.amenities.slice(0, 3).map((amenity) => (
                <span key={amenity} className="rounded-full bg-sand-100 px-2 py-0.5 text-xs text-ink-500">
                  {amenity}
                </span>
              ))}
            </div>
            {checkIn ? (
              <p className={`mt-2 text-xs font-semibold ${
                room.soldOut ? 'text-rose-700' : room.available <= 3 ? 'text-saffron-700' : 'text-forest-600'
              }`}>
                {room.soldOut
                  ? 'Not available for these dates'
                  : room.available <= 3
                    ? `Only ${room.available} left for these dates`
                    : `${room.available} rooms available`}
              </p>
            ) : null}
          </div>

          <div className="grid justify-items-stretch gap-1.5 sm:w-52 sm:justify-items-end">
            <div className="sm:text-right">
              <span className="text-lg font-bold tracking-tight">{inr(room.price)}</span>
              <span className="block text-xs text-ink-400">per room, per night</span>
            </div>
            {room.quote ? (
              <p className="text-xs text-ink-400 sm:text-right">
                {inr(room.quote.grandTotal)} for {nightsLabel(room.quote.nights)}
                {rooms > 1 ? ` × ${rooms} rooms` : ''}, incl. {Math.round(room.quote.gstRate * 100)}% GST
              </p>
            ) : null}
            <button
              type="button"
              disabled={room.soldOut}
              onClick={() => book(room)}
              className="rounded-lg bg-forest-700 px-5 py-2.5 font-semibold text-white transition hover:bg-forest-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {room.soldOut ? 'Sold out' : 'Select room'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
