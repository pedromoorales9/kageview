import React, { useEffect, useMemo, useState } from 'react';
import { MangaModel, DEFAULT_PROVIDER_ID, getAllMangaProviders, getMangaProvider } from '../../modules/manga';
import { useAppStore } from '../../modules/store';
import MangaRow from '../components/manga/MangaRow';
import MangaCard from '../components/manga/MangaCard';
import MangaHero from '../components/manga/MangaHero';
import Spinner from '../components/ui/Spinner';

interface MangaPageProps {
  onSelectManga: (manga: MangaModel) => void;
}

export default function MangaPage({ onSelectManga }: MangaPageProps) {
  const [popular, setPopular] = useState<MangaModel[]>([]);
  const [recent, setRecent] = useState<MangaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdult, setShowAdult] = useState(false);
  const prefs = useAppStore((s) => s.prefs);
  const remoteConfig = useAppStore((s) => s.remoteConfig);

  const enabledProviders = useMemo(
    () => getAllMangaProviders().filter(
      (p) =>
        prefs.mangaProvidersEnabled?.[p.id] !== false &&
        // Kill-switch remoto del dev (remote-config.json)
        !remoteConfig?.providersDisabled?.[p.id]
    ),
    [prefs.mangaProvidersEnabled, remoteConfig]
  );

  const [activeProviderId, setActiveProviderId] = useState(() => {
    const preferred = enabledProviders.find(p => p.id === prefs.preferredMangaProvider);
    return preferred?.id || enabledProviders.find(p => p.id === DEFAULT_PROVIDER_ID)?.id || enabledProviders[0]?.id || DEFAULT_PROVIDER_ID;
  });

  useEffect(() => {
    const disabledByUser = prefs.mangaProvidersEnabled?.[activeProviderId] === false;
    const disabledRemotely = !!remoteConfig?.providersDisabled?.[activeProviderId];
    if (disabledByUser || disabledRemotely) {
      const nextId = enabledProviders[0]?.id;
      if (nextId) setActiveProviderId(nextId);
    }
  }, [prefs.mangaProvidersEnabled, remoteConfig, activeProviderId, enabledProviders]);

  useEffect(() => {
    const preferred = prefs.preferredMangaProvider;
    if (preferred && prefs.mangaProvidersEnabled?.[preferred] !== false) {
      setActiveProviderId(preferred);
    }
  }, [prefs.preferredMangaProvider]);

  // Search state
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MangaModel[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function load() {
      try {
        const provider = getMangaProvider(activeProviderId);
        const [pop, rec] = await Promise.all([provider.getPopularManga(), provider.getRecentlyUpdatedManga()]);
        if (!cancelled) {
          setPopular(pop);
          setRecent(rec);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error cargando manga');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeProviderId, reloadKey]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const provider = getMangaProvider(activeProviderId);
        const results = await provider.searchManga(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [query, activeProviderId]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Spinner size={40} />
        <p className="text-on-surface-variant text-sm font-label">
          Cargando manga...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
        <span className="material-symbols-outlined text-secondary text-5xl">cloud_off</span>
        <h2 className="font-headline text-xl font-bold text-on-surface">Error de Conexión</h2>
        <p className="text-on-surface-variant text-sm text-center max-w-md">{error}</p>
        <button
          onClick={() => { setError(null); setReloadKey((k) => k + 1); }}
          className="mt-4 px-6 py-2 rounded-full bg-primary/20 text-primary font-label text-sm hover:bg-primary/30 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-8 pb-8 px-1">
      {/* Search bar and Provider Selector */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-full max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px] pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar manga en español..."
          className="
            w-full pl-9 pr-4 py-2.5 rounded-xl
            bg-surface-container-high text-on-surface text-sm font-label
            placeholder:text-on-surface-variant/50
            border border-surface-variant/20 focus:border-primary/40
            outline-none transition-colors duration-200
          "
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Spinner size={16} />
          </div>
        )}
        </div>
        
        <select
          value={activeProviderId}
          onChange={(e) => setActiveProviderId(e.target.value)}
          className="
            px-4 py-2.5 rounded-xl
            bg-surface-container-high text-on-surface text-sm font-label
            border border-surface-variant/20 focus:border-primary/40
            outline-none transition-colors duration-200 cursor-pointer
          "
        >
          {enabledProviders.length > 0 ? (
            enabledProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))
          ) : (
            <option disabled value="">Sin proveedores habilitados</option>
          )}
        </select>

        {/* 18+ Filter Toggle */}
        <button
          onClick={() => setShowAdult(!showAdult)}
          className={`
            flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-label transition-colors duration-200
            ${showAdult 
              ? 'bg-error/20 text-error border border-error/50 shadow-[0_0_15px_rgba(255,84,73,0.2)]' 
              : 'bg-surface-container-high text-on-surface-variant border border-surface-variant/20 hover:bg-surface-variant/30 hover:text-on-surface'
            }
          `}
        >
          <span className="material-symbols-outlined text-[18px]">
            {showAdult ? 'visibility' : 'visibility_off'}
          </span>
          Contenido +18
        </button>
      </div>

      {/* Filter lists based on the Adult flag */}
      {(() => {
        const filteredPopular = popular.filter(m => showAdult || !m.isAdult);
        const filteredRecent = recent.filter(m => showAdult || !m.isAdult);
        const filteredSearch = searchResults.filter(m => showAdult || !m.isAdult);

        // Destacado = primer popular CON portada (así el banner nunca queda en blanco)
        const heroManga = filteredPopular.find((m) => m.coverUrl) ?? filteredPopular[0];
        const rowPopular = filteredPopular.filter((m) => m !== heroManga);

        return (
          <>
            {/* Search results */}
            {isSearching ? (
              <section>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <h2 className="font-headline text-lg font-bold text-on-surface">
                    Resultados para "{query}"
                  </h2>
                  {!searching && (
                    <span className="text-xs text-on-surface-variant font-label">
                      {filteredSearch.length} encontrados
                    </span>
                  )}
                </div>

                {searching ? (
                  <div className="flex justify-center py-12">
                    <Spinner size={32} />
                  </div>
                ) : filteredSearch.length === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant text-4xl">search_off</span>
                    <p className="text-sm text-on-surface-variant">No se encontró manga apto con ese título</p>
                  </div>
                ) : (
                  <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
                    {filteredSearch.map((manga) => (
                      <MangaCard
                        key={manga.id}
                        manga={manga}
                        onClick={() => onSelectManga(manga)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* Hero destacado: primer popular CON portada (evita banners en blanco) */}
                {heroManga && (
                  <MangaHero
                    manga={heroManga}
                    onClick={() => onSelectManga(heroManga)}
                  />
                )}

                {/* Popular (excluye el destacado para no duplicarlo) */}
                <MangaRow
                  title="Populares en Español"
                  mangas={rowPopular}
                  onSelect={onSelectManga}
                />

                {/* Recently Updated */}
                <MangaRow
                  title="Actualizados Recientemente"
                  mangas={filteredRecent}
                  onSelect={onSelectManga}
                />
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
