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
    <section className="mb-11">
      <div className="flex items-center gap-2.5 mb-5 px-1">
        <span className="material-symbols-outlined filled text-primary text-[22px]">play_circle</span>
        <h2 className="section-title font-headline text-[22px] font-bold text-white tracking-[-0.025em]">
          Continuar viendo
        </h2>
      </div>

      <div className="flex gap-4 overflow-x-auto pt-1 pb-5 -mx-1 px-1 carousel-scrollbar hide-scrollbar">
        {items.map((item) => {
          const title = item.anime.title.english || item.anime.title.romaji;
          const thumb =
            item.anime.bannerImage || item.anime.coverImage.extraLarge || item.anime.coverImage.large;
          const pct = Math.round(item.progress * 100);
          return (
            <div
              key={`${item.anime.id}-${item.episode}`}
              className="group relative flex-none w-[320px] xl:w-[360px] transition-transform duration-[350ms] ease-mac hover:-translate-y-1"
            >
              <div className="card-glow absolute inset-0 rounded-[16px] ring-1 ring-primary/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              <button
                onClick={() => onResume(item)}
                className="
                  relative block w-full text-left aspect-[16/9] rounded-[16px] overflow-hidden
                  bg-surface-container shadow-card ring-[0.5px] ring-white/10
                "
              >
                <img
                  src={thumb}
                  alt={title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[700ms] ease-mac group-hover:scale-[1.06]"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09050a] via-[#09050a]/45 to-transparent" />

                {/* Reproducir */}
                <div className="absolute top-3 right-3 w-10 h-10 rounded-full glass flex items-center justify-center text-white opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 ease-mac">
                  <span className="material-symbols-outlined filled text-[22px] translate-x-[1px]">play_arrow</span>
                </div>

                {/* Info */}
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="h-[18px] px-1.5 inline-flex items-center rounded-md text-[10px] font-bold uppercase tracking-[0.1em] bg-primary text-white shadow-moon">
                      Ep. {item.episode}
                    </span>
                    <span className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wide">
                      {item.mode}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-white leading-tight tracking-[-0.015em] line-clamp-1">
                    {title}
                  </h3>
                </div>

                {/* Progreso */}
                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/60">
                  <div
                    className="h-full gradient-progress rounded-r-full progress-glow"
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </button>

              {/* Quitar */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item);
                }}
                title="Quitar de Continuar viendo"
                className="
                  absolute -top-2 -left-2 w-7 h-7 rounded-full glass-strong
                  flex items-center justify-center z-20
                  text-on-surface-variant hover:text-white hover:bg-primary
                  opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100
                  transition-all duration-300 ease-mac
                "
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
