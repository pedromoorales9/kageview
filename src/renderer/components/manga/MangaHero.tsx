import React, { useState } from 'react';
import { MangaModel } from '../../../modules/manga';

interface MangaHeroProps {
  manga: MangaModel;
  onClick: () => void;
}

/**
 * Banner destacado de la sección de manga.
 * Muestra un fondo atmosférico borroso + el póster, con un fallback
 * decorativo si el manga no trae portada o la imagen falla al cargar.
 */
export default function MangaHero({ manga, onClick }: MangaHeroProps) {
  const [imgError, setImgError] = useState(false);
  const hasCover = !!manga.coverUrl && !imgError;

  return (
    <section
      className="mt-2 mb-10 w-full relative h-[380px] lg:h-[450px] rounded-[26px] overflow-hidden cursor-pointer group shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_0_0.5px_rgba(255,255,255,0.1)]"
      onClick={onClick}
    >
      {hasCover ? (
        <>
          {/* Fondo atmosférico borroso a todo lo ancho */}
          <div className="absolute inset-0 z-0">
            <img
              src={manga.coverUrl}
              alt=""
              onError={() => setImgError(true)}
              className="w-full h-full object-cover opacity-30 blur-[60px] scale-150 saturate-[1.5]"
            />
          </div>

          {/* Póster real, contenido sin estirar y fundido con el fondo */}
          <div className="absolute inset-0 z-10 flex justify-end md:justify-center lg:justify-end pr-0 lg:pr-32 xl:pr-48">
            <img
              src={manga.coverUrl}
              alt=""
              onError={() => setImgError(true)}
              className="h-[120%] lg:h-[140%] -mt-10 max-w-none object-contain opacity-95 drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)] transition-transform duration-1000 group-hover:scale-105"
              style={{
                maskImage: 'radial-gradient(ellipse at center, black 58%, transparent 88%)',
                WebkitMaskImage: 'radial-gradient(ellipse at center, black 58%, transparent 88%)',
              }}
            />
          </div>
        </>
      ) : (
        /* Fallback sin portada: degradado + marca de agua */
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-surface-container-high via-surface-container to-background">
          <span className="material-symbols-outlined absolute right-8 lg:right-24 top-1/2 -translate-y-1/2 text-primary/10 text-[18rem] leading-none select-none">
            menu_book
          </span>
        </div>
      )}

      {/* Degradados para oscurecer y dar legibilidad al texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent z-20" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 lg:via-transparent to-transparent z-20" />

      {/* Bloque de contenido */}
      <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 flex flex-col gap-3 z-30">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white bg-primary/90 shadow-moon">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            Top tendencia
          </span>
          <span className="bg-white/10 ring-[0.5px] ring-white/20 h-[22px] px-2.5 inline-flex items-center rounded-full text-[11.5px] font-semibold text-white">
            Cap. {manga.lastChapter ?? '?'}
          </span>
          <span className="bg-white/10 ring-[0.5px] ring-white/20 h-[22px] px-2.5 inline-flex items-center rounded-full text-[11.5px] font-semibold text-secondary">
            {manga.status === 'ongoing' ? 'En curso' : 'Finalizado'}
          </span>
        </div>

        <h2 className="font-headline text-4xl sm:text-5xl lg:text-[60px] font-bold tracking-[-0.035em] text-white leading-[1.03] max-w-4xl [text-shadow:0_4px_40px_rgba(0,0,0,0.6)] line-clamp-2">
          {manga.title}
        </h2>

        <div className="flex items-center gap-3 mt-5">
          <button className="btn-moon h-[44px] px-6 rounded-full flex items-center gap-2 font-semibold text-[14.5px]">
            <span className="material-symbols-outlined filled text-[22px] -ml-1">auto_stories</span>
            Leer ahora
          </button>
          <button className="btn-glass h-[44px] px-5 rounded-full flex items-center gap-2 font-medium text-[14.5px]">
            <span className="material-symbols-outlined text-[20px] opacity-90">info</span>
            Detalles
          </button>
        </div>
      </div>
    </section>
  );
}
