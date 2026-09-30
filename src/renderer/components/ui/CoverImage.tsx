import React, { useEffect, useState } from 'react';
import { safeCoverUrl } from '../../../modules/safeUrl';

interface CoverImageProps {
  src?: string | null;
  className?: string;
}

/** Portada con marcador si no hay URL, no es de un origen permitido o falla al cargar. */
export default function CoverImage({ src: rawSrc, className = '' }: CoverImageProps) {
  const src = safeCoverUrl(rawSrc);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return (
      <div className={`bg-white/[0.06] flex items-center justify-center ${className}`}>
        <span className="material-symbols-outlined text-muted text-[20px]">movie</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
