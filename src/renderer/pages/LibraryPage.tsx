import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AniListAnime } from '../../types/types';
import { MangaModel } from '../../modules/manga';
import {
  MangaLibraryStatus,
  MangaRecord,
  libraryRecords,
  setLibraryStatus,
  useMangaData,
} from '../../modules/manga/mangaStore';
import { checkMangaUpdates } from '../../modules/manga/mangaUpdates';
import { syncMangaNow, useMangaSync } from '../../modules/manga/mangaSync';
import { timeAgo } from '../../modules/social';
import MangaCard from '../components/manga/MangaCard';
import useAniList from '../hooks/useAniList';
import { useAppStore } from '../../modules/store';
import { getUserList } from '../../modules/library';
import { openAuth } from '../../modules/account';
import AnimeCard from '../components/anime/AnimeCard';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

interface LibraryPageProps {
  onSelectAnime: (anime: AniListAnime) => void;
  onSelectManga: (manga: MangaModel) => void;
  onContinueManga: (record: MangaRecord) => Promise<void>;
}

// ─── Anime constants ──────────────────────────────────────────────────────────

const ANIME_STATUS_TABS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'CURRENT', label: 'Viendo' },
  { id: 'COMPLETED', label: 'Completados' },
  { id: 'PLANNING', label: 'Por Ver' },
  { id: 'PAUSED', label: 'Pausados' },
  { id: 'DROPPED', label: 'Abandonados' },
];

// ─── Manga constants ──────────────────────────────────────────────────────────

const MANGA_STATUS_TABS: Array<{ id: 'ALL' | MangaLibraryStatus; label: string; icon: string }> = [
  { id: 'ALL', label: 'Todos', icon: 'apps' },
  { id: 'reading', label: 'Leyendo', icon: 'menu_book' },
  { id: 'planning', label: 'Planificado', icon: 'bookmark' },
  { id: 'completed', label: 'Completados', icon: 'task_alt' },
  { id: 'dropped', label: 'Abandonados', icon: 'cancel' },
];


// ─── Main Component ───────────────────────────────────────────────────────────

export default function LibraryPage({ onSelectAnime, onSelectManga, onContinueManga }: LibraryPageProps) {
  const [section, setSection] = useState<'anime' | 'manga'>('anime');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Section Switcher */}
      <div className="flex items-center gap-1 mb-6">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-container-high/60 border border-surface-variant/10">
          <button
            onClick={() => setSection('anime')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-headline font-semibold transition-all duration-200 ${
              section === 'anime'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {section === 'anime' ? 'play_circle' : 'play_circle'}
            </span>
            Anime
          </button>
          <button
            onClick={() => setSection('manga')}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-headline font-semibold transition-all duration-200 ${
              section === 'manga'
                ? 'bg-primary/15 text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            Manga
          </button>
        </div>
      </div>

      {section === 'anime' ? (
        <AnimeSection onSelectAnime={onSelectAnime} />
      ) : (
        <MangaSection onSelectManga={onSelectManga} onContinueManga={onContinueManga} />
      )}
    </div>
  );
}

// ─── Anime Section ────────────────────────────────────────────────────────────

function AnimeSection({ onSelectAnime }: { onSelectAnime: (anime: AniListAnime) => void }) {
  const status = useAppStore((s) => s.account.status);
  const signedIn = status === 'signedIn';
  // Al cambiar mi lista (añadir/quitar/cambiar estado) se recarga la vista
  const myList = useAppStore((s) => s.myList);
  const [animeList, setAnimeList] = useState<AniListAnime[]>([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const filter = activeTab === 'ALL' ? undefined : activeTab;
        const list = await getUserList(filter);
        if (!cancelled) setAnimeList(list);
      } catch (err) {
        console.error('[LibraryPage] Error loading list:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [signedIn, activeTab, myList]);

  if (status === 'loading') {
    return <div className="flex-1 flex items-center justify-center"><Spinner size={32} /></div>;
  }

  if (!signedIn) {
    const unavailable = status === 'unavailable';
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#ff5570] to-[#c81a3f] flex items-center justify-center shadow-moon-lg">
          <span className="material-symbols-outlined filled text-white text-[38px]">{unavailable ? 'cloud_off' : 'auto_stories'}</span>
        </div>
        <h2 className="font-headline text-[26px] font-bold text-white tracking-[-0.03em] text-center">
          {unavailable ? 'Las cuentas no están configuradas' : 'Guarda tu lista de anime'}
        </h2>
        <p className="text-[14.5px] text-on-surface-variant text-center max-w-md leading-relaxed">
          {unavailable
            ? 'Esta versión de KageView no está conectada a un servidor de cuentas, así que las listas no se pueden guardar.'
            : 'Crea tu cuenta gratis para llevar el control de lo que ves (viendo, completados, por ver…) y compartirlo con tus amigos.'}
        </p>
        {!unavailable && (
          <div className="flex gap-3">
            <button id="library-register" onClick={() => openAuth('register')} className="btn-moon h-11 px-7 rounded-full font-semibold text-[14.5px]">
              Crear cuenta
            </button>
            <button id="library-login" onClick={() => openAuth('login')} className="btn-glass h-11 px-6 rounded-full font-medium text-[14.5px]">
              Iniciar sesión
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {ANIME_STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-full text-xs font-headline font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-primary/15 text-primary'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
      ) : animeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant gap-3">
          <span className="material-symbols-outlined text-4xl opacity-40">inbox</span>
          <p className="text-sm">No hay animes en esta categoría</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(155px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {animeList.map((anime) => (
            <div key={anime.id} className="relative">
              <AnimeCard
                anime={anime}
                onClick={() => onSelectAnime(anime)}
                showProgress={!!anime.mediaListEntry}
                progress={anime.mediaListEntry?.progress || 0}
                mediaListStatus={anime.mediaListEntry?.status}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manga Section ────────────────────────────────────────────────────────────

type MangaSort = 'recent' | 'az' | 'unread';
const MANGA_SORT_LABEL: Record<MangaSort, string> = {
  recent: 'Leídos recientemente',
  az: 'A – Z',
  unread: 'Con más capítulos nuevos',
};

/** Estado de la sincronización de la biblioteca de manga con la cuenta. */
function SyncChip() {
  const { state, lastSyncAt, error } = useMangaSync();
  if (state === 'off' || state === 'unavailable') return null;
  const label =
    state === 'syncing' ? 'Sincronizando…'
    : state === 'error' ? 'Sin sincronizar'
    : lastSyncAt ? `Sincronizado · ${timeAgo(new Date(lastSyncAt).toISOString())}` : 'Sincronizado';
  return (
    <button
      onClick={() => void syncMangaNow()}
      disabled={state === 'syncing'}
      title={state === 'error' ? `${error ?? 'Error al sincronizar'}. Pulsa para reintentar.` : 'Tu biblioteca y progreso están en tu cuenta. Pulsa para sincronizar ahora.'}
      className={`h-9 px-3.5 rounded-full text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-70 ${
        state === 'error' ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-white/[0.06] text-on-surface-variant hover:text-white hover:bg-white/[0.11]'
      }`}
    >
      {state === 'syncing' ? <Spinner size={14} /> : <span className="material-symbols-outlined text-[16px]">{state === 'error' ? 'cloud_off' : 'cloud_done'}</span>}
      {label}
    </button>
  );
}

function MangaSection({
  onSelectManga,
  onContinueManga,
}: {
  onSelectManga: (manga: MangaModel) => void;
  onContinueManga: (record: MangaRecord) => Promise<void>;
}) {
  const toast = useToast();
  const includeEnglish = useAppStore((s) => s.prefs.mangaIncludeEnglish);
  const records = useMangaData((s) => s.records);
  const loaded = useMangaData((s) => s.loaded);
  const library = useMemo(() => libraryRecords(records), [records]);

  const [activeTab, setActiveTab] = useState<'ALL' | MangaLibraryStatus>('ALL');
  const [sort, setSort] = useState<MangaSort>('recent');
  const [onlyNew, setOnlyNew] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const withNew = library.filter((r) => (r.unread ?? 0) > 0).length;

  const visible = useMemo(() => {
    const list = library.filter((r) => (activeTab === 'ALL' || r.status === activeTab) && (!onlyNew || (r.unread ?? 0) > 0));
    const recency = (r: MangaRecord) => Math.max(r.updatedAt, r.last?.at ?? 0);
    return [...list].sort((a, b) => {
      if (sort === 'az') return a.manga.title.localeCompare(b.manga.title, 'es');
      if (sort === 'unread') return (b.unread ?? 0) - (a.unread ?? 0) || recency(b) - recency(a);
      return recency(b) - recency(a);
    });
  }, [library, activeTab, onlyNew, sort]);

  const checkNow = async () => {
    setChecking(true);
    try {
      const found = await checkMangaUpdates({ force: true, includeEnglish });
      const total = found.reduce((n, f) => n + f.added, 0);
      if (found.length === 0) toast.success('Estás al día: no hay capítulos nuevos.', 'Manga');
      else toast.info(`${total} ${total === 1 ? 'capítulo nuevo' : 'capítulos nuevos'} en ${found.length} ${found.length === 1 ? 'manga' : 'mangas'}.`, 'Manga');
    } catch {
      toast.error('No se pudieron comprobar los capítulos nuevos.', 'Manga');
    } finally {
      setChecking(false);
    }
  };

  const openLast = async (rec: MangaRecord) => {
    setBusyKey(`${rec.manga.sourceId}::${rec.manga.id}`);
    try { await onContinueManga(rec); } finally { setBusyKey(null); }
  };

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-1 min-w-[min(100%,480px)] hide-scrollbar">
          {MANGA_STATUS_TABS.map((tab) => {
            const count = tab.id === 'ALL' ? library.length : library.filter((e) => e.status === tab.id).length;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-primary text-white shadow-moon' : 'bg-white/[0.06] text-on-surface-variant hover:text-white hover:bg-white/[0.11]'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
                {tab.label}
                {count > 0 && <span className="text-[10.5px] opacity-80 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setOnlyNew((v) => !v)}
          aria-pressed={onlyNew}
          disabled={withNew === 0 && !onlyNew}
          className={`h-9 px-4 rounded-full text-[12.5px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
            onlyNew ? 'bg-primary/20 text-primary ring-1 ring-primary/40' : 'bg-white/[0.06] text-on-surface-variant hover:text-white hover:bg-white/[0.11]'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">fiber_new</span>
          Con novedades{withNew > 0 ? ` (${withNew})` : ''}
        </button>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as MangaSort)}
          aria-label="Ordenar"
          className="h-9 pl-3 pr-2 rounded-full text-[12.5px] font-medium bg-white/[0.06] text-white outline-none cursor-pointer [color-scheme:dark]"
        >
          {(Object.keys(MANGA_SORT_LABEL) as MangaSort[]).map((k) => <option key={k} value={k}>{MANGA_SORT_LABEL[k]}</option>)}
        </select>

        <button
          onClick={() => void checkNow()}
          disabled={checking || library.length === 0}
          title="Comprobar si hay capítulos nuevos de lo que estás leyendo"
          className="h-9 px-4 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-[12.5px] font-medium text-white flex items-center gap-1.5 transition-colors disabled:opacity-40"
        >
          {checking ? <Spinner size={15} /> : <span className="material-symbols-outlined text-[16px]">refresh</span>}
          Buscar capítulos nuevos
        </button>

        <SyncChip />
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-4xl">{library.length === 0 ? 'menu_book' : 'search_off'}</span>
          </div>
          <div className="text-center">
            <p className="font-headline text-lg font-bold text-white">
              {library.length === 0 ? 'Tu biblioteca de manga está vacía' : onlyNew ? 'No hay capítulos nuevos' : 'Sin mangas en esta categoría'}
            </p>
            <p className="text-sm text-on-surface-variant mt-1 max-w-xs">
              {library.length === 0
                ? 'Abre cualquier manga y pulsa «Añadir a la biblioteca» para guardarlo aquí y enterarte de sus capítulos nuevos.'
                : onlyNew ? 'Te avisaremos cuando salgan capítulos de lo que estás leyendo.' : 'Aún no tienes mangas con este estado.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-x-5 gap-y-7 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
          {visible.map((rec) => {
            const key = `${rec.manga.sourceId}::${rec.manga.id}`;
            const last = rec.last;
            return (
              <div key={key} className="flex flex-col gap-2">
                <MangaCard manga={rec.manga} onClick={() => onSelectManga(rec.manga)} />
                <div className="flex items-center gap-2 px-0.5">
                  {last ? (
                    <button
                      onClick={() => void openLast(rec)}
                      disabled={busyKey === key}
                      className="flex-1 min-w-0 h-8 px-3 rounded-full bg-white/[0.08] hover:bg-primary hover:text-white text-[11.5px] font-medium text-white flex items-center gap-1.5 transition-colors disabled:opacity-60"
                      title="Continuar leyendo"
                    >
                      {busyKey === key ? <Spinner size={13} /> : <span className="material-symbols-outlined filled text-[15px]">play_arrow</span>}
                      <span className="truncate">
                        {last.chapterNumber ? `Cap. ${last.chapterNumber}` : 'Continuar'}
                        {last.pageCount > 0 ? ` · ${last.page + 1}/${last.pageCount}` : ''}
                      </span>
                    </button>
                  ) : (
                    <span className="flex-1 text-[11.5px] text-muted px-1">Sin empezar</span>
                  )}
                  <select
                    value={rec.status}
                    onChange={(e) => setLibraryStatus(rec.manga, e.target.value as MangaLibraryStatus)}
                    aria-label={`Estado de ${rec.manga.title}`}
                    className="h-8 w-8 rounded-full bg-white/[0.08] text-transparent outline-none cursor-pointer hover:bg-white/[0.15] transition-colors appearance-none [color-scheme:dark] bg-[length:16px] bg-center bg-no-repeat"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                  >
                    <option value="reading">Leyendo</option>
                    <option value="planning">Pendiente</option>
                    <option value="completed">Completado</option>
                    <option value="dropped">Abandonado</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
