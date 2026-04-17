import React from 'react';
import { AniListAnime } from '../../../types/types';
import Badge from '../ui/Badge';

interface AnimeCardProps {
  anime: AniListAnime;
  onClick?: () => void;
  showProgress?: boolean;
  progress?: number;
  mediaListStatus?: string;
  className?: string;
}

export default function AnimeCard({
  anime,
  onClick,
  showProgress = false,
  progress = 0,
  mediaListStatus,
  className = '',
}: AnimeCardProps) {
  const totalEps = anime.episodes || 1;
  const progressPercent = Math.min((progress / totalEps) * 100, 100);

  return (
    <button
      id={`anime-card-${anime.id}`}
      onClick={onClick}
      className={`
        group flex flex-col gap-2 text-left
        transition-all duration-200 ease-out-custom
        hover:scale-105
        focus:outline-none
        ${className}
      `}
    >
      {/* Cover Image */}
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container">
        <img
          src={anime.coverImage.extraLarge || anime.coverImage.large}
          alt={anime.title.romaji}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />

        {/* Hover glow overlay */}
        <div className="
          absolute inset-0 opacity-0 group-hover:opacity-100
          transition-opacity duration-300
          shadow-[inset_0_0_22px_rgba(203,151,255,0.25)]
          pointer-events-none
        " />

        {/* Score badge — bottom-left */}
        {anime.averageScore && (
          <div className="absolute bottom-2 left-2">
            <Badge variant="neutral" size="sm">
              <span className="material-symbols-outlined filled text-primary text-[12px]">
                star
              </span>
              {(anime.averageScore / 10).toFixed(1)}
            </Badge>
          </div>
        )}

        {/* Status badges — top-right stacked */}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-10">
          {anime.status === 'RELEASING' && (
            <Badge variant="primary" size="sm">
              EN EMISIÓN
            </Badge>
          )}
          {anime.status === 'NOT_YET_RELEASED' && (
            <Badge variant="secondary" size="sm">
              PRÓXIMAMENTE
            </Badge>
          )}
          {mediaListStatus && (
            <Badge variant={
              mediaListStatus === 'CURRENT' ? 'primary' :
              mediaListStatus === 'COMPLETED' ? 'success' :
              mediaListStatus === 'PAUSED' ? 'warning' :
              mediaListStatus === 'DROPPED' ? 'error' :
              'neutral'
            } size="sm">
              {mediaListStatus === 'CURRENT' ? 'Viendo' : mediaListStatus}
            </Badge>
          )}
        </div>

        {/* Progress bar — bottom */}
        {showProgress && progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-surface-container/80">
            <div
              className="h-full gradient-progress rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Title */}
      <div className="px-0.5">
        <h3 className="
          text-[13px] font-headline font-semibold leading-tight
          text-on-surface
          group-hover:text-primary
          transition-colors duration-200
          line-clamp-2
        ">
          {anime.title.english || anime.title.romaji}
        </h3>
        {anime.seasonYear && (
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            {anime.seasonYear}
            {anime.episodes ? ` · ${anime.episodes} ep` : ''}
          </p>
        )}
      </div>
    </button>
  );
}
