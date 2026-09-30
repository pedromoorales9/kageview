import React from 'react';
import { AniListAnime } from '../../../types/types';
import Petals from '../ui/Petals';

interface HeroBannerProps {
  anime: AniListAnime;
  onClick?: () => void;
}

const GENRE_I18N: Record<string, string> = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama',
  Fantasy: 'Fantasía', Horror: 'Terror', Mecha: 'Mecha', Mystery: 'Misterio',
  Romance: 'Romance', 'Sci-Fi': 'Ciencia Ficción', Thriller: 'Suspense',
  Sports: 'Deportes', 'Slice of Life': 'Recuentos de la Vida',
  Supernatural: 'Sobrenatural', Music: 'Música',
};

export default function HeroBanner({ anime, onClick }: HeroBannerProps) {
  const backgroundImage = anime.bannerImage || anime.coverImage.extraLarge;
  const studio = anime.studios?.nodes?.find((s) => s.isAnimationStudio)?.name;
  const score = anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null;
  const meta = [
    anime.seasonYear ? String(anime.seasonYear) : null,
    anime.episodes ? `${anime.episodes} episodios` : null,
    studio ?? null,
  ].filter(Boolean) as string[];

  return (
    <div
      id="hero-banner"
      onClick={onClick}
      className="
        group relative w-full h-[440px] xl:h-[520px] rounded-[26px] overflow-hidden
        cursor-pointer bg-background
        shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),0_0_0_0.5px_rgba(255,255,255,0.1)]
      "
    >
      {/* Imagen con zoom lento (Ken Burns al pasar el ratón) */}
      <img
        src={backgroundImage}
        alt={anime.title.romaji}
        className="
          absolute inset-0 w-full h-full object-cover
          transition-transform duration-[2200ms] ease-mac
          group-hover:scale-[1.06]
        "
        decoding="async"
      />

      {/* Capas de tinte: legibilidad + luna de sangre */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#09050a] via-[#09050a]/75 via-40% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#09050a] via-[#09050a]/55 to-transparent" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(520px 420px at 92% 8%, rgba(255,61,90,0.30), transparent 62%)',
        }}
      />

      {/* Ensō decorativo */}
      <svg
        viewBox="0 0 300 300"
        className="absolute -right-24 -top-28 w-[420px] h-[420px] opacity-[0.22] pointer-events-none -rotate-[20deg]"
        fill="none"
      >
        <circle
          cx="150" cy="150" r="130"
          stroke="#ff8fa8" strokeWidth="7" strokeLinecap="round"
          pathLength="1000" strokeDasharray="860 140"
        />
      </svg>

      <Petals count={9} mode="loop" className="opacity-80" />

      {/* Contenido */}
      <div className="absolute inset-0 flex flex-col justify-end p-9 xl:p-12">
        <div className="max-w-[620px] animate-rise-in">
          {/* Etiquetas */}
          <div className="flex items-center gap-2 mb-4">
            <span className="flex items-center gap-1.5 h-[22px] px-2.5 rounded-full text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white bg-primary/90 shadow-moon">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              {anime.status === 'RELEASING' ? 'En emisión' : 'Destacado'}
            </span>
            {score && (
              <span className="flex items-center gap-1 h-[22px] px-2.5 rounded-full text-[11.5px] font-semibold text-white bg-white/10 ring-[0.5px] ring-white/20">
                <span className="material-symbols-outlined filled text-primary text-[13px]">star</span>
                {score}
              </span>
            )}
          </div>

          {/* Título */}
          <h1 className="font-headline text-[40px] xl:text-[60px] font-bold leading-[1.02] tracking-[-0.035em] text-white [text-shadow:0_4px_40px_rgba(0,0,0,0.6)] line-clamp-2">
            {anime.title.english || anime.title.romaji}
          </h1>

          {/* Meta */}
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-3 text-[13px] text-on-surface-variant font-medium">
            {meta.map((m, i) => (
              <React.Fragment key={m}>
                {i > 0 && <span className="text-muted/60">·</span>}
                <span>{m}</span>
              </React.Fragment>
            ))}
          </div>

          {/* Géneros */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            {anime.genres.slice(0, 4).map((genre) => (
              <span
                key={genre}
                className="h-6 px-2.5 inline-flex items-center rounded-full text-[11.5px] font-medium text-on-surface-variant bg-white/[0.07] hairline"
              >
                {GENRE_I18N[genre] || genre}
              </span>
            ))}
          </div>

          {/* Sinopsis */}
          {anime.description && (
            <p className="mt-4 text-[14.5px] leading-relaxed text-on-surface/80 line-clamp-2 max-w-[560px]">
              {anime.description.replace(/<[^>]*>/g, '')}
            </p>
          )}

          {/* CTA */}
          <div className="flex items-center gap-3 mt-6">
            <button className="btn-moon h-[44px] px-6 rounded-full flex items-center gap-2 font-semibold text-[14.5px]">
              <span className="material-symbols-outlined filled text-[22px] -ml-1">play_arrow</span>
              Ver ahora
            </button>
            <button className="btn-glass h-[44px] px-5 rounded-full flex items-center gap-2 font-medium text-[14.5px]">
              <span className="material-symbols-outlined text-[20px] opacity-90">info</span>
              Detalles
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
