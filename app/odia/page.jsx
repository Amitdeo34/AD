import Link from 'next/link';
import OdiaKeyboard from '@/components/OdiaKeyboard';

export const metadata = {
  title: 'Odia keyboard — type and generate ଓଡ଼ିଆ script',
  description:
    'A free Odia keyboard: tap the letters, or type in Roman and have the script generated for you. Vowels, matras, consonants, conjuncts, numerals and ready phrases — copy the result anywhere.',
};

export default function OdiaKeyboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Most desktops ship no Odia face; the local stack in globals.css covers the rest. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;700&display=swap"
      />

      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-ink-400">
        <Link href="/" className="hover:underline">Home</Link> <span aria-hidden="true">›</span>{' '}
        <span className="font-semibold text-ink-700">Odia keyboard</span>
      </nav>

      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
        Odia keyboard <span className="odia text-forest-700">ଓଡ଼ିଆ କୀବୋର୍ଡ଼</span>
      </h1>
      <p className="mt-1 max-w-2xl text-ink-500">
        Write Odia without installing anything. Tap the letters, or type the word the way it sounds
        in Roman — <code>ORishaa</code> becomes <span className="odia">ଓଡ଼ିଶା</span> — and copy the
        script into a booking request, a message or a listing.
      </p>

      <div className="mt-5">
        <OdiaKeyboard />
      </div>
    </div>
  );
}
