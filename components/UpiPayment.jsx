'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { inr } from '@/lib/format';

/**
 * Direct UPI collection: scan the QR or open a UPI app, then report the UTR the
 * bank shows. Money moves straight to the property's account, so the booking is
 * confirmed once that reference is matched against the bank statement — which
 * is stated plainly rather than pretending the payment is instantly verified.
 */
export default function UpiPayment({ booking, email, onDone }) {
  const [config, setConfig] = useState(null);
  const [payment, setPayment] = useState(null);
  const [utr, setUtr] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    api.paymentConfig().then(setConfig).catch((err) => setError(err.message));
  }, []);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayment(await api.startUpi(booking.reference, email));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const submitUtr = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.submitUtr({ reference: booking.reference, email, utr });
      setSubmitted(true);
      onDone(booking.reference);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const payLater = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.payAtHotel(booking.reference, email);
      onDone(booking.reference);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 rounded-2xl border border-sand-200 bg-white p-5">
      <p className="rounded-lg bg-forest-50 px-3 py-2 text-sm text-forest-800">
        Rooms held under <b>{booking.reference}</b>. They stay reserved while you pay.
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight">Pay by UPI</h2>
        <span className="text-xl font-bold">{inr(booking.grandTotal)}</span>
      </div>

      {config && !config.configured ? (
        <p className="rounded-lg bg-saffron-100 px-3 py-2 text-sm text-saffron-700">
          UPI collection is not configured on this deployment yet. Set <code>EHB_UPI_VPA</code> to the
          UPI ID that should receive payments. You can still reserve now and pay at the property.
        </p>
      ) : null}

      {config?.configured && !payment ? (
        <button
          type="button" onClick={start} disabled={busy}
          className="rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white transition hover:bg-forest-600 disabled:opacity-50"
        >
          {busy ? 'Preparing…' : `Show UPI QR for ${inr(booking.grandTotal)}`}
        </button>
      ) : null}

      {payment ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          <div
            className="mx-auto w-fit rounded-xl border border-sand-200 bg-white p-2"
            /* The QR is generated on the server from the UPI intent URI. */
            dangerouslySetInnerHTML={{ __html: payment.qrSvg }}
          />
          <div className="grid gap-3">
            <div>
              <p className="text-sm text-ink-500">Paying</p>
              <p className="font-semibold">{payment.payee.name}</p>
              <p className="font-mono text-sm text-ink-700">{payment.payee.vpa}</p>
              <p className="mt-1 text-xs text-ink-400">
                Reference <b>{payment.reference}</b> is attached to the payment automatically.
              </p>
            </div>

            <div className="grid gap-1.5">
              <p className="text-sm font-semibold">Or open a UPI app</p>
              <div className="flex flex-wrap gap-2">
                {payment.apps.map((app) => (
                  <a
                    key={app.app} href={app.href}
                    className="rounded-lg border border-sand-300 px-3 py-1.5 text-sm font-medium hover:border-forest-600"
                  >
                    {app.app}
                  </a>
                ))}
              </div>
              <p className="text-xs text-ink-400">
                The app links open on a phone with that UPI app installed.
              </p>
            </div>
          </div>

          <form onSubmit={submitUtr} className="grid gap-2 sm:col-span-2">
            <label className="grid gap-1 text-sm font-semibold">
              UPI reference number (UTR)
              <input
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                required minLength={12} maxLength={22} inputMode="numeric"
                placeholder="12-digit reference from your banking app"
                className="w-full rounded-lg border border-sand-300 bg-sand-50 px-3 py-2.5 font-mono font-normal outline-none focus:border-forest-600"
              />
            </label>
            <button
              type="submit" disabled={busy || submitted}
              className="rounded-lg bg-forest-700 px-5 py-3 font-semibold text-white transition hover:bg-forest-600 disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'I have paid — submit reference'}
            </button>
            <p className="text-xs text-ink-400">
              A direct UPI transfer has no gateway to confirm it automatically, so your rooms stay
              held and the property matches this reference against its bank statement — usually
              within a few hours. You will not be asked to pay twice.
            </p>
          </form>
        </div>
      ) : null}

      <div className="border-t border-sand-200 pt-4">
        <button
          type="button" onClick={payLater} disabled={busy}
          className="w-full rounded-lg border border-sand-300 bg-white px-5 py-3 font-semibold transition hover:border-forest-600 disabled:opacity-50"
        >
          Reserve now, pay at the property
        </button>
        <p className="mt-1.5 text-xs text-ink-400">
          Confirms your booking straight away. Settle the bill at the property on arrival.
        </p>
      </div>
    </div>
  );
}
