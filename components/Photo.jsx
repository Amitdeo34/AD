'use client';

import { useEffect, useRef, useState } from 'react';

// Muted pairs, so a property without photography still looks like part of the
// same catalogue rather than a placeholder shouting for attention.
const GRADIENTS = {
  saffron: ['#f6dcb4', '#d9a45f'],
  indigo: ['#d3d8ea', '#7b87b5'],
  teal: ['#cbe3df', '#5f9c93'],
  maroon: ['#e8d0cd', '#a76a62'],
  olive: ['#dde2c8', '#8b9761'],
  plum: ['#ded2e0', '#8f7396'],
  clay: ['#eddccc', '#b58a68'],
  sea: ['#cfe0eb', '#6b93b2'],
};

const GLYPH = {
  HOTEL: '🏨', RESORT: '🌴', HOMESTAY: '🏡', GUEST_HOUSE: '🏠',
  LODGE: '🛖', HERITAGE: '🏛️', HOSTEL: '🛏️',
};

/**
 * A listing photograph with a graceful fallback: if the image cannot load —
 * offline, blocked, or a property with no photography yet — the card keeps its
 * shape and shows a coloured placeholder instead of a broken image.
 */
export default function Photo({ photo, accent = 'teal', kind = 'HOTEL', className = '', sizes, priority = false }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef(null);

  // The markup is server-rendered, so an image can finish failing before React
  // hydrates and attaches onError. Check the element's own state on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [photo?.url]);

  if (!photo || failed) {
    const [from, to] = GRADIENTS[accent] ?? GRADIENTS.teal;
    return (
      <div
        className={`grid place-items-center ${className}`}
        style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
        role="img"
        aria-label={photo?.alt ?? 'Photograph unavailable'}
      >
        <span className="text-3xl opacity-80" aria-hidden="true">{GLYPH[kind] ?? '🏨'}</span>
      </div>
    );
  }

  return (
    <img
      ref={ref}
      src={photo.url}
      alt={photo.alt}
      sizes={sizes}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`bg-sand-100 object-cover ${className}`}
    />
  );
}
