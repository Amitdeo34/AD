'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';
import { inr, prettyDate } from '@/lib/format';

/**
 * The queue a staff account works through: each row is a UPI transfer a guest
 * says they made. Match the UTR against the bank statement, then accept — which
 * confirms the booking — or reject, which puts it back to unpaid.
 */
export default function AdminPayments() {
  const { user, ready } = useAuth();
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { payments } = await api.adminPayments();
      setPayments(payments);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (ready && user?.role === 'ADMIN') load();
  }, [ready, user, load]);

  if (!ready) return <div className="mx-auto max-w-4xl px-4 py-10 text-ink-400">Loading…</div>;

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Payment verification</h1>
        <p className="mt-2 text-ink-500">
          This queue is for staff accounts. <Link href="/account" className="font-semibold underline">Sign in</Link> with
          one to continue.
        </p>
      </div>
    );
  }

  const decide = async (payment, accept) => {
    setBusyId(payment.id);
    try {
      await api.verifyPayment(payment.id, { accept });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Payment verification</h1>
      <p className="mt-1 max-w-2xl text-ink-500">
        UPI transfers guests have reported. Check each reference against the bank statement before
        accepting — accepting confirms the booking.
      </p>

      {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-800">{error}</p> : null}
      {!payments ? <p className="mt-4 text-ink-400">Loading queue…</p> : null}

      {payments?.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-sand-200 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-bold">Nothing waiting</h2>
          <p className="mt-1 text-ink-500">Every reported payment has been dealt with.</p>
        </div>
      ) : null}

      <ul className="mt-5 grid gap-3">
        {payments?.map((payment) => (
          <li key={payment.id} className="rounded-2xl border border-sand-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{payment.booking?.property?.name}</p>
                <p className="text-sm text-ink-500">
                  {payment.booking?.guestName} · {payment.booking?.email} · {payment.booking?.phone}
                </p>
                <p className="text-sm text-ink-400">
                  {prettyDate(payment.booking?.checkIn)} → {prettyDate(payment.booking?.checkOut)} ·{' '}
                  {payment.booking?.rooms} room{payment.booking?.rooms === 1 ? '' : 's'}
                </p>
                <p className="mt-1.5 text-sm">
                  Reference <b>{payment.booking?.reference}</b> · UTR{' '}
                  <span className="font-mono">{payment.utr}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold">{inr(payment.amount)}</p>
                <p className="text-xs text-ink-400">reported {new Date(payment.reportedAt).toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button" disabled={busyId === payment.id} onClick={() => decide(payment, true)}
                className="rounded-lg bg-forest-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                {busyId === payment.id ? 'Working…' : 'Payment received — confirm booking'}
              </button>
              <button
                type="button" disabled={busyId === payment.id} onClick={() => decide(payment, false)}
                className="rounded-lg border border-rose-200 px-4 py-2 font-semibold text-rose-700 disabled:opacity-50"
              >
                Not in the statement
              </button>
              <Link
                href={`/bookings/${payment.booking?.reference}`}
                className="rounded-lg border border-sand-300 px-4 py-2 font-semibold"
              >
                Open booking
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
