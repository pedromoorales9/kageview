import React, { useState } from 'react';
import { MangaModel } from '../../../modules/manga';
import { MangaLibraryStatus, mangaKey, useMangaData } from '../../../modules/manga/mangaStore';

const STATUS_I18N: Record<string, string> = {
  ongoing:   'En curso',
  completed: 'Finalizado',
  hiatus:    'En pausa',
  cancelled: 'Cancelado',
};

const STATUS_DOT: Record<string, string> = {
  ongoing:   'bg-emerald-400',
  completed: 'bg-sky-400',
  hiatus:    'bg-amber-400',
  cancelled: 'bg-red-400',
};

const LIBRARY_LABEL: Record<MangaLibraryStatus, string> = {
  reading: 'Leyendo',
  planning: 'Pendiente',
  completed: 'Completado',
  dropped: 'Abandonado',
};

const SOURCE_LABEL: Record<string, string> = {
  mangadex: 'MangaDex',
  inmanga: 'InManga',
  manhwaweb: 'ManhwaWeb',
  mangaoni: 'MangaOni',
};

/** Tipo (manga/manhwa/manhua) deducido de la fuente, el id o las etiquetas. */
export function inferType(manga: MangaModel): 'MANGA' | 'MANHWA' | 'MANHUA' {
  const tags = manga.tags.map((t) => t.toLowerCase());
  const title = manga.title.toLowerCase();
  if (manga.sourceId === 'manhwaweb') {
    return tags.includes('manga') ? 'MANGA' : tags.includes('manhua') ? 'MANHUA' : 'MANHWA';
  }
  if (manga.sourceId === 'mangaoni') {
    const type = manga.id.split('/')[0]; // "{tipo}/{slug}"
    return type === 'manhwa' ? 'MANHWA' : type === 'manhua' ? 'MANHUA' : 'MANGA';
  }
  if (manga.sourceId === 'mangadex') {
    if (tags.includes('manhwa') || title.includes('manhwa')) return 'MANHWA';
    if (tags.includes('manhua') || title.includes('manhua')) return 'MANHUA';
  }
  return 'MANGA';
}

interface MangaCardProps {
  manga: MangaModel;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  /** Muestra de qué fuente viene (útil al buscar en todas). */
  showSource?: boolean;
}

function MangaCard({ manga, onClick, className = '', style, showSource = false }: MangaCardProps) {
  const [imgError, setImgError] = useState(false);
  // Estado propio (biblioteca, capítulos nuevos): la tarjeta lo sabe sola
  const record = useMangaData((s) => s.records[mangaKey(manga)]);
  const type = inferType(manga);
  const unread = record?.status === 'reading' ? record.unread ?? 0 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`relative group flex flex-col gap-2.5 text-left w-full transition-transform duration-[350ms] ease-mac hover:-translate-y-1.5 active:scale-[0.985] ${className}`}
    >
      <div className="relative">
        {/* Halo de hover: solo anima opacidad */}
        <div className="card-glow absolute inset-0 rounded-[14px] ring-1 ring-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="relative aspect-[3/4] rounded-[14px] overflow-hidden bg-surface-container shadow-card ring-[0.5px] ring-white/10">
          {manga.coverUrl && !imgError ? (
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-full h-full object-cover transition-transform duration-[700ms] ease-mac group-hover:scale-[1.07]"
              loading="lazy"
              decoding="async"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3 text-center">
              <span className="material-symbols-outlined text-muted text-4xl">menu_book</span>
              <span className="text-[11px] text-muted line-clamp-3 leading-tight">{manga.title}</span>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#09050a]/90 via-[#09050a]/30 to-transparent pointer-events-none" />

          {/* Hover: botón de leer */}
          <div className="absolute inset-0 flex items-center justify-center bg-[#09050a]/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="w-12 h-12 rounded-full glass flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform duration-300 ease-mac">
              <span className="material-symbols-outlined filled text-[24px]">auto_stories</span>
            </div>
          </div>

          {/* Tipo (abajo izquierda) */}
          <div className="absolute bottom-2 left-2 z-10">
            <span className="h-[20px] px-1.5 inline-flex items-center rounded-md text-[10px] font-bold uppercase tracking-[0.1em] text-white bg-black/65 ring-[0.5px] ring-white/15">
              {type}
            </span>
          </div>

          {/* Insignias (arriba derecha) */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
            {unread > 0 && (
              <span
                title={`${unread} ${unread === 1 ? 'capítulo' : 'capítulos'} sin leer`}
                className="h-[20px] min-w-[26px] px-1.5 inline-flex items-center justify-center rounded-md text-[11px] font-bold bg-primary text-white shadow-moon tabular-nums"
              >
                {unread > 99 ? '99+' : `+${unread}`}
              </span>
            )}
            {record?.status && (
              <span className="h-[18px] px-1.5 inline-flex items-center gap-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.08em] glass text-white">
                <span className="material-symbols-outlined filled text-[11px]">bookmark</span>
                {LIBRARY_LABEL[record.status]}
              </span>
            )}
          </div>

          {showSource && (
            <div className="absolute top-2 left-2 z-10">
              <span className="h-[18px] px-1.5 inline-flex items-center rounded-md text-[9px] font-bold uppercase tracking-[0.08em] bg-black/65 text-on-surface-variant ring-[0.5px] ring-white/15">
                {SOURCE_LABEL[manga.sourceId] ?? manga.sourceId}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-0.5 min-w-0">
        <h4 className="text-[14px] font-semibold text-white leading-snug tracking-[-0.01em] line-clamp-2 group-hover:text-secondary transition-colors">
          {manga.title}
        </h4>
        <p className="mt-1 text-[12px] text-muted flex items-center gap-1.5">
          {manga.lastChapter && <span>Cap. {manga.lastChapter}</span>}
          <span className={`w-1.5 h-1.5 rounded-full flex-none ${STATUS_DOT[manga.status] ?? 'bg-gray-400'}`} />
          <span className="truncate">{STATUS_I18N[manga.status] ?? manga.status}</span>
        </p>
      </div>
    </button>
  );
}

export default React.memo(MangaCard);
