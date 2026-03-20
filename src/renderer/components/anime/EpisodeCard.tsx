import React from 'react';
import { AniZipEpisode } from '../../../types/types';

interface EpisodeCardProps {
  episode: AniZipEpisode;
  animeTitle: string;
  onClick?: () => void;
  progress?: number; // 0-100 percentage watched
  className?: string;
}

export default function EpisodeCard({
  episode,
  animeTitle,
  onClick,
  progress = 0,
  className = '',
}: EpisodeCardProps) {
  return (
    <button
      id={`episode-card-${episode.episodeNumber}`}
      onClick={onClick}
      className={`
        group flex-none w-64 flex flex-col text-left
        transition-all duration-200 ease-out-custom
        hover:scale-[1.03]
        focus:outline-none
        ${className}
      `}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-surface-container">
        {episode.image ? (
          <img
            src={episode.image}
            alt={`Episode ${episode.episodeNumber}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
              movie
            </span>
          </div>
        )}

        {/* Play icon overlay */}
        <div className="
          absolute inset-0 flex items-center justify-center
          bg-black/0 group-hover:bg-black/40
          transition-all duration-200
        ">
          <div className="
            w-10 h-10 rounded-full bg-primary/90
            flex items-center justify-center
            opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
            transition-all duration-200
          ">
            <span className="material-symbols-outlined filled text-on-primary text-xl ml-0.5">
              play_arrow
            </span>
          </div>
        </div>

        {/* Episode number badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-background/75 backdrop-blur-md">
          <span className="text-[11px] font-label font-semibold text-on-surface">
            EP {episode.episodeNumber}
          </span>
        </div>

        {/* Progress bar */}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-surface-container/80">
            <div
              className="h-full gradient-progress"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-1.5 px-0.5">
        <p className="text-[12px] text-on-surface-variant line-clamp-1">
          {animeTitle}
        </p>
        <p className="text-[11px] text-on-surface-variant/70 mt-0.5 line-clamp-1">
          {episode.title?.en || `Episode ${episode.episodeNumber}`}
        </p>
      </div>
    </button>
  );
}
