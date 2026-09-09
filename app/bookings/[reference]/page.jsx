import { Suspense } from 'react';
import BookingDetail from '@/components/BookingDetail';

export const metadata = { title: 'Your booking' };

export default async function BookingPage({ params }) {
  const { reference } = await params;
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl px-4 py-10 text-ink-400">Loading your booking…</div>}>
      <BookingDetail reference={reference} />
    </Suspense>
  );
}
