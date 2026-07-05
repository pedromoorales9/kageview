import React, { useEffect, useState } from 'react';
import { AniListAnime } from '../../types/types';
import useAniList from '../hooks/useAniList';
import HeroBanner from '../components/anime/HeroBanner';
import AnimeRow from '../components/anime/AnimeRow';
import ContinueWatchingRow from '../components/anime/ContinueWatchingRow';
import Spinner from '../components/ui/Spinner';
import { useAppStore } from '../../modules/store';
import { getCache, setCache } from '../../modules/cache';
import { isAniListDown } from '../../modules/anilist/client';
import {
  ContinueWatchingItem,
  getContinueWatching,
  removeHistoryEntry,
} from '../../modules/watchHistory';

const GENRE_I18N: Record<string, string> = {
  Action: 'Acción', Adventure: 'Aventura', Comedy: 'Comedia', Drama: 'Drama',
  Fantasy: 'Fantasía', Horror: 'Terror', Mecha: 'Mecha', Mystery: 'Misterio',
  Romance: 'Romance', 'Sci-Fi': 'Ciencia Ficción', Thriller: 'Suspense',
  Sports: 'Deportes', 'Slice of Life': 'Recuentos de la Vida', 
  Supernatural: 'Sobrenatural', Music: 'Música',
};

interface DiscoverPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
  onResume: (item: ContinueWatchingItem) => void;
}

/** Último catálogo bueno, persistido para cuando AniList no responda. */
interface DiscoverCache {
  trending: AniListAnime[];
  seasonal: AniListAnime[];
  topRated: AniListAnime[];
  savedAt: number;
}

/** "hace 2 h", "hace 3 días"… para el banner de catálogo guardado. */
function timeAgo(ts: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

// Devuelve la temporada actual según el mes
function getCurrentSeason(): { season: string; year: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 3) return { season: 'WINTER', year };
  if (month <= 6) return { season: 'SPRING', year };
  if (month <= 9) return { season: 'SUMMER', year };
  return { season: 'FALL', year };
}

export default function DiscoverPage({ onSelectAnime, onResume }: DiscoverPageProps) {
  const { getTrending, getSeasonal, getTopRated, getUserList, searchAnime } = useAniList();
  const user = useAppStore((s) => s.user);
  const [recommended, setRecommended] = useState<{ anime: AniListAnime[]; genre: string } | null>(null);
  const [trending, setTrending] = useState<AniListAnime[]>([]);
  const [seasonal, setSeasonal] = useState<AniListAnime[]>([]);
  const [topRated, setTopRated] = useState<AniListAnime[]>([]);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Timestamp del catálogo cacheado que se está mostrando (null = datos frescos)
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const [apiDown, setApiDown] = useState(false);

  // Cargar "Continuar viendo" al montar (se refresca al volver del reproductor,
  // ya que la página se desmonta mientras el player está activo).
  useEffect(() => {
    let cancelled = false;
    getContinueWatching().then((items) => {
      if (!cancelled) setContinueWatching(items);
    });
    return () => { cancelled = true; };
  }, []);

  const handleRemoveContinue = async (item: ContinueWatchingItem) => {
    // sourceEpisode es la entrada real del historial que originó el item
    // (difiere de `episode` cuando el anterior terminó y sugerimos el siguiente).
    await removeHistoryEntry(item.anime.id, item.sourceEpisode);
    setContinueWatching((prev) => prev.filter((i) => i.anime.id !== item.anime.id));
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { season, year } = getCurrentSeason();
        const [t, s, tr] = await Promise.all([
          getTrending(1, 40),
          getSeasonal(season, year, 1, 40),
          getTopRated(1, 20),
        ]);
        if (!cancelled) {
          setTrending(t);
          setSeasonal(s);
          setTopRated(tr);
          setStaleSince(null);
          // Guardar como último catálogo bueno (fire-and-forget)
          setCache('discoverCache', {
            trending: t,
            seasonal: s,
            topRated: tr,
            savedAt: Date.now(),
          } satisfies DiscoverCache);
        }
      } catch (err) {
        console.error('[DiscoverPage] Error loading data:', err);
        if (cancelled) return;

        // Modo degradado: mostrar el último catálogo bueno si existe
        const cached = await getCache<DiscoverCache>('discoverCache');
        if (cancelled) return;
        if (cached && cached.trending?.length) {
          setTrending(cached.trending);
          setSeasonal(cached.seasonal ?? []);
          setTopRated(cached.topRated ?? []);
          setStaleSince(cached.savedAt);
        } else {
          setApiDown(isAniListDown(err));
          setError(err instanceof Error ? err.message : 'Failed to load data from AniList');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Inteligencia Artificial / Algoritmo de Recomendación
  useEffect(() => {
    let cancelled = false;
    async function loadRecommended() {
      if (!user) {
        if (!cancelled) setRecommended(null);
        return;
      }
      try {
        // Cargar TODOS los animes del usuario de golpe (para evitar crashes 404 de AniList si un status está vacío)
        const allLists = await getUserList();
        
        // Filtrar localmente solo los Vistos o Viendo
        const allItems = allLists.filter((a) => {
          const status = a.mediaListEntry?.status;
          return status === 'COMPLETED' || status === 'CURRENT' || status === 'REPEATING';
        });
        
        if (allItems.length === 0) return;

        // Frecuencia de géneros
        const genreCounts: Record<string, number> = {};
        allItems.forEach((anime) => {
          anime.genres?.forEach((g: string) => {
            genreCounts[g] = (genreCounts[g] || 0) + 1;
          });
        });

        // Averiguar género superior
        let topGenre = '';
        let maxCount = 0;
        Object.entries(genreCounts).forEach(([genre, count]) => {
          if (count > maxCount) {
            maxCount = count;
            topGenre = genre;
          }
        });

        if (topGenre && !cancelled) {
          // Extraer las joyas de ese género
          const recom = await searchAnime('', 1, 30, [topGenre]);
          // Filtrar las que el usuario ya conoce
          const watchedIds = new Set(allItems.map((a: AniListAnime) => a.id));
          const freshRecom = recom.filter((a: AniListAnime) => !watchedIds.has(a.id));
          if (!cancelled) setRecommended({ anime: freshRecom, genre: topGenre });
        }
      } catch (err) {
        console.error('[DiscoverPage] Error calculando recomendaciones:', err);
      }
    }
    loadRecommended();
    return () => { cancelled = true; };
  }, [user, getUserList, searchAnime]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Spinner size={40} />
        <p className="text-on-surface-variant text-sm font-label">
          Cargando anime desde AniList...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
        <span className="material-symbols-outlined text-secondary text-5xl">cloud_off</span>
        <h2 className="font-headline text-xl font-bold text-on-surface">
          {apiDown ? 'AniList no disponible' : 'Error de Conexión'}
        </h2>
        <p className="text-on-surface-variant text-sm text-center max-w-md">
          {error}
        </p>
        <button
          onClick={() => { setError(null); setApiDown(false); setLoading(true); setReloadKey((k) => k + 1); }}
          className="mt-4 px-6 py-2 rounded-full bg-primary/20 text-primary font-label text-sm hover:bg-primary/30 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const heroAnime = trending[0];
  const isEmpty = trending.length === 0 && seasonal.length === 0 && topRated.length === 0;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
        <span className="material-symbols-outlined text-primary text-5xl">explore</span>
        <h2 className="font-headline text-xl font-bold text-on-surface">
          No se encontró Anime
        </h2>
        <p className="text-on-surface-variant text-sm text-center max-w-md">
          No se ha podido cargar el catálogo de anime. Revisa tu conexión a internet e inténtalo de nuevo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-8 pb-8 px-1">
      {/* Aviso de modo degradado: AniList caído, catálogo guardado */}
      {staleSince !== null && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/10 border border-secondary/25">
          <span className="material-symbols-outlined text-secondary text-xl">cloud_off</span>
          <p className="flex-1 text-xs text-on-surface-variant leading-snug">
            <span className="font-semibold text-on-surface">AniList no responde ahora mismo.</span>{' '}
            Estás viendo el último catálogo guardado ({timeAgo(staleSince)}). La reproducción
            de episodios y el manga funcionan con normalidad.
          </p>
          <button
            onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}
            className="flex-none px-3 py-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary text-xs font-semibold transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Continuar viendo */}
      <ContinueWatchingRow
        items={continueWatching}
        onResume={onResume}
        onRemove={handleRemoveContinue}
      />

      {/* Hero Banner */}
      {heroAnime && (
        <HeroBanner anime={heroAnime} onClick={() => onSelectAnime(heroAnime)} />
      )}

      {/* Trending Now */}
      <AnimeRow
        title="En Tendencia"
        animes={trending.slice(1)}
        onSelect={onSelectAnime}
      />

      {/* Recommended for You */}
      {recommended && recommended.anime.length > 0 && (
        <div className="bg-gradient-to-r from-primary/10 to-transparent p-4 rounded-2xl border border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 blur-[100px] pointer-events-none" />
          <AnimeRow
            title="Recomendado para ti"
            animes={recommended.anime}
            onSelect={onSelectAnime}
            badge={
              <span className="text-xs text-on-surface-variant font-label">
                Basado en{' '}
                <span className="text-primary font-bold uppercase tracking-widest">
                  {GENRE_I18N[recommended.genre] || recommended.genre}
                </span>
              </span>
            }
          />
        </div>
      )}

      {/* New This Season */}
      <AnimeRow
        title="Nuevos de Temporada"
        animes={seasonal}
        onSelect={onSelectAnime}
      />

      {/* Top Rated */}
      <AnimeRow
        title="Mejor Valorados"
        animes={topRated}
        onSelect={onSelectAnime}
      />
    </div>
  );
}
