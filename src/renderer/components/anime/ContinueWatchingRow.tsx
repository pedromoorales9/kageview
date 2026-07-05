import React from 'react';
import { ContinueWatchingItem } from '../../../modules/watchHistory';

interface ContinueWatchingRowProps {
  items: ContinueWatchingItem[];
  onResume: (item: ContinueWatchingItem) => void;
  onRemove: (item: ContinueWatchingItem) => void;
}

export default function ContinueWatchingRow({ items, onResume, onRemove }: ContinueWatchingRowProps) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="material-symbols-outlined text-primary text-[20px]">resume</span>
        <h2 className="font-headline text-lg font-bold text-on-surface">Continuar viendo</h2>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {items.map((item) => {
          const title = item.anime.title.english || item.anime.title.romaji;
          const thumb = item.anime.bannerImage || item.anime.coverImage.extraLarge || item.anime.coverImage.large;
          const pct = Math.round(item.progress * 100);
          return (
            <div
              key={`${item.anime.id}-${item.episode}`}
              className="group relative flex-none w-[260px]"
            >
              <button
                onClick={() => onResume(item)}
                className="block w-full text-left focus:outline-none"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-surface-container">
                  <img
                    src={thumb}
                    alt={title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  {/* Dark gradient for legibility */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
                    <span className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                      <span className="material-symbols-outlined filled text-on-primary text-2xl">play_arrow</span>
                    </span>
                  </div>

                  {/* Episode pill + mode */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-white text-[11px] font-semibold">
                      Ep. {item.episode}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-black/65 backdrop-blur-sm text-white/90 text-[10px] font-bold uppercase tracking-wide">
                      {item.mode}
                    </span>
                  </div>

                  {/* Progress bar */}
                  {item.progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
                      <div
                        className="h-full gradient-progress"
                        style={{ width: `${Math.max(3, pct)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Title */}
                <h3 className="mt-2 text-[13px] font-headline font-semibold leading-tight text-on-surface group-hover:text-primary transition-colors line-clamp-1 px-0.5">
                  {title}
                </h3>
                <p className="text-[11px] text-on-surface-variant px-0.5 mt-0.5">
                  {item.progress > 0
                    ? `${pct}% visto`
                    : item.resumeSeconds > 0
                      ? 'Reanudar'
                      : 'Empezar episodio'}
                </p>
              </button>

              {/* Remove */}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item); }}
                title="Quitar de Continuar viendo"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 w-6 h-6 rounded-full bg-black/70 text-white/80 hover:text-white hover:bg-error flex items-center justify-center z-10"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
