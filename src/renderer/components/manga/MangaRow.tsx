import React, { useRef, useState, useEffect } from 'react';
import { MangaModel } from '../../../modules/manga';
import MangaCard from './MangaCard';

interface MangaRowProps {
  title: string;
  mangas: MangaModel[];
  onSelect: (manga: MangaModel) => void;
}

export default function MangaRow({ title, mangas, onSelect }: MangaRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const resize = new ResizeObserver(checkScroll);
    resize.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      resize.disconnect();
    };
  }, [mangas]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === 'right' ? amount : -amount,
      behavior: 'smooth',
    });
  };

  if (mangas.length === 0) return null;

  return (
    <section className="relative">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-3 px-1">
        <h2 className="font-headline text-base font-bold text-on-surface">{title}</h2>
        <span className="text-xs text-on-surface-variant/60 font-label">{mangas.length} títulos</span>
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-primary/20
              border border-surface-variant/20 hover:border-primary/40
              flex items-center justify-center text-on-surface-variant hover:text-primary
              transition-all duration-200 flex-none disabled:opacity-20 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="w-7 h-7 rounded-full bg-surface-container-high hover:bg-primary/20
              border border-surface-variant/20 hover:border-primary/40
              flex items-center justify-center text-on-surface-variant hover:text-primary
              transition-all duration-200 flex-none disabled:opacity-20 disabled:pointer-events-none"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Scrollable row with smooth horizontal scroll */}
      <div className="relative">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10
            bg-gradient-to-r from-background to-transparent pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className="flex gap-6 overflow-x-auto pb-6 pt-4 -mt-2 hide-scrollbar scroll-smooth px-2"
        >
          {mangas.map((manga) => (
            <div key={manga.id} className="flex-none w-[180px] sm:w-[220px] lg:w-[260px] xl:w-[300px] 2xl:w-[340px]">
              <MangaCard
                manga={manga}
                onClick={() => onSelect(manga)}
              />
            </div>
          ))}
        </div>

        {/* Right fade */}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10
            bg-gradient-to-l from-background to-transparent pointer-events-none" />
        )}
      </div>
    </section>
  );
}
