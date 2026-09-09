'use client';

import { useState } from 'react';
import Photo from './Photo';

/**
 * The photographs a guest sees before booking: one large frame with a strip of
 * thumbnails under it, and full keyboard support.
 */
export default function PhotoGallery({ photos, accent, kind, name }) {
  const [active, setActive] = useState(0);
  if (!photos?.length) {
    return <Photo photo={null} accent={accent} kind={kind} className="aspect-[16/9] w-full rounded-2xl" />;
  }

  return (
    <figure className="grid gap-2">
      <Photo
        photo={photos[active]}
        accent={accent}
        kind={kind}
        priority
        sizes="(max-width: 1024px) 100vw, 760px"
        className="aspect-[16/9] w-full rounded-2xl"
      />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={`Photographs of ${name}`}>
        {photos.map((photo, index) => (
          <button
            key={photo.url}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={photo.alt}
            onClick={() => setActive(index)}
            className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
              index === active ? 'border-forest-700' : 'border-transparent opacity-75 hover:opacity-100'
            }`}
          >
            <Photo
              photo={{ ...photo, url: photo.thumb ?? photo.url }}
              accent={accent}
              kind={kind}
              sizes="140px"
              className="h-16 w-24"
            />
          </button>
        ))}
      </div>
      <figcaption className="text-xs text-ink-400">{photos[active].alt}</figcaption>
    </figure>
  );
}
