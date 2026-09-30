import React from 'react';
import { AniListAnime } from '../../../types/types';

interface AnimeCardProps {
  anime: AniListAnime;
  onClick?: () => void;
  showProgress?: boolean;
  progress?: number;
  mediaListStatus?: string;
  className?: string;
}

const LIST_STATUS: Record<string, { label: string; cls: string }> = {
  CURRENT: { label: 'Viendo', cls: 'bg-primary text-white shadow-moon' },
  COMPLETED: { label: 'Completado', cls: 'bg-[#35e66a]/20 text-[#5cf08a] ring-1 ring-[#35e66a]/30' },
  PAUSED: { label: 'En pausa', cls: 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-400/30' },
  DROPPED: { label: 'Abandonado', cls: 'bg-red-500/20 text-red-300 ring-1 ring-red-400/30' },
  PLANNING: { label: 'Pendiente', cls: 'glass text-white' },
};

function AnimeCard({
  anime,
  onClick,
  showProgress = false,
  progress = 0,
  mediaListStatus,
  className = '',
}: AnimeCardProps) {
  const totalEps = anime.episodes || 1;
  const progressPercent = Math.min((progress / totalEps) * 100, 100);
  const cover = anime.coverImage.extraLarge || anime.coverImage.large;
  const listBadge = mediaListStatus ? LIST_STATUS[mediaListStatus] : undefined;

  return (
    <button
      id={`anime-card-${anime.id}`}
      onClick={onClick}
      className={`
        relative group flex flex-col gap-2.5 text-left
        transition-transform duration-[350ms] ease-mac
        hover:-translate-y-1.5 active:scale-[0.985]
        ${className}
      `}
    >
      {/* Póster */}
      <div className="relative">
        {/* Halo de hover: solo anima opacidad (no box-shadow) */}
        <div className="card-glow absolute inset-0 rounded-[14px] ring-1 ring-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      <div
        className="
          relative aspect-[2/3] rounded-[14px] overflow-hidden bg-surface-container
          shadow-card ring-[0.5px] ring-white/10
        "
      >
        <img
          src={cover}
          alt={anime.title.romaji}
          className="w-full h-full object-cover transition-transform duration-[700ms] ease-mac group-hover:scale-[1.07]"
          loading="lazy"
          decoding="async"
        />

        {/* Degradado inferior tintado */}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#09050a]/90 via-[#09050a]/30 to-transparent pointer-events-none" />

        {/* Hover: botón de reproducir de cristal */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#09050a]/25 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-12 h-12 rounded-full glass flex items-center justify-center text-white scale-75 group-hover:scale-100 transition-transform duration-300 ease-mac">
            <span className="material-symbols-outlined filled text-[26px] translate-x-[1px]">play_arrow</span>
          </div>
        </div>

        {/* Nota */}
        {anime.averageScore && (
          <div className="absolute bottom-2 left-2 z-10">
            <span className="h-[20px] px-1.5 rounded-md text-[11px] font-semibold text-white bg-black/65 flex items-center gap-0.5 ring-[0.5px] ring-white/15">
              <span className="material-symbols-outlined filled text-primary text-[12px]">star</span>
              {(anime.averageScore / 10).toFixed(1)}
            </span>
          </div>
        )}

        {/* Estados */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
          {anime.status === 'RELEASING' && (
            <span className="h-[18px] px-1.5 inline-flex items-center rounded-md text-[9px] font-bold uppercase tracking-[0.12em] bg-primary text-white shadow-moon">
              En emisión
            </span>
          )}
          {anime.status === 'NOT_YET_RELEASED' && (
            <span className="h-[18px] px-1.5 inline-flex items-center rounded-md text-[9px] font-bold uppercase tracking-[0.12em] glass text-white">
              Próximamente
            </span>
          )}
          {listBadge && (
            <span
              className={`h-[18px] px-1.5 inline-flex items-center rounded-md text-[9px] font-bold uppercase tracking-[0.1em] ${listBadge.cls}`}
            >
              {listBadge.label}
            </span>
          )}
        </div>

        {/* Progreso */}
        {showProgress && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-black/60 z-10">
            <div
              className="h-full gradient-progress rounded-r-full progress-glow"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      </div>

      {/* Título */}
      <div className="px-0.5">
        <h3 className="text-[13px] font-semibold leading-snug tracking-[-0.01em] text-on-surface group-hover:text-white line-clamp-2 transition-colors">
          {anime.title.english || anime.title.romaji}
        </h3>
        {anime.seasonYear && (
          <p className="text-[11.5px] text-muted mt-0.5">
            {anime.seasonYear}
            {anime.episodes ? ` · ${anime.episodes} ep` : ''}
          </p>
        )}
      </div>
    </button>
  );
}

export default React.memo(AnimeCard);
