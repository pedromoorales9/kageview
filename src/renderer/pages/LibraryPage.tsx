import React, { useCallback, useEffect, useState } from 'react';
import { AniListAnime } from '../../types/types';
import { MangaModel } from '../../modules/manga';
import {
  MangaLibraryEntry,
  MangaLibraryStatus,
  MangaReadProgress,
  getLibrary,
  getAllProgress,
  removeFromLibrary,
  updateLibraryStatus,
} from '../../modules/manga/mangaLibrary';
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

const MANGA_STATUS_LABEL: Record<MangaLibraryStatus, string> = {
  reading: 'Leyendo',
  planning: 'Planificado',
  completed: 'Completado',
  dropped: 'Abandonado',
};

const MANGA_STATUS_BADGE: Record<MangaLibraryStatus, 'primary' | 'success' | 'warning' | 'error'> = {
  reading: 'primary',
  planning: 'warning',
  completed: 'success',
  dropped: 'error',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LibraryPage({ onSelectAnime, onSelectManga }: LibraryPageProps) {
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
        <MangaSection onSelectManga={onSelectManga} />
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

function MangaSection({ onSelectManga }: { onSelectManga: (manga: MangaModel) => void }) {
  const [library, setLibrary] = useState<MangaLibraryEntry[]>([]);
  const [progress, setProgress] = useState<Record<string, MangaReadProgress>>({});
  const [activeTab, setActiveTab] = useState<'ALL' | MangaLibraryStatus>('ALL');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [lib, prog] = await Promise.all([getLibrary(), getAllProgress()]);
    setLibrary(lib);
    setProgress(prog);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = activeTab === 'ALL' ? library : library.filter((e) => e.status === activeTab);

  const getEntryProgress = (entry: MangaLibraryEntry): MangaReadProgress | null =>
    progress[`${entry.manga.sourceId}::${entry.manga.id}`] ?? null;

  const handleRemove = async (e: React.MouseEvent, entry: MangaLibraryEntry) => {
    e.stopPropagation();
    await removeFromLibrary(entry.manga.id, entry.manga.sourceId);
    await reload();
  };

  const handleChangeStatus = async (e: React.ChangeEvent<HTMLSelectElement>, entry: MangaLibraryEntry) => {
    e.stopPropagation();
    await updateLibraryStatus(entry.manga.id, entry.manga.sourceId, e.target.value as MangaLibraryStatus);
    await reload();
  };

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8">
      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {MANGA_STATUS_TABS.map((tab) => {
          const count = tab.id === 'ALL' ? library.length : library.filter((e) => e.status === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-headline font-semibold transition-all duration-200 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">{tab.icon}</span>
              {tab.label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab.id ? 'bg-primary/20' : 'bg-surface-container-high'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-4xl">
              {activeTab === 'ALL' ? 'menu_book' : 'search_off'}
            </span>
          </div>
          <div className="text-center">
            <p className="font-headline text-lg font-bold text-on-surface">
              {activeTab === 'ALL' ? 'Tu biblioteca de manga está vacía' : 'Sin mangas en esta categoría'}
            </p>
            <p className="text-sm text-on-surface-variant mt-1 max-w-xs">
              {activeTab === 'ALL'
                ? 'Abre cualquier manga y pulsa "Añadir a Biblioteca" para guardarlo aquí.'
                : 'Aún no tienes mangas con este estado.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {filtered.map((entry) => {
            const prog = getEntryProgress(entry);
            const { manga, status } = entry;
            return (
              <div key={`${manga.sourceId}-${manga.id}`} className="group relative flex flex-col gap-2">
                {/* Cover */}
                <div
                  onClick={() => onSelectManga(manga)}
                  role="button"
                  tabIndex={0}
                  className="relative aspect-[2/3] rounded-xl overflow-hidden bg-surface-container w-full cursor-pointer transition-transform duration-200 hover:scale-[1.03] focus:outline-none"
                >
                  {manga.coverUrl ? (
                    <img src={manga.coverUrl} alt={manga.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
                      <span className="material-symbols-outlined text-on-surface-variant text-4xl">menu_book</span>
                    </div>
                  )}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-[inset_0_0_22px_rgba(255, 143, 168,0.25)] pointer-events-none" />
                  {/* Status badge */}
                  <div className="absolute top-2 left-2">
                    <Badge variant={MANGA_STATUS_BADGE[status]} size="sm">{MANGA_STATUS_LABEL[status]}</Badge>
                  </div>
                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(e, entry)}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-error/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-error"
                    title="Quitar de biblioteca"
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                  {/* Progress pill */}
                  {prog && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <div className="bg-black/75 rounded-lg px-2 py-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-primary text-[12px]">bookmark</span>
                        <span className="text-[10px] text-white font-label font-semibold truncate">
                          Cap. {prog.lastChapterNumber ?? '???'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {/* Title */}
                <p className="text-[12px] font-headline font-semibold text-on-surface line-clamp-2 px-0.5 leading-tight">
                  {manga.title}
                </p>
                {/* Status select */}
                <select
                  value={status}
                  onChange={(e) => handleChangeStatus(e, entry)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] px-2 py-1 rounded-lg bg-surface-container-high text-on-surface-variant border border-surface-variant/20 outline-none cursor-pointer hover:border-primary/30 transition-colors duration-150 w-full"
                >
                  <option value="reading">Leyendo</option>
                  <option value="planning">Planificado</option>
                  <option value="completed">Completado</option>
                  <option value="dropped">Abandonado</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
