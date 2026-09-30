import React, { useState } from 'react';
import { MangaModel } from '../../../modules/manga';

const STATUS_I18N: Record<string, string> = {
  ongoing:   'EN CURSO',
  completed: 'FINALIZADO',
  hiatus:    'EN PAUSA',
  cancelled: 'CANCELADO',
};

const STATUS_COLOR: Record<string, string> = {
  ongoing:   'bg-emerald-500',
  completed: 'bg-sky-500',
  hiatus:    'bg-amber-500',
  cancelled: 'bg-red-500',
};

/** Infer type label from sourceId or tags */
function inferType(manga: MangaModel): { label: string; color: string } | null {
  const title = manga.title.toLowerCase();
  const tags = manga.tags.map(t => t.toLowerCase());
  // ManhwaWeb includes _tipo, which we don't have in the generic model —
  // try heuristics from sourceId and tags
  if (manga.sourceId === 'manhwaweb') {
    // ManhwaWeb items likely manhwa/manhua
    if (tags.includes('manga')) return { label: 'MANGA', color: 'bg-blue-500' };
    if (tags.includes('manhua')) return { label: 'MANHUA', color: 'bg-purple-500' };
    return { label: 'MANHWA', color: 'bg-teal-500' };
  }
  if (manga.sourceId === 'inmanga') return { label: 'MANGA', color: 'bg-blue-500' };
  if (manga.sourceId === 'mangaoni') {
    // El id codifica el tipo: "{tipo}/{slug}" (manga/manhwa/manhua)
    const type = manga.id.split('/')[0];
    if (type === 'manhwa') return { label: 'MANHWA', color: 'bg-teal-500' };
    if (type === 'manhua') return { label: 'MANHUA', color: 'bg-purple-500' };
    return { label: 'MANGA', color: 'bg-blue-500' };
  }
  if (manga.sourceId === 'mangadex') {
    if (tags.includes('manhwa') || title.includes('manhwa')) return { label: 'MANHWA', color: 'bg-teal-500' };
    if (tags.includes('manhua') || title.includes('manhua')) return { label: 'MANHUA', color: 'bg-purple-500' };
    return { label: 'MANGA', color: 'bg-blue-500' };
  }
  return null;
}

interface MangaCardProps {
  manga: MangaModel;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

function MangaCard({ manga, onClick, className = '', style }: MangaCardProps) {
  const [imgError, setImgError] = useState(false);
  const typeInfo = inferType(manga);
  const statusText = STATUS_I18N[manga.status] ?? manga.status?.toUpperCase();
  const statusColor = STATUS_COLOR[manga.status] ?? 'bg-gray-500';

  return (
    <div
      onClick={onClick}
      style={style}
      className={`
        group flex flex-col text-left cursor-pointer w-full
        transition-all duration-500 ease-out focus:outline-none
        ${className}
      `}
    >
      {/* Ambilight glow behind the card */}
      <div className="absolute inset-x-0 top-0 aspect-[3/4] z-0 opacity-0 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none rounded-[14px] overflow-hidden blur-2xl transform scale-95 translate-y-4">
        {manga.coverUrl && !imgError && (
          <img
            src={manga.coverUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Cover container */}
      <div className="relative z-10 w-full aspect-[3/4] rounded-xl overflow-hidden mb-2 bg-[#150a10] border border-white/5 shadow-lg group-hover:shadow-2xl transition-all duration-300 transform group-hover:-translate-y-2 group-hover:scale-[1.02]">
        {/* Cover image (con placeholder si falta o falla la carga, p.ej. CDN caído) */}
        {manga.coverUrl && !imgError ? (
          <img
            src={manga.coverUrl}
            alt={manga.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[#150a10] px-2 text-center">
            <span className="material-symbols-outlined text-[#86747c] text-4xl">menu_book</span>
            <span className="text-[10px] text-[#86747c] font-label line-clamp-2 leading-tight">{manga.title}</span>
          </div>
        )}

        {/* Hover overlay (manga style) */}
        <div className="
          absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100
          transition-opacity duration-300
          flex items-center justify-center pointer-events-none
        ">
          <div className="w-14 h-14 rounded-full bg-white/20 text-white flex items-center justify-center scale-50 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300 ease-out border border-white/20 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <span className="material-symbols-outlined text-2xl">visibility</span>
          </div>
        </div>

        {/* Bottom gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80 pointer-events-none" />

        {/* Type Badge pill — bottom left */}
        {typeInfo && (
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
            <span className="inline-block bg-black/55 text-white border border-white/20 text-[9px] sm:text-[11px] lg:text-[13px] font-bold px-2.5 py-1 rounded-[8px] uppercase tracking-widest shadow-sm">
              {typeInfo.label}
            </span>
          </div>
        )}
      </div>

      {/* Info Block */}
      <h4 className="relative z-10 text-white font-headline font-bold text-sm sm:text-base lg:text-lg mb-1 truncate px-1 group-hover:text-primary transition-colors drop-shadow-md">
        {manga.title}
      </h4>
      <p className="relative z-10 text-[#86747c] text-[10px] sm:text-[11px] lg:text-sm flex items-center gap-2 px-1 truncate font-headline uppercase tracking-wider font-semibold">
        <span>C.{manga.lastChapter ?? '?'}</span>
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${statusColor}`} />
        <span className="text-[#bcaab2] truncate">{statusText}</span>
      </p>
    </div>
  );
}

export default React.memo(MangaCard);
