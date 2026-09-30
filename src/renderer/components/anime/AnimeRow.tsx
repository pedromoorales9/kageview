import React, { useEffect, useRef, useState } from 'react';
import { AniListAnime } from '../../../types/types';
import AnimeCard from './AnimeCard';

// Ancho objetivo por tarjeta (px). El nº de columnas se calcula según el ancho
// disponible para que las tarjetas mantengan un tamaño consistente en cualquier
// resolución (ventana mínima 1024px → monitores ultrawide).
const TARGET_CARD_WIDTH = 168;
const GRID_GAP = 12; // gap-3
const MIN_COLS = 2;
const MAX_COLS = 10;

interface AnimeRowProps {
  title: string;
  animes: AniListAnime[];
  onSelect: (anime: AniListAnime) => void;
  badge?: React.ReactNode;
}

export default function AnimeRow({ title, animes, onSelect, badge }: AnimeRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(7);
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<'left' | 'right'>('right');
  const [animKey, setAnimKey] = useState(0);

  // Recalcular columnas según el ancho real del contenedor
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const cols = Math.floor((w + GRID_GAP) / (TARGET_CARD_WIDTH + GRID_GAP));
      setPageSize(Math.max(MIN_COLS, Math.min(MAX_COLS, cols)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totalPages = Math.max(1, Math.ceil(animes.length / pageSize));

  // Mantener la página dentro de rango cuando cambian columnas o lista
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const visible = animes.slice(page * pageSize, page * pageSize + pageSize);

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
    <section ref={containerRef} className="mb-11">
      <div className="flex items-center gap-4 mb-5 px-1">
        <h2 className="section-title font-headline text-[22px] font-bold text-white tracking-[-0.025em] truncate">
          {title}
        </h2>
        {badge}
        <div className="flex-1" />
        <span className="text-[12px] text-muted font-medium tabular-nums mr-1">
          {page + 1} / {totalPages}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => go('left')}
            disabled={page === 0}
            aria-label="Anterior"
            className="w-7 h-7 rounded-full bg-white/[0.08] ring-[0.5px] ring-white/15 hover:bg-white/15 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors flex-none disabled:opacity-30 disabled:pointer-events-none active:scale-90"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            onClick={() => go('right')}
            disabled={page >= totalPages - 1}
            aria-label="Siguiente"
            className="w-7 h-7 rounded-full bg-white/[0.08] ring-[0.5px] ring-white/15 hover:bg-white/15 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors flex-none disabled:opacity-30 disabled:pointer-events-none active:scale-90"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div
        key={animKey}
        className={`grid gap-4 ${dir === 'right' ? 'anime-row-slide-right' : 'anime-row-slide-left'}`}
        style={{ gridTemplateColumns: `repeat(${pageSize}, minmax(0, 1fr))` }}
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
