export function Stars({ count, className = '' }) {
  return (
    <span className={`text-saffron-600 ${className}`} title={`${count} star`} aria-label={`${count} star property`}>
      {'★'.repeat(count)}
      <span className="text-sand-300">{'★'.repeat(5 - count)}</span>
    </span>
  );
}

export function RatingBadge({ rating, reviewCount, size = 'sm' }) {
  if (!rating) return null;
  const label = rating >= 4.5 ? 'Excellent' : rating >= 4 ? 'Very good' : rating >= 3.5 ? 'Good' : 'Fair';
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`rounded-md bg-forest-700 font-bold text-white ${
          size === 'lg' ? 'px-2.5 py-1 text-base' : 'px-1.5 py-0.5 text-xs'
        }`}
      >
        {rating.toFixed(1)}
      </span>
      <span className={size === 'lg' ? 'text-sm' : 'text-xs'}>
        <span className="font-semibold text-ink-700">{label}</span>
        {reviewCount ? (
          <span className="text-ink-400"> · {reviewCount.toLocaleString('en-IN')} reviews</span>
        ) : null}
      </span>
    </span>
  );
}
