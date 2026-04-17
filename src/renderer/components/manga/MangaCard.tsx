import React from 'react';
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

export default function MangaCard({ manga, onClick, className = '', style }: MangaCardProps) {
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
      {/* Cover container */}
      <div className="relative w-full aspect-[3/4] rounded-xl overflow-hidden mb-2 card-shadow transition-all duration-500 transform group-hover:-translate-y-2 group-hover:shadow-[0_0_30px_rgba(222,187,255,0.15)]">
        {/* Cover image */}
        {manga.coverUrl ? (
          <img
            src={manga.coverUrl}
            alt={manga.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
            <span className="material-symbols-outlined text-on-surface-variant text-4xl">menu_book</span>
          </div>
        )}

        {/* Bottom gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-80 pointer-events-none" />

        {/* Type Badge pill — bottom left */}
        {typeInfo && (
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
            <span className="inline-block bg-primary/20 backdrop-blur-md text-primary text-[9px] sm:text-[11px] lg:text-[13px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest shadow-lg border border-primary/20">
              {typeInfo.label}
            </span>
          </div>
        )}
      </div>

      {/* Info Block */}
      <h4 className="text-on-surface font-headline font-bold text-sm sm:text-base lg:text-lg mb-1 truncate px-1 group-hover:text-primary transition-colors">
        {manga.title}
      </h4>
      <p className="text-on-surface-variant text-[10px] sm:text-[11px] lg:text-sm flex items-center gap-2 px-1 truncate font-label uppercase tracking-wider">
        <span>C.{manga.lastChapter ?? '?'}</span>
        <span className={`w-1.5 h-1.5 rounded-full flex-none ${statusColor}`} />
        <span className="text-on-surface-variant/80 font-semibold truncate">{statusText}</span>
      </p>
    </div>
  );
}
