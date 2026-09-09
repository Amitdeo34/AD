import { Suspense } from 'react';
import SearchResults from '@/components/SearchResults';

export const metadata = {
  title: 'Search stays',
  description: 'Search hotels, homestays and guest houses anywhere in India.',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10 text-ink-400">Loading search…</div>}>
      <SearchResults />
    </Suspense>
  );
}
