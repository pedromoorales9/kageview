import React, { useCallback, useEffect, useState } from 'react';
import {
  MangaLibraryEntry,
  MangaLibraryStatus,
  MangaReadProgress,
  getLibrary,
  getAllProgress,
  removeFromLibrary,
  updateLibraryStatus,
} from '../../modules/manga/mangaLibrary';
import { MangaModel } from '../../modules/manga';
import Spinner from '../components/ui/Spinner';
import Badge from '../components/ui/Badge';

interface MangaLibraryPageProps {
  onSelectManga: (manga: MangaModel) => void;
}

const STATUS_TABS: Array<{ id: 'ALL' | MangaLibraryStatus; label: string; icon: string }> = [
  { id: 'ALL', label: 'Todos', icon: 'apps' },
  { id: 'reading', label: 'Leyendo', icon: 'menu_book' },
  { id: 'planning', label: 'Planificado', icon: 'bookmark' },
  { id: 'completed', label: 'Completados', icon: 'task_alt' },
  { id: 'dropped', label: 'Abandonados', icon: 'cancel' },
];

const STATUS_LABEL: Record<MangaLibraryStatus, string> = {
  reading: 'Leyendo',
  planning: 'Planificado',
  completed: 'Completado',
  dropped: 'Abandonado',
};

const STATUS_BADGE: Record<MangaLibraryStatus, 'primary' | 'success' | 'warning' | 'error'> = {
  reading: 'primary',
  planning: 'warning',
  completed: 'success',
  dropped: 'error',
};

export default function MangaLibraryPage({ onSelectManga }: MangaLibraryPageProps) {
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

  const filtered =
    activeTab === 'ALL'
      ? library
      : library.filter((e) => e.status === activeTab);

  const getEntryProgress = (entry: MangaLibraryEntry): MangaReadProgress | null => {
    const key = `${entry.manga.sourceId}::${entry.manga.id}`;
    return progress[key] ?? null;
  };

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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold text-on-surface">Biblioteca de Manga</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {library.length} {library.length === 1 ? 'manga guardado' : 'mangas guardados'}
          </p>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => {
          const count = tab.id === 'ALL'
            ? library.length
            : library.filter((e) => e.status === tab.id).length;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-headline font-semibold
                transition-all duration-200 whitespace-nowrap
                ${activeTab === tab.id
                  ? 'bg-primary/15 text-primary'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                }
              `}
            >
              <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
              {tab.label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === tab.id ? 'bg-primary/20' : 'bg-surface-container-high'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="grid gap-6 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
          {filtered.map((entry) => {
            const prog = getEntryProgress(entry);
            return (
              <MangaLibraryCard
                key={`${entry.manga.sourceId}-${entry.manga.id}`}
                entry={entry}
                progress={prog}
                onClick={() => onSelectManga(entry.manga)}
                onRemove={(e) => handleRemove(e, entry)}
                onChangeStatus={(e) => handleChangeStatus(e, entry)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Card Component ──────────────────────────────────────────────────────────

interface CardProps {
  entry: MangaLibraryEntry;
  progress: MangaReadProgress | null;
  onClick: () => void;
  onRemove: (e: React.MouseEvent) => void;
  onChangeStatus: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

function MangaLibraryCard({ entry, progress, onClick, onRemove, onChangeStatus }: CardProps) {
  const { manga, status } = entry;

  return (
    <div className="group relative flex flex-col text-left cursor-pointer w-full transition-all duration-500 ease-out focus:outline-none">
      {/* Cover container */}
      <div 
        onClick={onClick}
        className="relative w-full aspect-[3/4] rounded-xl overflow-hidden mb-2 card-shadow transition-all duration-500 transform group-hover:-translate-y-2 group-hover:shadow-[0_0_30px_rgba(222,187,255,0.15)]"
      >
        {/* Cover image */}
        {manga.coverUrl ? (
          <img
            src={manga.coverUrl}
            alt={manga.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
            <span className="material-symbols-outlined text-on-surface-variant text-4xl">menu_book</span>
          </div>
        )}

        {/* Bottom gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-80 pointer-events-none" />

        {/* Status Mode Badge Pill */}
        <div className="absolute top-3 left-3 z-10 opacity-95 group-hover:opacity-100 transition-opacity">
          <Badge variant={STATUS_BADGE[status]} size="sm">
            {STATUS_LABEL[status]}
          </Badge>
        </div>

        {/* Remove button top-right — visible on hover */}
        <div
          onClick={onRemove}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-error/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-error cursor-pointer z-20 shadow-lg"
          title="Quitar de biblioteca"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </div>

        {/* Progress pill — last chapter read */}
        {progress && (
          <div className="absolute bottom-3 left-3 right-3 pointer-events-none flex justify-end">
            <span className="inline-flex text-[10px] font-bold text-white/90 bg-black/60 backdrop-blur-sm px-2 py-1 rounded shadow-lg items-center gap-1">
              <span className="material-symbols-outlined text-primary text-[10px] flex-none">bookmark</span>
              <span className="truncate">Cap. {progress.lastChapterNumber ?? '?'}</span>
            </span>
          </div>
        )}
      </div>

      {/* Info Block */}
      <h4 className="text-on-surface font-headline font-bold text-sm sm:text-base lg:text-lg mb-2 truncate px-1 group-hover:text-primary transition-colors">
        {manga.title}
      </h4>

      {/* Status selector directly replacing the gap area */}
      <select
        value={status}
        onChange={onChangeStatus}
        onClick={(e) => e.stopPropagation()}
        className="text-[10px] sm:text-[11px] lg:text-xs px-2 py-1.5 lg:py-2 rounded-lg bg-surface-container-high text-on-surface-variant
          border border-surface-variant/20 outline-none cursor-pointer hover:border-primary/30
          transition-colors duration-150 w-full font-label uppercase tracking-wider font-semibold"
      >
        <option value="reading">Leyendo</option>
        <option value="planning">Planificado</option>
        <option value="completed">Completado</option>
        <option value="dropped">Abandonado</option>
      </select>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: 'ALL' | MangaLibraryStatus }) {
  const isEmpty = tab === 'ALL';
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-4xl">
          {isEmpty ? 'menu_book' : 'search_off'}
        </span>
      </div>
      <div className="text-center">
        <p className="font-headline text-lg font-bold text-on-surface">
          {isEmpty ? 'Tu biblioteca está vacía' : 'Sin mangas en esta categoría'}
        </p>
        <p className="text-sm text-on-surface-variant mt-1 max-w-xs">
          {isEmpty
            ? 'Abre cualquier manga y pulsa "Añadir a Biblioteca" para guardarlo aquí.'
            : 'Aún no tienes mangas con este estado.'}
        </p>
      </div>
    </div>
  );
}
