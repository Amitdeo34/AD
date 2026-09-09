import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-bold tracking-tight">That page has checked out</h1>
      <p className="mt-2 text-ink-500">The link may be old, or the address slightly off.</p>
      <Link href="/" className="mt-5 inline-block rounded-lg bg-forest-700 px-5 py-2.5 font-semibold text-white">
        Search for a stay
      </Link>
    </div>
  );
}
