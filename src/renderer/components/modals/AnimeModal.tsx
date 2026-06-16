import React, { useEffect, useMemo, useState } from 'react';
import { AniListAnime, AniZipEpisode, PlayMode, AnimeRelationNode, RelationType } from '../../../types/types';
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
  onSelectRelation?: (animeId: number) => Promise<void>;
}

const GENRE_I18N: Record<string, string> = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama',
  Fantasy: 'Fantasía', Horror: 'Terror', Mecha: 'Mecha', Mystery: 'Misterio',
  Romance: 'Romance', 'Sci-Fi': 'Ciencia Ficción', Thriller: 'Suspense',
  Sports: 'Deportes', 'Slice of Life': 'Recuentos de la Vida', 
  Supernatural: 'Sobrenatural', Music: 'Música',
};

const RELATION_LABEL: Record<RelationType | string, string> = {
  SEQUEL:      'Secuela',
  PREQUEL:     'Precuela',
  SIDE_STORY:  'Historia paralela',
  SPIN_OFF:    'Spin-off',
  ALTERNATIVE: 'Alternativo',
  PARENT:      'Obra original',
  SUMMARY:     'Resumen',
  ADAPTATION:  'Adaptación',
  SOURCE:      'Fuente',
  CHARACTER:   'Personaje',
  COMPILATION: 'Recopilación',
  CONTAINS:    'Contiene',
  OTHER:       'Relacionado',
};

const RELATION_COLOR: Record<RelationType | string, string> = {
  SEQUEL:      'bg-violet-500/20 text-violet-300 border-violet-500/30',
  PREQUEL:     'bg-blue-500/20 text-blue-300 border-blue-500/30',
  SIDE_STORY:  'bg-teal-500/20 text-teal-300 border-teal-500/30',
  SPIN_OFF:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  ALTERNATIVE: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  PARENT:      'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  default:     'bg-surface-variant/40 text-on-surface-variant border-surface-variant/50',
};

// Episodios renderizados por lote. Evita congelar el modal al abrir animes
// con cientos/miles de episodios (p.ej. One Piece) creando todo el DOM de golpe.
const EPISODE_BATCH = 60;

export default function AnimeModal({ anime: initialAnime, onClose, onPlay, onSelectRelation }: AnimeModalProps) {
  const [anime, setAnime] = useState<AniListAnime>(initialAnime);
  const [lastWatchedEp, setLastWatchedEp] = useState<number | null>(null);
  const [navigatingTo, setNavigatingTo] = useState<number | null>(null);
  const [visibleEpisodes, setVisibleEpisodes] = useState(EPISODE_BATCH);
  const [sortDesc, setSortDesc] = useState(false);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const { episodes, loading } = useAnimeInfo(anime.id);
  const { updateListStatus } = useAniList();
  const token = useAppStore((s) => s.token);

  // Lista ordenada (asc/desc). Útil en series muy largas para ir al más reciente.
  const sortedEpisodes = useMemo(
    () => (sortDesc ? [...episodes].reverse() : episodes),
    [episodes, sortDesc]
  );

  // Filtrado por número o título del episodio
  const filteredEpisodes = useMemo(() => {
    const q = episodeQuery.trim().toLowerCase();
    if (!q) return sortedEpisodes;
    return sortedEpisodes.filter(
      (e) =>
        String(e.episodeNumber).includes(q) ||
        (e.title?.en ?? '').toLowerCase().includes(q)
    );
  }, [sortedEpisodes, episodeQuery]);

  // Sincronizar estado interno cuando cambia el anime (navegación por relaciones)
  useEffect(() => {
    setAnime(initialAnime);
    setVisibleEpisodes(EPISODE_BATCH);
    setSortDesc(false);
    setEpisodeQuery('');
  }, [initialAnime.id]);

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
          {navigatingTo ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container/50">
              <Spinner size={32} />
              <span className="text-sm text-on-surface-variant mt-4 font-label">Cargando...</span>
            </div>
          ) : (
            <img
              src={anime.coverImage.extraLarge || anime.coverImage.large}
              alt={anime.title.romaji}
              className="w-full h-full object-cover"
            />
          )}
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

          {/* Episodes List + Relations — scrollable together */}
          <div className="flex-1 mt-5 px-6 pb-4 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h3 className="text-sm font-headline font-semibold text-on-surface">
                Episodios
                {episodes.length > 0 && (
                  <span className="ml-2 text-on-surface-variant/60 font-normal">{episodes.length}</span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {episodes.length > 4 && (
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-[15px] pointer-events-none">search</span>
                    <input
                      type="text"
                      value={episodeQuery}
                      onChange={(e) => setEpisodeQuery(e.target.value)}
                      placeholder="Buscar episodio..."
                      className="w-36 sm:w-44 pl-7 pr-2 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-label placeholder:text-on-surface-variant/50 border border-surface-variant/20 focus:border-primary/40 outline-none transition-colors"
                    />
                    {episodeQuery && (
                      <button
                        onClick={() => setEpisodeQuery('')}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface"
                        title="Limpiar"
                      >
                        <span className="material-symbols-outlined text-[15px]">close</span>
                      </button>
                    )}
                  </div>
                )}
                {episodes.length > 1 && (
                  <button
                    onClick={() => setSortDesc((d) => !d)}
                    className="flex items-center gap-1 text-xs font-label text-on-surface-variant hover:text-primary transition-colors flex-none"
                    title="Cambiar orden"
                  >
                    <span className="material-symbols-outlined text-[16px]">swap_vert</span>
                    {sortDesc ? 'Más reciente' : 'Más antiguo'}
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size={28} />
              </div>
            ) : episodes.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-on-surface-variant/60 py-8 px-2 text-center">
                  No hay episodios disponibles para este anime
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-thin">
                {/* Episodios — cuadrícula estilo Crunchyroll */}
                {(() => {
                  const isFiltering = episodeQuery.trim().length > 0;
                  const lastWatchedIdx = lastWatchedEp
                    ? sortedEpisodes.findIndex((e) => e.episodeNumber === lastWatchedEp)
                    : -1;
                  const sliceEnd = Math.max(visibleEpisodes, lastWatchedIdx >= 0 ? lastWatchedIdx + 6 : 0);
                  // Al buscar mostramos todas las coincidencias; sin buscar, por lotes
                  // para no congelar el modal en series muy largas.
                  const shown = isFiltering
                    ? filteredEpisodes.slice(0, 300)
                    : sortedEpisodes.slice(0, sliceEnd);
                  const remaining = isFiltering ? 0 : sortedEpisodes.length - shown.length;
                  const seriesTitle = anime.title.english || anime.title.romaji;
                  if (isFiltering && filteredEpisodes.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 gap-2 text-on-surface-variant/60">
                        <span className="material-symbols-outlined text-4xl">search_off</span>
                        <p className="text-sm text-center">No se encontró ningún episodio para «{episodeQuery}»</p>
                      </div>
                    );
                  }
                  return (
                    <>
                      <div className="grid gap-x-3 gap-y-5 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                        {shown.map((ep) => {
                          const isLast = ep.episodeNumber === lastWatchedEp;
                          const dur = ep.length || anime.duration;
                          return (
                            <div
                              key={ep.episodeNumber}
                              onClick={() => onPlay(ep.episodeNumber, 'sub')}
                              role="button"
                              tabIndex={0}
                              className="group flex flex-col text-left cursor-pointer"
                            >
                              <div className={`relative w-full aspect-video rounded-lg overflow-hidden bg-surface-container ${isLast ? 'ring-2 ring-primary' : ''}`}>
                                <img
                                  src={ep.image || fallbackImage}
                                  alt={`Ep ${ep.episodeNumber}`}
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  loading="lazy"
                                />
                                {/* Play overlay */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/45 transition-opacity duration-200">
                                  <span className="material-symbols-outlined filled text-white text-4xl drop-shadow-lg">play_circle</span>
                                </div>
                                {/* Duration badge */}
                                {dur && (
                                  <span className="absolute bottom-1.5 right-1.5 text-[10px] font-bold text-white bg-black/75 px-1.5 py-0.5 rounded">
                                    {dur}m
                                  </span>
                                )}
                                {/* Last-watched marker */}
                                {isLast && (
                                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold text-on-primary bg-primary px-1.5 py-0.5 rounded uppercase tracking-wide">
                                    Visto
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 text-[10px] text-on-surface-variant/50 font-label uppercase tracking-wide truncate">
                                {seriesTitle}
                              </p>
                              <p className={`text-[13px] font-headline font-semibold leading-tight line-clamp-2 transition-colors ${isLast ? 'text-primary' : 'text-on-surface group-hover:text-primary'}`}>
                                E{ep.episodeNumber}{ep.title?.en ? ` - ${ep.title.en}` : ''}
                              </p>
                            </div>
                          );
                        })}
                      </div>

                      {remaining > 0 && (
                        <button
                          onClick={() => setVisibleEpisodes(sliceEnd + EPISODE_BATCH * 2)}
                          className="mt-5 w-full py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-variant/10 hover:border-primary/30 text-xs font-label font-semibold text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[18px]">expand_more</span>
                          Cargar más episodios ({remaining} restantes)
                        </button>
                      )}
                    </>
                  );
                })()}

                {/* Relations Section — dentro del mismo scroll */}
                {(() => {
                  const animeRelations = anime.relations?.edges?.filter(
                    (e) => e.node.type === 'ANIME' && e.relationType !== 'CHARACTER' && e.relationType !== 'ADAPTATION'
                  ) || [];
                  if (animeRelations.length === 0) return null;
                  return (
                    <div className="mt-6 pt-4 border-t border-surface-variant/20">
                      <h3 className="text-sm font-headline font-semibold text-on-surface mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-base">account_tree</span>
                        Relacionados
                      </h3>
                      <div className="flex flex-col gap-2">
                        {animeRelations.map((edge) => {
                          const rel = edge.node;
                          const label = RELATION_LABEL[edge.relationType] ?? RELATION_LABEL.OTHER;
                          const colorClass = RELATION_COLOR[edge.relationType] ?? RELATION_COLOR.default;
                          const relTitle = rel.title.english || rel.title.romaji;
                          return (
                            <button
                              key={`${edge.relationType}-${rel.id}`}
                              disabled={navigatingTo !== null}
                              onClick={async () => {
                                if (onSelectRelation) {
                                  setNavigatingTo(rel.id);
                                  try {
                                    await onSelectRelation(rel.id);
                                  } finally {
                                    setNavigatingTo(null);
                                  }
                                }
                              }}
                              className={`
                                group flex items-center gap-3 w-full text-left
                                rounded-lg p-2
                                bg-surface-container-high hover:bg-surface-container-highest
                                transition-all duration-200 hover:scale-[1.01]
                                border border-surface-variant/10 hover:border-primary/20
                                ${navigatingTo === rel.id ? 'opacity-50 pointer-events-none' : ''}
                              `}
                            >
                              {/* Portada */}
                              <div className="relative w-12 h-16 flex-none rounded-md overflow-hidden bg-surface-container">
                                <img
                                  src={rel.coverImage.large}
                                  alt={relTitle}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              </div>

                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-label font-medium text-on-surface line-clamp-2 group-hover:text-primary transition-colors duration-200">
                                  {relTitle}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className={`text-[10px] font-label font-semibold px-1.5 py-0.5 rounded border ${colorClass}`}>
                                    {label}
                                  </span>
                                  {rel.format && (
                                    <span className="text-[10px] text-on-surface-variant/60">
                                      {rel.format.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                  {rel.episodes && (
                                    <span className="text-[10px] text-on-surface-variant/60">
                                      {rel.episodes} ep.
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Score + arrow */}
                              <div className="flex flex-col items-end gap-1 flex-none">
                                {rel.averageScore && (
                                  <span className="text-xs text-on-surface-variant flex items-center gap-0.5">
                                    <span className="material-symbols-outlined filled text-primary text-[12px]">star</span>
                                    {(rel.averageScore / 10).toFixed(1)}
                                  </span>
                                )}
                                <span className="material-symbols-outlined text-on-surface-variant/40 text-base group-hover:text-primary/60 transition-colors duration-200">
                                  chevron_right
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
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
