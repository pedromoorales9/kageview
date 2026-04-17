import React, { useEffect, useState } from 'react';
import { MangaModel, DEFAULT_PROVIDER_ID, getAllMangaProviders, getMangaProvider } from '../../modules/manga';
import { useAppStore } from '../../modules/store';
import MangaRow from '../components/manga/MangaRow';
import MangaCard from '../components/manga/MangaCard';
import Spinner from '../components/ui/Spinner';

interface MangaPageProps {
  onSelectManga: (manga: MangaModel) => void;
}

export default function MangaPage({ onSelectManga }: MangaPageProps) {
  const [popular, setPopular] = useState<MangaModel[]>([]);
  const [recent, setRecent] = useState<MangaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdult, setShowAdult] = useState(false);
  const prefs = useAppStore((s) => s.prefs);
  
  const enabledProviders = getAllMangaProviders().filter(
    (p) => prefs.mangaProvidersEnabled?.[p.id] !== false
  );

  const [activeProviderId, setActiveProviderId] = useState(() => {
    const preferred = enabledProviders.find(p => p.id === prefs.preferredMangaProvider);
    return preferred?.id || enabledProviders.find(p => p.id === DEFAULT_PROVIDER_ID)?.id || enabledProviders[0]?.id || DEFAULT_PROVIDER_ID;
  });

  useEffect(() => {
    if (prefs.mangaProvidersEnabled?.[activeProviderId] === false) {
      const nextId = enabledProviders[0]?.id;
      if (nextId) setActiveProviderId(nextId);
    }
  }, [prefs.mangaProvidersEnabled, activeProviderId, enabledProviders]);

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
  }, [activeProviderId]);

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
  }, [query]);

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
          onClick={() => { setLoading(true); setError(null); }}
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
                {/* Dynamic Hero Section using the top popular manga */}
                {filteredPopular.length > 0 && (
                  <section 
                    className="mt-2 mb-10 w-full relative h-[380px] lg:h-[450px] rounded-xl lg:rounded-3xl overflow-hidden cursor-pointer group shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)]"
                    onClick={() => onSelectManga(filteredPopular[0])}
                  >
                    {/* Blurred atmospheric background expanding the entire width */}
                    <div className="absolute inset-0 z-0">
                      <img 
                        src={filteredPopular[0].coverUrl} 
                        alt=""
                        className="w-full h-full object-cover opacity-30 blur-[60px] scale-150 saturate-[1.5]"
                      />
                    </div>

                    {/* The actual poster beautifully constrained securely in the background without stretching */}
                    <div className="absolute inset-0 z-10 flex justify-end md:justify-center lg:justify-end pr-0 lg:pr-32 xl:pr-48">
                      <img 
                        src={filteredPopular[0].coverUrl} 
                        alt=""
                        className="h-[120%] lg:h-[140%] -mt-10 max-w-none object-contain mask-image-linear-to-b opacity-80 mix-blend-screen transition-transform duration-1000 group-hover:scale-105"
                        style={{ maskImage: "radial-gradient(circle at center, black 40%, transparent 80%)", WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)" }}
                      />
                    </div>

                    {/* Gradient overlays to darken for text */}
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent z-20" />
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/50 lg:via-transparent to-transparent z-20" />

                    {/* Content Block */}
                    <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 flex flex-col gap-3 z-30">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-primary/20 backdrop-blur-md text-primary px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase shadow-lg border border-primary/20">
                          Top Tendencia
                        </span>
                        <span className="bg-surface-variant/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-on-surface tracking-widest uppercase">
                          Cap. {filteredPopular[0].lastChapter ?? '?'}
                        </span>
                        <span className="bg-surface-variant/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-tertiary tracking-widest uppercase">
                          {filteredPopular[0].status === 'ongoing' ? 'En Curso' : 'Finalizado'}
                        </span>
                      </div>

                      <h2 className="font-headline text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-on-surface leading-[1.05] max-w-4xl drop-shadow-2xl line-clamp-2">
                        {filteredPopular[0].title}
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
                )}

                {/* Popular (Sliced to avoid double-showing the Hero) */}
                <MangaRow
                  title="Populares en Español"
                  mangas={filteredPopular.length > 0 ? filteredPopular.slice(1) : []}
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
