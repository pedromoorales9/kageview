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
      className="mt-2 mb-10 w-full relative h-[380px] lg:h-[450px] rounded-xl lg:rounded-3xl overflow-hidden cursor-pointer group shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)]"
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
          <span className="bg-primary/20 backdrop-blur-md text-primary px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase shadow-lg border border-primary/20">
            Top Tendencia
          </span>
          <span className="bg-surface-variant/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-on-surface tracking-widest uppercase">
            Cap. {manga.lastChapter ?? '?'}
          </span>
          <span className="bg-surface-variant/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-tertiary tracking-widest uppercase">
            {manga.status === 'ongoing' ? 'En Curso' : 'Finalizado'}
          </span>
        </div>

        <h2 className="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-on-surface leading-[1.05] max-w-4xl drop-shadow-2xl line-clamp-2">
          {manga.title}
        </h2>

        <div className="flex items-center gap-3 mt-6">
          <button className="
            flex items-center gap-2 px-8 py-3
            gradient-primary rounded-full
            text-on-primary font-headline font-bold text-sm tracking-widest uppercase
            transition-all duration-300
            hover:shadow-[0_0_30px_rgba(203,151,255,0.4)]
            hover:scale-105
          ">
            <span className="material-symbols-outlined text-xl">play_arrow</span>
            Leer Ahora
          </button>
          <button className="
            flex items-center gap-2 px-6 py-3
            bg-surface-container-high/60 backdrop-blur-xl rounded-full border border-white/10
            text-on-surface font-headline font-bold text-sm tracking-widest uppercase
            transition-all duration-300
            hover:bg-surface-container-highest
          ">
            <span className="material-symbols-outlined text-xl">info</span>
            Detalles
          </button>
        </div>
      </div>
    </section>
  );
}
