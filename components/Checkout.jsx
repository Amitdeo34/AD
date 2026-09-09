'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import UpiPayment from './UpiPayment';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';
import { inr, nightsLabel, prettyDate } from '@/lib/format';

const inputClass =
  'w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 outline-none focus:border-forest-600 focus:ring-2 focus:ring-forest-200';

export default function Checkout() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const slug = params.get('slug');
  const roomTypeId = Number(params.get('roomTypeId'));
  const rooms = Number(params.get('rooms') ?? 1);
  const guests = Number(params.get('guests') ?? 2);
  const checkIn = params.get('checkIn');
  const checkOut = params.get('checkOut');

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [form, setForm] = useState({ guestName: '', email: '', phone: '', specialRequests: '' });
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roomTypeId || !checkIn || !checkOut) return;
    api.quote({ roomTypeId, rooms, guests, checkIn, checkOut })
      .then(setQuote)
      .catch((err) => setQuoteError(err.message));
  }, [roomTypeId, rooms, guests, checkIn, checkOut]);

  useEffect(() => {
    if (user) {
      setForm((f) => ({
        ...f,
        guestName: f.guestName || user.name,
        email: f.email || user.email,
        phone: f.phone || user.phone,
      }));
    }
  }, [user]);

  if (!slug || !roomTypeId || !checkIn || !checkOut) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="rounded-xl bg-saffron-100 px-4 py-3 text-saffron-700">
          That checkout link is incomplete. <Link href="/" className="font-semibold underline">Start a new search</Link>.
        </p>
      </div>
    );
  }

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const hold = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.book({
        roomTypeId, rooms, guests, checkIn, checkOut,
        guestName: form.guestName,
        email: form.email,
        phone: form.phone,
        specialRequests: form.specialRequests || undefined,
      });
      setBooking(result.booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const done = (reference) =>
    router.push(`/bookings/${reference}?email=${encodeURIComponent(form.email)}&justBooked=1`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <Link href={`/hotels/${slug}`} className="hover:underline">Property</Link>{' '}
        <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">{booking ? 'Payment' : 'Guest details'}</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight">{booking ? 'Pay for your stay' : 'Guest details'}</h1>

      {quoteError ? (
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{quoteError}</p>
      ) : null}
      {quote && !quote.canBook ? (
        <p className="mt-4 rounded-xl bg-saffron-100 px-4 py-3 text-sm text-saffron-700">
          Those dates just sold out for this room{quote.available ? ` — only ${quote.available} left` : ''}.{' '}
          <Link href={`/hotels/${slug}?checkIn=${checkIn}&checkOut=${checkOut}`} className="font-semibold underline">
            Pick another room
          </Link>.
        </p>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        <div>
          {!booking ? (
            <form onSubmit={hold} className="grid gap-4 rounded-2xl border border-sand-200 bg-white p-5">
              {error ? (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
              ) : null}
              {!user ? (
                <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-800">
                  Booking as a guest. <Link href="/account" className="font-semibold underline">Sign in</Link> to
                  keep every trip in one place — bookings made with the same email are linked when you register.
                </p>
              ) : null}

              <label className="grid gap-1 text-sm font-semibold">
                Full name
                <input value={form.guestName} onChange={set('guestName')} required minLength={2} maxLength={80}
                       autoComplete="name" className={`${inputClass} font-normal`} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Email
                <input type="email" value={form.email} onChange={set('email')} required
                       autoComplete="email" className={`${inputClass} font-normal`} />
                <span className="text-xs font-normal text-ink-400">
                  Your booking reference and receipt go here.
                </span>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Mobile number
                <input type="tel" value={form.phone} onChange={set('phone')} required
                       placeholder="+91 98765 43210" autoComplete="tel" className={`${inputClass} font-normal`} />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Anything the property should know (optional)
                <textarea value={form.specialRequests} onChange={set('specialRequests')} maxLength={500} rows={3}
                          className={`${inputClass} font-normal`} />
              </label>

              <button
                type="submit"
                disabled={busy || !quote || !quote.canBook}
                className="rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white transition hover:bg-forest-600 disabled:opacity-50"
              >
                {busy ? 'Holding your room…' : 'Hold my room and continue to payment'}
              </button>
              <p className="text-xs text-ink-400">
                Your rooms are held as soon as you continue. Nothing is charged until you pay.
              </p>
            </form>
          ) : (
            <UpiPayment booking={booking} email={form.email} onDone={done} />
          )}
        </div>

        <aside className="rounded-2xl border border-sand-200 bg-white p-5 lg:sticky lg:top-20">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Your stay</h2>
          {!quote ? (
            <div className="grid gap-2">
              <div className="shimmer h-4 w-2/3 rounded" />
              <div className="shimmer h-3 w-1/2 rounded" />
              <div className="shimmer h-3 w-3/4 rounded" />
            </div>
          ) : (
            <>
              <p className="font-semibold">{quote.property.name}</p>
              <p className="mb-3 text-sm text-ink-400">
                {quote.room.name} · sleeps {quote.room.maxGuests} per room
              </p>
              {[
                ['Check in', prettyDate(quote.checkIn)],
                ['Check out', prettyDate(quote.checkOut)],
                ['Guests', `${quote.guests} in ${quote.rooms} room${quote.rooms === 1 ? '' : 's'}`],
                [`${inr(quote.pricePerNight)} × ${nightsLabel(quote.nights)}${quote.rooms > 1 ? ` × ${quote.rooms} rooms` : ''}`, inr(quote.roomTotal)],
                [`GST at ${Math.round(quote.gstRate * 100)}%`, inr(quote.taxTotal)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1 text-sm">
                  <span className="text-ink-500">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between gap-3 border-t border-sand-200 pt-3 text-lg font-bold">
                <span>Total</span>
                <span>{inr(quote.grandTotal)}</span>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
