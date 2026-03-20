import React from 'react';
import { AniListAnime } from '../../../types/types';
import Badge from '../ui/Badge';

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

  return (
    <div
      id="hero-banner"
      className="
        relative w-full h-[380px] rounded-2xl overflow-hidden
        cursor-pointer group
      "
      onClick={onClick}
    >
      {/* Background image */}
      <img
        src={backgroundImage}
        alt={anime.title.romaji}
        className="
          absolute inset-0 w-full h-full object-cover
          transition-transform duration-700 group-hover:scale-[1.03]
        "
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-8 flex flex-col gap-3">
        {/* Badges */}
        <div className="flex items-center gap-2">
          {anime.status === 'RELEASING' && (
            <Badge variant="primary" size="md">EN EMISIÓN</Badge>
          )}
          {studio && (
            <Badge variant="neutral" size="md">{studio}</Badge>
          )}
          {anime.averageScore && (
            <Badge variant="neutral" size="md">
              <span className="material-symbols-outlined filled text-primary text-[12px]">
                star
              </span>
              {(anime.averageScore / 10).toFixed(1)}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h1 className="font-headline text-3xl font-bold text-on-surface leading-tight max-w-xl">
          {anime.title.english || anime.title.romaji}
        </h1>

        {/* Genres */}
        <div className="flex items-center gap-2 flex-wrap">
          {anime.genres.slice(0, 4).map((genre) => (
            <span
              key={genre}
              className="text-xs text-on-surface-variant font-label bg-surface-variant/30 px-2.5 py-0.5 rounded-full"
            >
              {GENRE_I18N[genre] || genre}
            </span>
          ))}
          {anime.episodes && (
            <span className="text-xs text-on-surface-variant">
              · {anime.episodes} episodios
            </span>
          )}
        </div>

        {/* Description (truncated) */}
        {anime.description && (
          <p className="text-sm text-on-surface-variant/80 line-clamp-2 max-w-lg leading-relaxed">
            {anime.description.replace(/<[^>]*>/g, '')}
          </p>
        )}

        {/* CTA */}
        <div className="flex items-center gap-3 mt-1">
          <button className="
            flex items-center gap-2 px-6 py-2.5
            gradient-primary rounded-full
            text-on-primary font-headline font-semibold text-sm
            transition-all duration-200
            hover:shadow-[0_0_22px_rgba(203,151,255,0.35)]
            hover:scale-[1.02]
          ">
            <span className="material-symbols-outlined filled text-lg">play_arrow</span>
            Ver Ahora
          </button>
          <button className="
            flex items-center gap-2 px-5 py-2.5
            bg-surface-variant/40 backdrop-blur-md rounded-full
            text-on-surface font-headline font-medium text-sm
            transition-all duration-200
            hover:bg-surface-variant/60
          ">
            <span className="material-symbols-outlined text-lg">info</span>
            Detalles
          </button>
        </div>
      </div>
    </div>
  );
}
