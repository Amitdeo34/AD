'use client';

import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api-client';
import { relativeDate } from '@/lib/format';

const TRIP_TYPES = ['Family holiday', 'Solo trip', 'Work travel', 'Couple’s getaway', 'Trip with friends', 'Pilgrimage'];

function Bar({ star, count, total }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-8 text-ink-500">{star} ★</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand-200">
        <span className="block h-full rounded-full bg-saffron-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-6 text-right text-ink-400">{count}</span>
    </div>
  );
}

export default function Reviews({ slug, initialReviews, rating, reviewCount, breakdown }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(initialReviews);
  const [summary, setSummary] = useState({ rating, reviewCount, breakdown });
  const [form, setForm] = useState({ rating: 5, title: '', body: '', tripType: TRIP_TYPES[0] });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const total = summary.breakdown.reduce((n, b) => n + b.count, 0);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.writeReview(slug, form);
      setReviews([result.review, ...reviews]);
      setSummary({ rating: result.rating, reviewCount: result.reviewCount, breakdown: result.breakdown });
      setForm({ rating: 5, title: '', body: '', tripType: TRIP_TYPES[0] });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="reviews" className="scroll-mt-20">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Guest reviews</h2>
          <p className="text-sm text-ink-500">
            {summary.rating.toFixed(1)} out of 5 · {summary.reviewCount.toLocaleString('en-IN')} reviews
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-sand-300 bg-white px-4 py-2 text-sm font-semibold hover:border-forest-600"
        >
          {open ? 'Close' : 'Write a review'}
        </button>
      </div>

      <div className="mb-5 grid gap-1.5 rounded-xl border border-sand-200 bg-white p-4 sm:max-w-sm">
        {summary.breakdown.map((row) => (
          <Bar key={row.star} star={row.star} count={row.count} total={total} />
        ))}
      </div>

      {open ? (
        user ? (
          <form onSubmit={submit} className="mb-6 grid gap-3 rounded-xl border border-sand-200 bg-white p-4">
            {error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
            ) : null}
            <p className="text-sm text-ink-500">
              Reviews can be left by guests with a confirmed stay at this property.
            </p>
            <label className="grid gap-1 text-sm font-semibold">
              Your rating
              <select
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 font-normal"
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{'★'.repeat(n)} — {n} out of 5</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Headline
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required minLength={3} maxLength={90}
                className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 font-normal"
                placeholder="Sum up your stay in a few words"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Your review
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                required minLength={10} maxLength={1500} rows={4}
                className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 font-normal"
                placeholder="What should the next guest know?"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Type of trip
              <select
                value={form.tripType}
                onChange={(e) => setForm({ ...form, tripType: e.target.value })}
                className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-2 font-normal"
              >
                {TRIP_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <button
              type="submit" disabled={busy}
              className="rounded-lg bg-forest-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Posting…' : 'Post review'}
            </button>
          </form>
        ) : (
          <p className="mb-6 rounded-xl border border-sand-200 bg-forest-50 p-4 text-sm text-forest-800">
            <a href="/account" className="font-semibold underline">Sign in</a> to review this property.
            Reviews are open to guests who have completed a booking here.
          </p>
        )
      ) : null}

      <ul className="grid gap-3">
        {reviews.map((review) => (
          <li key={review.id} className="rounded-xl border border-sand-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="grid size-9 place-items-center rounded-full bg-forest-100 text-sm font-bold text-forest-800"
                >
                  {review.name.slice(0, 1)}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{review.name}</span>
                  <span className="block text-xs text-ink-400">
                    {review.tripType ? `${review.tripType} · ` : ''}stayed {relativeDate(review.createdAt)}
                  </span>
                </span>
              </div>
              <span className="text-saffron-600" aria-label={`${review.rating} out of 5`}>
                {'★'.repeat(review.rating)}
                <span className="text-sand-300">{'★'.repeat(5 - review.rating)}</span>
              </span>
            </div>
            <h3 className="mt-3 font-semibold">{review.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{review.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
