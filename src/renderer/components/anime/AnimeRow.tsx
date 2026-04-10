import React, { useState } from 'react';
import { AniListAnime } from '../../../types/types';
import AnimeCard from './AnimeCard';

const PAGE_SIZE = 7;

interface AnimeRowProps {
  title: string;
  animes: AniListAnime[];
  onSelect: (anime: AniListAnime) => void;
  badge?: React.ReactNode;
}

export default function AnimeRow({ title, animes, onSelect, badge }: AnimeRowProps) {
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<'left' | 'right'>('right');
  const [animKey, setAnimKey] = useState(0);

  const totalPages = Math.ceil(animes.length / PAGE_SIZE);
  const visible = animes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const go = (direction: 'left' | 'right') => {
    setDir(direction);
    setAnimKey((k) => k + 1);
    setPage((p) =>
      direction === 'right'
        ? Math.min(totalPages - 1, p + 1)
        : Math.max(0, p - 1)
    );
  };

  if (animes.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-3 mb-3 px-1">
        <button
          onClick={() => go('left')}
          disabled={page === 0}
          className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-primary/20 border border-surface-variant/30 hover:border-primary/40 flex items-center justify-center text-on-surface-variant hover:text-primary transition-all flex-none disabled:opacity-30 disabled:pointer-events-none"
        >
          <span className="material-symbols-outlined text-sm">chevron_left</span>
        </button>
        <button
          onClick={() => go('right')}
          disabled={page >= totalPages - 1}
          className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-primary/20 border border-surface-variant/30 hover:border-primary/40 flex items-center justify-center text-on-surface-variant hover:text-primary transition-all flex-none disabled:opacity-30 disabled:pointer-events-none"
        >
          <span className="material-symbols-outlined text-sm">chevron_right</span>
        </button>
        <h2 className="font-headline text-lg font-bold text-on-surface">{title}</h2>
        {badge}
        <span className="text-xs text-on-surface-variant font-label ml-auto">
          {page + 1} / {totalPages}
        </span>
      </div>

      <div
        key={animKey}
        className={`grid gap-3 ${dir === 'right' ? 'anime-row-slide-right' : 'anime-row-slide-left'}`}
        style={{ gridTemplateColumns: `repeat(${PAGE_SIZE}, 1fr)` }}
      >
        {visible.map((anime) => (
          <AnimeCard
            key={anime.id}
            anime={anime}
            onClick={() => onSelect(anime)}
            className="w-full"
          />
        ))}
      </div>
    </section>
  );
}
