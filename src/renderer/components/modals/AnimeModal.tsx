import React, { useEffect, useState } from 'react';
import { AniListAnime, AniZipEpisode, PlayMode } from '../../../types/types';
import useAnimeInfo from '../../hooks/useAnimeInfo';
import useAniList from '../../hooks/useAniList';
import { useAppStore } from '../../../modules/store';
import Badge from '../ui/Badge';
import Chip from '../ui/Chip';
import Spinner from '../ui/Spinner';

interface AnimeModalProps {
  anime: AniListAnime;
  onClose: () => void;
  onPlay: (episode: number, mode: PlayMode) => void;
}

const GENRE_I18N: Record<string, string> = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama',
  Fantasy: 'Fantasía', Horror: 'Terror', Mecha: 'Mecha', Mystery: 'Misterio',
  Romance: 'Romance', 'Sci-Fi': 'Ciencia Ficción', Thriller: 'Suspense',
  Sports: 'Deportes', 'Slice of Life': 'Recuentos de la Vida', 
  Supernatural: 'Sobrenatural', Music: 'Música',
};

export default function AnimeModal({ anime: initialAnime, onClose, onPlay }: AnimeModalProps) {
  const [anime, setAnime] = useState<AniListAnime>(initialAnime);
  const [lastWatchedEp, setLastWatchedEp] = useState<number | null>(null);
  const { episodes, loading } = useAnimeInfo(anime.id);
  const { updateListStatus } = useAniList();
  const token = useAppStore((s) => s.token);

  // Cargar último episodio visto desde local storage vía IPC
  useEffect(() => {
    if (window.electron?.getWatchProgress) {
      window.electron.getWatchProgress(anime.id).then(setLastWatchedEp);
    }
  }, [anime.id]);

  const studio = anime.studios?.nodes?.find((s) => s.isAnimationStudio)?.name;
  const cleanDescription = anime.description?.replace(/<[^>]*>/g, '') || 'Sin descripción disponible.';
  const fallbackImage = anime.bannerImage || anime.coverImage.extraLarge || anime.coverImage.large;

  // Cerrar con Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      id="anime-modal-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'anime-modal-overlay') onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/65 backdrop-blur-2xl" />

      {/* Modal Container */}
      <div className="
        relative z-10
        w-full max-w-5xl h-[88vh]
        bg-surface-container rounded-xl
        flex overflow-hidden
        animate-fade-in-scale
      ">
        {/* Left Panel — Cover Image */}
        <div className="relative w-[280px] flex-none">
          <img
            src={anime.coverImage.extraLarge || anime.coverImage.large}
            alt={anime.title.romaji}
            className="w-full h-full object-cover"
          />
          {/* Gradiente lateral */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-surface-container" />

          {/* Score badge */}
          {anime.averageScore && (
            <div className="absolute bottom-4 left-4">
              <Badge variant="neutral" size="md">
                <span className="material-symbols-outlined filled text-primary text-[14px]">star</span>
                {(anime.averageScore / 10).toFixed(1)}
              </Badge>
            </div>
          )}
        </div>

        {/* Right Panel — Info */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-0">
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg
                bg-surface-variant/40 flex items-center justify-center
                text-on-surface-variant hover:text-on-surface
                transition-colors duration-200"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>

            {/* Title */}
            <h2 className="font-headline text-2xl font-bold text-on-surface pr-10 leading-tight">
              {anime.title.english || anime.title.romaji}
            </h2>
            {anime.title.native && (
              <p className="text-sm text-on-surface-variant mt-1 font-label">
                {anime.title.native}
              </p>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {anime.averageScore && (
                <span className="text-xs text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined filled text-primary text-[14px]">star</span>
                  {anime.averageScore}%
                </span>
              )}
              {anime.episodes && (
                <span className="text-xs text-on-surface-variant">
                  {anime.episodes} episodios
                </span>
              )}
              {anime.duration && (
                <span className="text-xs text-on-surface-variant">
                  {anime.duration} min/ep
                </span>
              )}
              {anime.season && anime.seasonYear && (
                <span className="text-xs text-on-surface-variant">
                  {anime.season} {anime.seasonYear}
                </span>
              )}
            </div>

            {/* Genres */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {anime.genres.map((genre: string) => (
                <Chip key={genre}>{GENRE_I18N[genre] || genre}</Chip>
              ))}
            </div>

            {/* Synopsis */}
            <div className="mt-4 max-h-24 overflow-y-auto pr-2">
              <p className="text-sm text-on-surface-variant/80 leading-relaxed">
                {cleanDescription}
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex items-center gap-3 mt-5">
              {lastWatchedEp ? (
                <button
                  onClick={() => onPlay(lastWatchedEp, 'sub')}
                  className="
                    flex items-center gap-2 px-6 py-2.5
                    gradient-primary rounded-full
                    text-on-primary font-headline font-semibold text-sm
                    transition-all duration-200
                    hover:shadow-[0_0_22px_rgba(203,151,255,0.35)]
                    hover:scale-[1.02]
                  "
                >
                  <span className="material-symbols-outlined filled text-lg">play_arrow</span>
                  CONTINUAR EP. {lastWatchedEp}
                </button>
              ) : (
                <button
                  id="modal-watch-sub"
                  onClick={() => onPlay(1, 'sub')}
                  className="
                    flex items-center gap-2 px-6 py-2.5
                    gradient-primary rounded-full
                    text-on-primary font-headline font-semibold text-sm
                    transition-all duration-200
                    hover:shadow-[0_0_22px_rgba(203,151,255,0.35)]
                    hover:scale-[1.02]
                  "
                >
                  <span className="material-symbols-outlined filled text-lg">play_arrow</span>
                  VER SUBTITULADO
                </button>
              )}
              
              {/* Dropdown para estado en la lista AniList */}
              {token && (
                <select
                  className="
                    bg-surface-variant/40 text-on-surface rounded-full px-5 py-2.5 
                    text-sm font-headline outline-none cursor-pointer border border-transparent
                    focus:border-primary/50 hover:bg-surface-variant/70 transition-colors
                    appearance-none
                  "
                  style={{
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23cb97ff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 1rem center',
                    backgroundSize: '1em',
                    paddingRight: '2.5rem'
                  }}
                  value={anime.mediaListEntry?.status || ''}
                  onChange={async (e) => {
                    const newStatus = e.target.value;
                    if (newStatus) {
                      try {
                        // Actualizar UI optimista
                        const prevAnime = { ...anime };
                        setAnime({
                          ...anime,
                          mediaListEntry: {
                            ...anime.mediaListEntry,
                            id: anime.mediaListEntry?.id || 0,
                            status: newStatus as NonNullable<AniListAnime['mediaListEntry']>['status'],
                            progress: anime.mediaListEntry?.progress || 0,
                            score: anime.mediaListEntry?.score || 0
                          }
                        });
                        
                        await updateListStatus(anime.id, newStatus);
                      } catch (err) {
                        console.error('Error actualizando estado:', err);
                      }
                    }
                  }}
                >
                  <option value="" disabled>Añadir a lista...</option>
                  <option value="CURRENT" className="bg-surface">Viendo</option>
                  <option value="PLANNING" className="bg-surface">Por Ver</option>
                  <option value="COMPLETED" className="bg-surface">Completados</option>
                  <option value="PAUSED" className="bg-surface">Pausados</option>
                  <option value="DROPPED" className="bg-surface">Abandonados</option>
                </select>
              )}
            </div>
          </div>

          {/* Episodes List */}
          <div className="flex-1 mt-5 px-6 pb-4 overflow-hidden flex flex-col">
            <h3 className="text-sm font-headline font-semibold text-on-surface mb-3">
              Episodios
            </h3>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size={28} />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-thin">
                <div className="grid grid-cols-3 gap-3">
                  {episodes.map((ep) => (
                    <button
                      key={ep.episodeNumber}
                      onClick={() => onPlay(ep.episodeNumber, 'sub')}
                      className={`
                        group w-full flex flex-col text-left rounded-lg overflow-hidden
                        bg-surface-container-high hover:bg-surface-container-highest
                        transition-all duration-200
                        ${ep.episodeNumber === lastWatchedEp ? 'ring-2 ring-primary ring-inset' : ''}
                      `}
                    >
                      <div className="relative aspect-video bg-surface-container">
                        <img
                          src={ep.image || fallbackImage}
                          alt={`Ep ${ep.episodeNumber}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {/* Play icon on hover */}
                        <div className="
                          absolute inset-0 flex items-center justify-center
                          opacity-0 group-hover:opacity-100
                          bg-black/40 transition-opacity duration-200
                        ">
                          <span className="material-symbols-outlined filled text-white text-2xl">
                            play_arrow
                          </span>
                        </div>
                      </div>
                      <div className="p-2">
                        <p className={`text-xs font-label font-medium ${ep.episodeNumber === lastWatchedEp ? 'text-primary' : 'text-on-surface'}`}>
                          Episodio {ep.episodeNumber} {ep.episodeNumber === lastWatchedEp && '(Último visto)'}
                        </p>
                        {ep.title?.en && (
                          <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                            {ep.title.en}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}

                  {episodes.length === 0 && !loading && (
                    <p className="text-sm text-on-surface-variant/60 py-8">
                      No hay episodios disponibles
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 flex items-center gap-4 border-t border-surface-variant/20">
            {studio && (
              <span className="text-xs text-on-surface-variant">
                Estudio: <span className="text-on-surface">{studio}</span>
              </span>
            )}
            {anime.seasonYear && (
              <span className="text-xs text-on-surface-variant">{anime.seasonYear}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
