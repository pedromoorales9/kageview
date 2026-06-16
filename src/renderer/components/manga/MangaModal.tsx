import React, { useEffect, useRef, useState } from 'react';
import { MangaModel, MangaChapterModel, getMangaProvider } from '../../../modules/manga';
import {
  MangaLibraryEntry,
  MangaLibraryStatus,
  MangaReadProgress,
  addToLibrary,
  getLibraryEntry,
  getProgress,
  removeFromLibrary,
  updateLibraryStatus,
} from '../../../modules/manga/mangaLibrary';
import Badge from '../ui/Badge';
import Spinner from '../ui/Spinner';

const STATUS_I18N: Record<string, string> = {
  ongoing:   'En curso',
  completed: 'Completado',
  hiatus:    'En pausa',
  cancelled: 'Cancelado',
};

const STATUS_VARIANT: Record<string, 'primary' | 'success' | 'warning' | 'error'> = {
  ongoing:   'primary',
  completed: 'success',
  hiatus:    'warning',
  cancelled: 'error',
};

const LIBRARY_STATUS_LABELS: Record<MangaLibraryStatus, string> = {
  reading: 'Leyendo',
  planning: 'Planificado',
  completed: 'Completado',
  dropped: 'Abandonado',
};

interface MangaModalProps {
  manga: MangaModel;
  onClose: () => void;
  onReadChapter: (chapterIndex: number, chapters: MangaChapterModel[]) => void;
}

// Capítulos renderizados por lote. Evita congelar el modal con series muy
// largas (p.ej. One Piece en InManga ≈ 1187 capítulos) creando todo de golpe.
const CHAPTER_BATCH = 100;

export default function MangaModal({ manga, onClose, onReadChapter }: MangaModalProps) {
  const [chapters, setChapters] = useState<MangaChapterModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleChapters, setVisibleChapters] = useState(CHAPTER_BATCH);
  const listRef = useRef<HTMLDivElement>(null);

  // Library state
  const [libraryEntry, setLibraryEntry] = useState<MangaLibraryEntry | null>(null);
  const [readProgress, setReadProgress] = useState<MangaReadProgress | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [coverError, setCoverError] = useState(false);

  // Fetch chapters on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVisibleChapters(CHAPTER_BATCH);

    const provider = getMangaProvider(manga.sourceId);
    provider.getMangaChapters(manga.id)
      .then((chs) => {
        if (!cancelled) {
          setChapters(chs);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando capítulos');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [manga.id]);

  // Fetch library state
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLibraryEntry(manga.id, manga.sourceId),
      getProgress(manga.id, manga.sourceId),
    ]).then(([entry, prog]) => {
      if (!cancelled) {
        setLibraryEntry(entry);
        setReadProgress(prog);
      }
    });
    return () => { cancelled = true; };
  }, [manga.id, manga.sourceId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleLibraryToggle = async () => {
    setLibraryLoading(true);
    if (libraryEntry) {
      await removeFromLibrary(manga.id, manga.sourceId);
      setLibraryEntry(null);
    } else {
      await addToLibrary(manga, 'reading');
      const entry = await getLibraryEntry(manga.id, manga.sourceId);
      setLibraryEntry(entry);
    }
    setLibraryLoading(false);
  };

  const handleStatusChange = async (newStatus: MangaLibraryStatus) => {
    await updateLibraryStatus(manga.id, manga.sourceId, newStatus);
    setLibraryEntry((prev) => prev ? { ...prev, status: newStatus } : prev);
  };

  const cleanDescription = manga.description.replace(/<[^>]*>/g, '') || 'Sin descripción disponible.';

  // Find continue chapter index in loaded chapters
  const continueChapterIndex = readProgress
    ? chapters.findIndex((ch) => ch.id === readProgress.lastChapterId)
    : -1;

  return (
    <div
      id="manga-modal-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'manga-modal-overlay') onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/65 backdrop-blur-2xl" />

      {/* Modal */}
      <div className="
        relative z-10
        w-full max-w-5xl h-[88vh]
        bg-surface-container rounded-xl
        flex overflow-hidden
        animate-fade-in-scale
      ">
        {/* Left — Cover */}
        <div className="relative w-[260px] flex-none">
          {manga.coverUrl && !coverError ? (
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-full h-full object-cover"
              onError={() => setCoverError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-container-high">
              <span className="material-symbols-outlined text-on-surface-variant text-6xl">menu_book</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-surface-container" />
          <div className="absolute bottom-4 left-4">
            <Badge variant={STATUS_VARIANT[manga.status] ?? 'primary'} size="md">
              {STATUS_I18N[manga.status] ?? manga.status}
            </Badge>
          </div>
        </div>

        {/* Right — Info + Chapters */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-6 pb-0">
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg
                bg-surface-variant/40 flex items-center justify-center
                text-on-surface-variant hover:text-on-surface transition-colors duration-200"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>

            {/* Title */}
            <h2 className="font-headline text-2xl font-bold text-on-surface pr-10 leading-tight">
              {manga.title}
            </h2>

            {/* Meta */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {manga.year && (
                <span className="text-xs text-on-surface-variant">{manga.year}</span>
              )}
              {chapters.length > 0 && (
                <span className="text-xs text-on-surface-variant">
                  {chapters.length} capítulos
                </span>
              )}
              {/* Source tag */}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-label font-semibold uppercase tracking-wide">
                {manga.sourceId}
              </span>
            </div>

            {/* Tags */}
            {manga.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {manga.tags.slice(0, 8).map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-surface-variant/40 text-on-surface-variant font-label"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            <div className="mt-4 max-h-16 overflow-y-auto pr-2">
              <p className="text-sm text-on-surface-variant/80 leading-relaxed">
                {cleanDescription}
              </p>
            </div>

            {/* ── Library Controls ── */}
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {/* Add/Remove button */}
              <button
                onClick={handleLibraryToggle}
                disabled={libraryLoading}
                className={`
                  flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-headline font-semibold
                  transition-all duration-200
                  ${libraryEntry
                    ? 'bg-primary/15 text-primary hover:bg-error/15 hover:text-error'
                    : 'bg-surface-container-high text-on-surface hover:bg-primary/15 hover:text-primary'
                  }
                  disabled:opacity-50
                `}
              >
                <span className="material-symbols-outlined text-base">
                  {libraryEntry ? 'bookmark' : 'bookmark_add'}
                </span>
                {libraryEntry ? 'En Biblioteca' : 'Añadir a Biblioteca'}
              </button>

              {/* Status selector — only if in library */}
              {libraryEntry && (
                <select
                  value={libraryEntry.status}
                  onChange={(e) => handleStatusChange(e.target.value as MangaLibraryStatus)}
                  className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm font-label
                    border border-surface-variant/20 outline-none cursor-pointer hover:border-primary/30
                    transition-colors duration-150"
                >
                  {(Object.entries(LIBRARY_STATUS_LABELS) as [MangaLibraryStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              )}

              {/* Continue reading button */}
              {readProgress && continueChapterIndex >= 0 && (
                <button
                  onClick={() => onReadChapter(continueChapterIndex, chapters)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg
                    gradient-primary text-on-primary text-sm font-headline font-semibold
                    hover:shadow-[0_0_16px_rgba(203,151,255,0.3)] hover:scale-[1.02]
                    transition-all duration-200"
                >
                  <span className="material-symbols-outlined text-base">play_arrow</span>
                  Continuar Cap. {readProgress.lastChapterNumber ?? ''}
                </button>
              )}
            </div>
          </div>

          {/* Chapter List */}
          <div className="flex-1 mt-4 px-6 pb-4 overflow-hidden flex flex-col">
            <h3 className="text-sm font-headline font-semibold text-on-surface mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">format_list_numbered</span>
              Capítulos en Español
            </h3>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Spinner size={28} />
              </div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-error text-4xl">cloud_off</span>
                <p className="text-sm text-on-surface-variant">{error}</p>
              </div>
            ) : chapters.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-on-surface-variant text-4xl">translate</span>
                <p className="text-sm text-on-surface-variant text-center">
                  No hay capítulos disponibles en español aún.
                </p>
              </div>
            ) : (
              <div ref={listRef} className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
                <div className="flex flex-col gap-1">
                  {(() => {
                    const sliceEnd = Math.max(visibleChapters, continueChapterIndex >= 0 ? continueChapterIndex + 10 : 0);
                    const shown = chapters.slice(0, sliceEnd);
                    const remaining = chapters.length - shown.length;
                    return (
                      <>
                  {shown.map((ch, idx) => {
                    const chNum = ch.chapter ? `Cap. ${ch.chapter}` : `ID ${ch.id.slice(0, 8)}`;
                    const date = ch.publishAt
                      ? new Date(ch.publishAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '';
                    const isLastRead = readProgress?.lastChapterId === ch.id;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => onReadChapter(idx, chapters)}
                        className={`
                          group flex items-center gap-3 w-full text-left
                          px-3 py-2.5 rounded-lg
                          border transition-all duration-150
                          ${isLastRead
                            ? 'bg-primary/10 border-primary/30 hover:bg-primary/15'
                            : 'bg-surface-container-high hover:bg-surface-container-highest border-surface-variant/10 hover:border-primary/30'
                          }
                        `}
                      >
                        <span className={`material-symbols-outlined text-base transition-colors ${isLastRead ? 'text-primary' : 'text-on-surface-variant/50 group-hover:text-primary'}`}>
                          {isLastRead ? 'bookmark' : 'menu_book'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm font-label font-medium transition-colors ${isLastRead ? 'text-primary' : 'text-on-surface group-hover:text-primary'}`}>
                            {chNum}
                            {isLastRead && (
                              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold align-middle">
                                ÚLTIMO LEÍDO
                              </span>
                            )}
                          </span>
                          {ch.title && (
                            <span className="text-xs text-on-surface-variant ml-2 line-clamp-1">
                              — {ch.title}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 flex-none">
                          {date && (
                            <span className="text-[11px] text-on-surface-variant/60">{date}</span>
                          )}
                          {ch.pages > 0 && (
                            <span className="text-[11px] text-on-surface-variant/50">
                              {ch.pages}p
                            </span>
                          )}
                          <span className={`material-symbols-outlined text-sm transition-colors ${isLastRead ? 'text-primary' : 'text-on-surface-variant/40 group-hover:text-primary'}`}>
                            chevron_right
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {remaining > 0 && (
                    <button
                      onClick={() => setVisibleChapters(sliceEnd + CHAPTER_BATCH * 2)}
                      className="mt-1 w-full py-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-surface-variant/10 hover:border-primary/30 text-xs font-label font-semibold text-on-surface-variant hover:text-primary transition-colors"
                    >
                      Cargar más capítulos ({remaining} restantes)
                    </button>
                  )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
