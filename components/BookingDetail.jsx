'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Photo from './Photo';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';
import { inr, nightsLabel, prettyDate, PAYMENT_LABEL, STATUS_LABEL } from '@/lib/format';

const STATUS_STYLE = {
  CONFIRMED: 'bg-forest-100 text-forest-800',
  PENDING_PAYMENT: 'bg-saffron-100 text-saffron-700',
  CANCELLED: 'bg-rose-50 text-rose-800',
};

export default function BookingDetail({ reference }) {
  const params = useSearchParams();
  const { user } = useAuth();
  const email = params.get('email') ?? undefined;
  const justBooked = params.get('justBooked') === '1';

  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refundDue, setRefundDue] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { booking } = await api.booking(reference, email);
      setBooking(booking);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [reference, email]);

  useEffect(() => { load(); }, [load]);

  const cancel = async () => {
    if (!window.confirm('Cancel this booking? Anything already paid is refunded by the property.')) return;
    setBusy(true);
    try {
      const result = await api.cancelBooking(reference, email ?? booking.email);
      setBooking(result.booking);
      setRefundDue(result.refundDue);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="mx-auto max-w-4xl px-4 py-10 text-ink-400">Loading your booking…</div>;

  if (error && !booking) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{error.message}</p>
        {error.status === 403 ? (
          <p className="mt-2 text-ink-500">
            Add the email the booking was made with to the link, or sign in to the account that made it.
          </p>
        ) : null}
        <Link href="/trips" className="mt-4 inline-block rounded-lg border border-sand-300 bg-white px-4 py-2 font-semibold">
          Find a booking
        </Link>
      </div>
    );
  }

  const b = booking;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {justBooked ? (
        <p className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-forest-800">
          <b>Booking {b.status === 'CONFIRMED' ? 'confirmed' : 'received'}.</b>{' '}
          {b.paymentStatus === 'VERIFYING'
            ? 'We have your payment reference and are matching it against the bank statement. Your rooms are held meanwhile.'
            : 'Show the reference below at check-in.'}
        </p>
      ) : null}
      {refundDue ? (
        <p className="mb-4 rounded-xl bg-forest-50 px-4 py-3 text-forest-800">
          Cancelled. A refund of {inr(refundDue.amount)} is due from the property against UPI
          reference {refundDue.payments.filter(Boolean).join(', ') || 'your payment'}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{error.message}</p>
      ) : null}

      <article className="overflow-hidden rounded-2xl border border-sand-200 bg-white">
        <div className="grid md:grid-cols-[1fr_280px]">
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[b.status]}`}>
                {STATUS_LABEL[b.status]}
              </span>
              <span className="rounded-full bg-sand-100 px-3 py-1 text-xs font-semibold text-ink-500">
                {PAYMENT_LABEL[b.paymentStatus]}
              </span>
            </div>

            <div className="mt-3 flex gap-3">
              <Photo
                photo={b.property?.photo}
                accent={b.property?.accent}
                kind={b.property?.kind}
                sizes="96px"
                className="size-20 shrink-0 rounded-xl"
              />
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight">{b.property?.name}</h1>
                <p className="text-ink-500">
                  {b.location?.place} · {b.location?.district}, {b.location?.state}
                </p>
                <p className="text-sm text-ink-400">{b.property?.address}</p>
                <p className="text-sm text-ink-400">{b.property?.phone}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Check in', prettyDate(b.checkIn)],
                ['Check out', prettyDate(b.checkOut)],
                ['Length of stay', nightsLabel(b.nights)],
                ['Rooms · guests', `${b.rooms} · ${b.guests}`],
                ['Room type', b.room?.name],
                ['Booked for', b.guestName],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-400">{label}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {b.specialRequests ? (
              <p className="mt-4 text-sm text-ink-500">
                <b>Your note:</b> {b.specialRequests}
              </p>
            ) : null}

            {b.payments?.length ? (
              <div className="mt-5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink-400">Payments</h2>
                <ul className="mt-1.5 grid gap-1 text-sm">
                  {b.payments.map((payment) => (
                    <li key={payment.id} className="flex flex-wrap justify-between gap-2">
                      <span>
                        {payment.method} {payment.utr ? <span className="font-mono text-ink-500">· {payment.utr}</span> : null}
                      </span>
                      <span className="font-semibold">{inr(payment.amount)} · {payment.status.toLowerCase().replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="border-t border-dashed border-sand-300 p-5 md:border-l md:border-t-0">
            <p className="text-xs text-ink-400">Booking reference</p>
            <p className="mb-4 text-2xl font-bold tracking-wider">{b.reference}</p>

            <div className="flex justify-between gap-3 py-1 text-sm">
              <span className="text-ink-500">Rooms</span><span>{inr(b.roomTotal)}</span>
            </div>
            <div className="flex justify-between gap-3 py-1 text-sm">
              <span className="text-ink-500">GST</span><span>{inr(b.taxTotal)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-sand-200 pt-3 font-bold">
              <span>Total</span><span>{inr(b.grandTotal)}</span>
            </div>
            {b.paymentStatus === 'PAY_AT_HOTEL' ? (
              <p className="mt-2 text-xs text-ink-400">Payable at the property on arrival.</p>
            ) : null}

            <div className="mt-5 grid gap-2">
              {b.property ? (
                <Link
                  href={`/hotels/${b.property.slug}`}
                  className="rounded-lg border border-sand-300 bg-white px-4 py-2.5 text-center font-semibold hover:border-forest-600"
                >
                  View the property
                </Link>
              ) : null}
              {b.status !== 'CANCELLED' ? (
                <button
                  type="button" onClick={cancel} disabled={busy}
                  className="rounded-lg border border-rose-200 bg-white px-4 py-2.5 font-semibold text-rose-700 hover:border-rose-400 disabled:opacity-50"
                >
                  {busy ? 'Cancelling…' : 'Cancel this booking'}
                </button>
              ) : (
                <p className="text-xs text-ink-400">
                  Cancelled on {new Date(b.cancelledAt).toLocaleDateString('en-IN')}.
                </p>
              )}
            </div>
          </div>
        </div>
      </article>

      {!user ? (
        <p className="mt-4 text-sm text-ink-500">
          <Link href="/account" className="font-semibold underline">Create an account</Link> with {b.email} to
          keep this booking in your trips.
        </p>
      ) : null}
    </div>
  );
}
