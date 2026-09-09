import { Suspense } from 'react';
import Checkout from '@/components/Checkout';

export const metadata = { title: 'Checkout' };

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-10 text-ink-400">Loading checkout…</div>}>
      <Checkout />
    </Suspense>
  );
}
