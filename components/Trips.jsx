'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Photo from './Photo';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';
import { inr, prettyDate, todayIso, PAYMENT_LABEL, STATUS_LABEL } from '@/lib/format';

export default function Trips() {
  const { user, ready } = useAuth();
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">My trips</h1>
      {!ready ? <p className="mt-4 text-ink-400">Loading…</p> : null}
      {ready && user ? <SignedIn /> : null}
      {ready && !user ? <GuestLookup /> : null}
    </div>
  );
}

function SignedIn() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.myBookings().then((d) => setBookings(d.bookings)).catch((err) => setError(err.message));
  }, []);

  if (error) return <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{error}</p>;
  if (!bookings) return <p className="mt-4 text-ink-400">Loading your trips…</p>;

  const today = todayIso();
  const upcoming = bookings.filter((b) => b.status !== 'CANCELLED' && b.checkOut >= today);
  const past = bookings.filter((b) => b.status === 'CANCELLED' || b.checkOut < today);

  if (!bookings.length) {
    return (
      <div className="mt-6 rounded-2xl border border-sand-200 bg-white px-6 py-14 text-center">
        <h2 className="text-lg font-bold">No trips yet</h2>
        <p className="mt-1 text-ink-500">When you book a stay it shows up here.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-forest-700 px-5 py-2.5 font-semibold text-white">
          Find a stay
        </Link>
      </div>
    );
  }

  return (
    <>
      {upcoming.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Upcoming</h2>
          <TripList bookings={upcoming} />
        </section>
      ) : null}
      {past.length ? (
        <section className="mt-7">
          <h2 className="mb-3 text-lg font-bold tracking-tight">Past &amp; cancelled</h2>
          <TripList bookings={past} />
        </section>
      ) : null}
      <p className="mt-6 text-sm text-ink-500">
        Booked as a guest with a different email?{' '}
        <Link href="/account" className="font-semibold underline">Register with that email</Link> and those
        bookings move here automatically.
      </p>
    </>
  );
}

function TripList({ bookings }) {
  return (
    <ul className="divide-y divide-sand-200 overflow-hidden rounded-2xl border border-sand-200 bg-white">
      {bookings.map((b) => (
        <li key={b.reference}>
          <Link href={`/bookings/${b.reference}`} className="flex items-center gap-3 p-3 hover:bg-forest-50">
            <Photo
              photo={b.property?.photo} accent={b.property?.accent} kind={b.property?.kind}
              sizes="80px" className="size-16 shrink-0 rounded-xl"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{b.property?.name}</span>
              <span className="block truncate text-sm text-ink-400">
                {b.location?.place}, {b.location?.state} · {prettyDate(b.checkIn)} → {prettyDate(b.checkOut)}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-xs font-bold text-ink-700">{STATUS_LABEL[b.status]}</span>
              <span className="block text-xs text-ink-400">{inr(b.grandTotal)} · {PAYMENT_LABEL[b.paymentStatus]}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GuestLookup() {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const find = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ref = reference.trim().toUpperCase();
      await api.booking(ref, email.trim());
      router.push(`/bookings/${ref}?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 outline-none focus:border-forest-600';

  return (
    <>
      <p className="mt-2 max-w-xl text-ink-500">
        Signed in? Your trips appear here automatically. Otherwise look a booking up with its
        reference and the email it was made with.
      </p>
      <form onSubmit={find} className="mt-5 grid max-w-md gap-3 rounded-2xl border border-sand-200 bg-white p-5">
        {error ? <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        <label className="grid gap-1 text-sm font-semibold">
          Booking reference
          <input
            value={reference} onChange={(e) => setReference(e.target.value)} required maxLength={20}
            placeholder="EHB-XXXXXX" className={`${inputClass} font-normal uppercase`}
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email on the booking
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                 className={`${inputClass} font-normal`} />
        </label>
        <button type="submit" disabled={busy}
                className="rounded-lg bg-forest-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          {busy ? 'Looking…' : 'Find my booking'}
        </button>
        <Link href="/account" className="text-sm font-semibold text-forest-700 underline">
          Or sign in to see every trip
        </Link>
      </form>
    </>
  );
}
