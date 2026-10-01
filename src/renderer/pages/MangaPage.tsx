import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MangaGenre,
  MangaModel,
  MangaProvider,
  MangaSort,
  DEFAULT_PROVIDER_ID,
  ProviderSearchResult,
  getAllMangaProviders,
  providerLanguage,
  getMangaProvider,
  searchAllProviders,
} from '../../modules/manga';
import { MangaRecord } from '../../modules/manga/mangaStore';
import { useAppStore } from '../../modules/store';
import { usePagedList } from '../hooks/usePagedList';
import MangaRow from '../components/manga/MangaRow';
import MangaCard from '../components/manga/MangaCard';
import MangaHero from '../components/manga/MangaHero';
import ContinueReadingRow from '../components/manga/ContinueReadingRow';
import Spinner from '../components/ui/Spinner';

interface MangaPageProps {
  onSelectManga: (manga: MangaModel) => void;
  /** Abre el lector en el capítulo y la página guardados. */
  onContinueManga: (record: MangaRecord) => Promise<void>;
  /** Búsqueda pedida desde fuera (p. ej. «buscar en otras fuentes» de una ficha). */
  searchRequest?: { query: string; nonce: number } | null;
}

const ADULT_KEY = 'kageview.manga.showAdult';
const SORT_LABEL: Record<MangaSort, string> = {
  popular: 'Más populares',
  recent: 'Actualizados',
  rating: 'Mejor valorados',
  az: 'A – Z',
};
const GRID = 'grid gap-x-5 gap-y-7 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]';

const keyOf = (m: MangaModel) => `${m.sourceId}::${m.id}`;

function loadAdultPref(): boolean {
  try {
    return localStorage.getItem(ADULT_KEY) === '1';
  } catch {
    return false;
  }
}

function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="aspect-[3/4] rounded-[14px] bg-white/[0.05] animate-pulse" />
          <div className="h-3.5 rounded bg-white/[0.06] animate-pulse w-4/5" />
          <div className="h-3 rounded bg-white/[0.04] animate-pulse w-2/5" />
        </div>
      ))}
    </div>
  );
}

/** Al hacerse visible, pide la siguiente página (scroll infinito). */
function LoadMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) onMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, onMore]);

  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="flex justify-center py-6">
      {loading ? (
        <Spinner size={26} />
      ) : (
        <button onClick={onMore} className="btn-glass h-10 px-5 rounded-full text-[13.5px] font-medium">Cargar más</button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex-none h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-colors ${
        active ? 'bg-primary text-white shadow-moon' : 'bg-white/[0.07] text-on-surface-variant hover:bg-white/[0.13] hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
      <span className="material-symbols-outlined text-secondary text-5xl">cloud_off</span>
      <h2 className="font-headline text-lg font-bold text-white">No se pudo conectar</h2>
      <p className="text-[13.5px] text-on-surface-variant max-w-md">{message}</p>
      <button onClick={onRetry} className="btn-moon h-10 px-6 rounded-full text-[14px] font-semibold">Reintentar</button>
    </div>
  );
}

export default function MangaPage({ onSelectManga, onContinueManga, searchRequest }: MangaPageProps) {
  const prefs = useAppStore((s) => s.prefs);
  const remoteConfig = useAppStore((s) => s.remoteConfig);
  const [showAdult, setShowAdult] = useState(loadAdultPref);

  const enabledProviders = useMemo(
    () => getAllMangaProviders().filter(
      (p) => prefs.mangaProvidersEnabled?.[p.id] !== false && !remoteConfig?.providersDisabled?.[p.id]
    ),
    [prefs.mangaProvidersEnabled, remoteConfig]
  );

  const [activeProviderId, setActiveProviderId] = useState(() => {
    const preferred = enabledProviders.find((p) => p.id === prefs.preferredMangaProvider);
    return preferred?.id || enabledProviders.find((p) => p.id === DEFAULT_PROVIDER_ID)?.id || enabledProviders[0]?.id || DEFAULT_PROVIDER_ID;
  });

  // Si la fuente activa se desactiva (por el usuario o por el equipo), pasar a otra
  useEffect(() => {
    if (!enabledProviders.some((p) => p.id === activeProviderId) && enabledProviders[0]) {
      setActiveProviderId(enabledProviders[0].id);
    }
  }, [enabledProviders, activeProviderId]);

  useEffect(() => {
    const preferred = prefs.preferredMangaProvider;
    if (preferred && prefs.mangaProvidersEnabled?.[preferred] !== false) setActiveProviderId(preferred);
  }, [prefs.preferredMangaProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  const provider: MangaProvider = getMangaProvider(activeProviderId);

  // ─── Búsqueda ────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [searchAll, setSearchAll] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 450);
    return () => clearTimeout(t);
  }, [query]);

  // Búsqueda pedida desde otra pantalla: en todas las fuentes y sin esperar
  useEffect(() => {
    if (!searchRequest) return;
    setQuery(searchRequest.query);
    setDebounced(searchRequest.query.trim());
    setSearchAll(true);
  }, [searchRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Explorar (género, orden, "Ver todo") ────────────────
  const [genres, setGenres] = useState<MangaGenre[]>([]);
  const [genre, setGenre] = useState<string | null>(null);
  const [sort, setSort] = useState<MangaSort>('popular');
  const [expanded, setExpanded] = useState(false);

  const canBrowse = typeof provider.browse === 'function';
  const sortOptions: MangaSort[] = canBrowse ? ['popular', 'recent', 'rating', 'az'] : ['popular', 'recent'];

  useEffect(() => {
    setGenre(null);
    setSort('popular');
    setExpanded(false);
    setGenres([]);
    let cancelled = false;
    provider.getGenres?.().then((g) => { if (!cancelled) setGenres(g); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeProviderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const searching = debounced.length > 0;
  const browsing = !searching && (expanded || !!genre || sort !== 'popular');
  const home = !searching && !browsing;

  // Portada: populares y actualizados (primera página)
  const popular = usePagedList((p) => provider.getPopularManga(p), keyOf, provider.pageSize, [activeProviderId], home);
  const recent = usePagedList((p) => provider.getRecentlyUpdatedManga(p), keyOf, provider.pageSize, [activeProviderId], home);

  // Listado completo con paginación
  const browse = usePagedList(
    (page) =>
      provider.browse
        ? provider.browse({ genre: genre ?? undefined, sort, page })
        : sort === 'recent' ? provider.getRecentlyUpdatedManga(page) : provider.getPopularManga(page),
    keyOf,
    provider.pageSize,
    [activeProviderId, genre, sort],
    browsing
  );

  // Búsqueda en la fuente activa
  const found = usePagedList((page) => provider.searchManga(debounced, page), keyOf, provider.pageSize, [activeProviderId, debounced], searching && !searchAll);

  // Búsqueda en todas las fuentes
  const [allResults, setAllResults] = useState<ProviderSearchResult[] | null>(null);
  useEffect(() => {
    if (!searching || !searchAll) { setAllResults(null); return; }
    let cancelled = false;
    setAllResults(null);
    searchAllProviders(debounced, enabledProviders).then((r) => { if (!cancelled) setAllResults(r); });
    return () => { cancelled = true; };
  }, [searching, searchAll, debounced, enabledProviders]);

  const toggleAdult = () => {
    setShowAdult((v) => {
      try { localStorage.setItem(ADULT_KEY, v ? '0' : '1'); } catch { /* sin almacenamiento */ }
      return !v;
    });
  };
  const visible = (m: MangaModel) => showAdult || !m.isAdult;

  const goSeeAll = (s: MangaSort) => { setSort(s); setExpanded(true); };
  const backHome = () => { setGenre(null); setSort('popular'); setExpanded(false); };

  // ─── Cabecera (búsqueda + fuentes + filtros) ─────────────
  const header = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-xl">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-muted text-[19px] pointer-events-none">search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchAll ? 'Buscar en todas las fuentes…' : `Buscar en ${provider.name}…`}
            aria-label="Buscar manga"
            className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.06] text-white text-[14.5px] placeholder:text-muted outline-none shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] focus:bg-white/[0.09] focus:shadow-[inset_0_0_0_1.5px_rgba(255,61,90,0.7),0_0_0_4px_rgba(255,61,90,0.14)] transition-all"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10">
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleAdult}
          aria-pressed={showAdult}
          className={`flex-none h-11 px-4 rounded-xl text-[13.5px] font-medium flex items-center gap-2 transition-colors ${
            showAdult ? 'bg-error/15 text-error ring-1 ring-error/40' : 'bg-white/[0.06] text-on-surface-variant hover:text-white hover:bg-white/[0.11]'
          }`}
        >
          <span className="material-symbols-outlined text-[19px]">{showAdult ? 'visibility' : 'visibility_off'}</span>
          Contenido +18
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar" role="tablist" aria-label="Fuente">
        {enabledProviders.map((p) => (
          <Chip key={p.id} active={p.id === activeProviderId && !(searching && searchAll)} onClick={() => { setActiveProviderId(p.id); setSearchAll(false); }}>
            {p.name}
            {providerLanguage(p.id) === 'en' && (
              <span title="Solo en inglés" className="ml-1.5 text-[9.5px] font-bold tracking-wider opacity-70">EN</span>
            )}
          </Chip>
        ))}
        {enabledProviders.length === 0 && <span className="text-[13px] text-muted">Sin proveedores habilitados (Ajustes)</span>}
        {searching && enabledProviders.length > 1 && (
          <>
            <span className="w-px h-5 bg-white/15 mx-1 flex-none" />
            <Chip active={searchAll} onClick={() => setSearchAll(true)} title="Buscar el título en todas las fuentes a la vez">
              <span className="material-symbols-outlined text-[15px] align-[-3px] mr-1">travel_explore</span>
              Todas las fuentes
            </Chip>
          </>
        )}
      </div>

      {!searching && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
          {(browsing || genres.length > 0) && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as MangaSort)}
              aria-label="Ordenar por"
              className="flex-none h-8 pl-3 pr-2 rounded-full text-[12.5px] font-medium bg-white/[0.07] text-white outline-none cursor-pointer [color-scheme:dark]"
            >
              {sortOptions.map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
            </select>
          )}
          {genres.length > 0 && (
            <>
              <Chip active={!genre} onClick={() => setGenre(null)}>Todos</Chip>
              {genres.map((g) => (
                <Chip key={g.id} active={genre === g.id} onClick={() => setGenre(genre === g.id ? null : g.id)}>{g.name}</Chip>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );

  // ─── Cuerpo ──────────────────────────────────────────────
  let body: React.ReactNode;

  if (searching && searchAll) {
    body = allResults === null ? (
      <div className="flex flex-col items-center gap-3 py-16">
        <Spinner size={32} />
        <p className="text-[13.5px] text-on-surface-variant">Buscando «{debounced}» en {enabledProviders.length} fuentes…</p>
      </div>
    ) : (
      <div className="flex flex-col gap-10">
        {allResults.map((r) => {
          const items = r.items.filter(visible);
          return (
            <section key={r.provider.id}>
              <div className="flex items-center gap-3 mb-3 px-1">
                <h2 className="font-headline text-[17px] font-bold text-white">{r.provider.name}</h2>
                <span className="text-[12px] text-muted">{r.error ? 'no disponible' : `${items.length} resultados`}</span>
                {r.error && <span className="text-[12px] text-error truncate">{r.error}</span>}
                {!r.error && items.length > 0 && (
                  <button className="ml-auto text-[12.5px] text-secondary hover:text-white" onClick={() => { setActiveProviderId(r.provider.id); setSearchAll(false); }}>
                    Ver solo esta fuente
                  </button>
                )}
              </div>
              {items.length > 0 ? (
                <div className={GRID}>{items.map((m) => <MangaCard key={keyOf(m)} manga={m} onClick={() => onSelectManga(m)} />)}</div>
              ) : !r.error ? (
                <p className="text-[13px] text-muted px-1">Sin resultados.</p>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  } else if (searching) {
    const items = found.items.filter(visible);
    body = (
      <section>
        <div className="flex items-baseline gap-3 mb-4 px-1">
          <h2 className="font-headline text-[19px] font-bold text-white">Resultados para «{debounced}»</h2>
          {!found.loading && <span className="text-[12px] text-muted">{items.length}{found.hasMore ? '+' : ''} en {provider.name}</span>}
        </div>
        {found.error ? (
          <ErrorBox message={found.error} onRetry={found.reload} />
        ) : found.loading ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <span className="material-symbols-outlined text-muted text-5xl">search_off</span>
            <p className="text-[14px] text-on-surface-variant">No hay resultados en {provider.name}.</p>
            {enabledProviders.length > 1 && (
              <button onClick={() => setSearchAll(true)} className="btn-glass h-10 px-5 rounded-full text-[13.5px] font-medium">Buscar en todas las fuentes</button>
            )}
          </div>
        ) : (
          <>
            <div className={GRID}>{items.map((m) => <MangaCard key={keyOf(m)} manga={m} onClick={() => onSelectManga(m)} />)}</div>
            <LoadMore hasMore={found.hasMore} loading={found.loadingMore} onMore={found.loadMore} />
          </>
        )}
      </section>
    );
  } else if (browsing) {
    const items = browse.items.filter(visible);
    const genreName = genres.find((g) => g.id === genre)?.name;
    body = (
      <section>
        <div className="flex items-center gap-3 mb-4 px-1">
          <button onClick={backHome} className="w-8 h-8 rounded-full bg-white/[0.07] hover:bg-white/[0.14] flex items-center justify-center text-white transition-colors" aria-label="Volver al inicio">
            <span className="material-symbols-outlined text-[19px]">arrow_back</span>
          </button>
          <h2 className="font-headline text-[19px] font-bold text-white">{genreName ? `${genreName} · ` : ''}{SORT_LABEL[sort]}</h2>
        </div>
        {browse.error ? (
          <ErrorBox message={browse.error} onRetry={browse.reload} />
        ) : browse.loading ? (
          <SkeletonGrid />
        ) : items.length === 0 ? (
          <p className="text-[14px] text-on-surface-variant py-14 text-center">No hay títulos con ese filtro.</p>
        ) : (
          <>
            <div className={GRID}>{items.map((m) => <MangaCard key={keyOf(m)} manga={m} onClick={() => onSelectManga(m)} />)}</div>
            <LoadMore hasMore={browse.hasMore} loading={browse.loadingMore} onMore={browse.loadMore} />
          </>
        )}
      </section>
    );
  } else {
    const pop = popular.items.filter(visible);
    const rec = recent.items.filter(visible);
    const hero = pop.find((m) => m.coverUrl) ?? pop[0];
    const rowPopular = pop.filter((m) => m !== hero);
    body = popular.error && pop.length === 0 ? (
      <ErrorBox message={popular.error} onRetry={() => { popular.reload(); recent.reload(); }} />
    ) : popular.loading && pop.length === 0 ? (
      <SkeletonGrid count={8} />
    ) : (
      <>
        {hero && <MangaHero manga={hero} onClick={() => onSelectManga(hero)} />}
        <MangaRow title="Populares en Español" mangas={rowPopular} onSelect={onSelectManga} onSeeAll={() => goSeeAll('popular')} />
        <MangaRow title="Actualizados recientemente" mangas={rec} onSelect={onSelectManga} onSeeAll={() => goSeeAll('recent')} />
      </>
    );
  }

  return (
    // Bloques apilados (no flex): en una columna con scroll, los de altura fija (la
    // cabecera destacada) se encogerían hasta desaparecer.
    <div className="flex-1 overflow-y-auto overflow-x-hidden pb-10 px-1 space-y-7">
      {header}
      {home && <ContinueReadingRow onContinue={onContinueManga} />}
      {body}
    </div>
  );
}
