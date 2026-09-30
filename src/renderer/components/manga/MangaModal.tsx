import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MangaModel, MangaChapterModel, chapterLabel, getMangaProvider, loadMangaChapters } from '../../../modules/manga';
import { firstUnreadIndex, latestChapterNumber } from '../../../modules/manga/chapters';
import { computeUnread } from '../../../modules/manga/mangaUpdates';
import {
  MangaLibraryStatus,
  addToLibrary,
  applyUpdateCheck,
  clearReading,
  markReadUpTo,
  mangaKey,
  readPredicate,
  removeFromLibrary,
  setChapterRead,
  setLibraryStatus,
  useMangaData,
} from '../../../modules/manga/mangaStore';
import { useAppStore } from '../../../modules/store';
import Spinner from '../ui/Spinner';
import { inferType } from './MangaCard';
import ShareMangaButton from './ShareMangaButton';

const STATUS_I18N: Record<string, string> = {
  ongoing: 'En curso',
  completed: 'Finalizado',
  hiatus: 'En pausa',
  cancelled: 'Cancelado',
};

const LIBRARY_LABELS: Record<MangaLibraryStatus, { label: string; icon: string }> = {
  reading: { label: 'Leyendo', icon: 'auto_stories' },
  planning: { label: 'Pendiente', icon: 'schedule' },
  completed: { label: 'Completado', icon: 'done_all' },
  dropped: { label: 'Abandonado', icon: 'block' },
};

interface MangaModalProps {
  manga: MangaModel;
  onClose: () => void;
  /** `chapterIndex` es la posición en `chapters` (siempre ascendente). */
  onReadChapter: (chapterIndex: number, chapters: MangaChapterModel[]) => void;
  /** Cierra la ficha y busca el título en todas las fuentes (por si esta no tiene capítulos). */
  onSearchElsewhere?: (title: string) => void;
}

/** Capítulos pintados por lote (series de 1000+ capítulos). */
const BATCH = 100;
const NEW_MS = 7 * 24 * 60 * 60 * 1000;

export default function MangaModal({ manga, onClose, onReadChapter, onSearchElsewhere }: MangaModalProps) {
  const includeEnglish = useAppStore((s) => s.prefs.mangaIncludeEnglish);
  const setPrefs = useAppStore((s) => s.setPrefs);
  const provider = getMangaProvider(manga.sourceId);
  const record = useMangaData((s) => s.records[mangaKey(manga)]);

  const [chapters, setChapters] = useState<MangaChapterModel[]>([]); // ascendente
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [newestFirst, setNewestFirst] = useState(true);
  const [filter, setFilter] = useState('');
  const [visible, setVisible] = useState(BATCH);
  const [menuOpen, setMenuOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastReadRef = useRef<HTMLButtonElement>(null);

  // ─── Capítulos ───────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setVisible(BATCH);
    loadMangaChapters(manga, { includeEnglish })
      .then((chs) => { if (!cancelled) { setChapters(chs); setLoading(false); } })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando capítulos');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [manga.id, manga.sourceId, includeEnglish, reload]);

  // Al conocer los capítulos, ajustar el contador de nuevos de la biblioteca
  useEffect(() => {
    if (chapters.length === 0 || record?.status !== 'reading') return;
    applyUpdateCheck(manga, {
      latest: latestChapterNumber(chapters),
      unread: computeUnread(chapters, readPredicate(record), record.last?.chapterId),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, record?.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuOpen) setMenuOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, menuOpen]);

  // ─── Derivados ───────────────────────────────────────────
  // Leído por id (este dispositivo) o por número (otros dispositivos / la cuenta)
  const isRead = useMemo(() => readPredicate(record), [record?.read, record?.readRanges]); // eslint-disable-line react-hooks/exhaustive-deps
  const readCount = useMemo(() => chapters.filter((c) => isRead(c)).length, [chapters, isRead]);
  const lastIdx = record?.last ? chapters.findIndex((c) => c.id === record.last!.chapterId) : -1;

  // Capítulo al que lleva el botón principal
  const target = useMemo(() => {
    if (chapters.length === 0) return null;
    if (lastIdx >= 0 && record?.last) {
      const l = record.last;
      const finished = l.pageCount > 0 && l.page >= l.pageCount - 1;
      if (finished && lastIdx + 1 < chapters.length) return { index: lastIdx + 1, kind: 'next' as const };
      if (finished) return { index: lastIdx, kind: 'reread' as const };
      return { index: lastIdx, kind: 'continue' as const, page: l.page, pageCount: l.pageCount };
    }
    const first = firstUnreadIndex(chapters, isRead);
    return { index: first, kind: readCount > 0 ? ('next' as const) : ('start' as const) };
  }, [chapters, lastIdx, record?.last, isRead, readCount]);

  const displayed = useMemo(() => {
    const list = chapters.map((ch, index) => ({ ch, index }));
    if (newestFirst) list.reverse();
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(({ ch }) => (ch.chapter ?? '').toLowerCase().startsWith(q) || chapterLabel(ch).toLowerCase().includes(q));
  }, [chapters, newestFirst, filter]);

  const shownCount = Math.max(
    visible,
    lastIdx >= 0 ? displayed.findIndex((d) => d.index === lastIdx) + 12 : 0
  );
  const shown = displayed.slice(0, shownCount);
  const remaining = displayed.length - shown.length;

  const targetLabel = (() => {
    if (!target) return '';
    const ch = chapters[target.index];
    const name = ch.chapter ? `Cap. ${ch.chapter}` : chapterLabel(ch);
    if (target.kind === 'continue') return target.pageCount ? `Continuar · ${name} · pág. ${target.page + 1}/${target.pageCount}` : `Continuar · ${name}`;
    if (target.kind === 'next') return `Siguiente · ${name}`;
    if (target.kind === 'reread') return `Releer · ${name}`;
    return `Empezar · ${name}`;
  })();

  const cleanDescription = manga.description.replace(/<[^>]*>/g, '').trim() || 'Sin descripción disponible.';
  const inLibrary = !!record?.status;

  const jumpToLastRead = () => {
    if (lastIdx < 0) return;
    const pos = displayed.findIndex((d) => d.index === lastIdx);
    if (pos >= 0 && pos >= shownCount - 12) setVisible(pos + 20);
    requestAnimationFrame(() => lastReadRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };

  return (
    <div
      id="manga-modal-overlay"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => { if ((e.target as HTMLElement).id === 'manga-modal-overlay') onClose(); }}
    >
      <div className="absolute inset-0 bg-[#09050a]/85" />

      <div role="dialog" aria-modal="true" aria-label={manga.title} className="relative z-10 w-full max-w-5xl h-[88vh] rounded-[24px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] flex overflow-hidden animate-fade-in-scale">
        {/* ── Portada ── */}
        <div className="relative w-[250px] flex-none hidden md:block">
          {manga.coverUrl && !coverError ? (
            <img src={manga.coverUrl} alt={manga.title} className="w-full h-full object-cover" onError={() => setCoverError(true)} />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-container">
              <span className="material-symbols-outlined text-muted text-6xl">menu_book</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#130a11]" />
          <div className="absolute bottom-4 left-4 flex flex-col gap-1.5">
            <span className="h-[22px] px-2 inline-flex items-center rounded-md text-[10.5px] font-bold uppercase tracking-[0.12em] text-white bg-black/65 ring-[0.5px] ring-white/15 w-fit">{inferType(manga)}</span>
            <span className="h-[22px] px-2 inline-flex items-center rounded-md text-[10.5px] font-bold uppercase tracking-[0.1em] text-secondary bg-black/65 ring-[0.5px] ring-white/15 w-fit">{STATUS_I18N[manga.status] ?? manga.status}</span>
          </div>
        </div>

        {/* ── Información + capítulos ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="p-6 pb-0">
            <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors">
              <span className="material-symbols-outlined text-[19px]">close</span>
            </button>

            <h2 className="font-headline text-[26px] font-bold text-white tracking-[-0.025em] leading-tight pr-10">{manga.title}</h2>

            <div className="flex items-center gap-2.5 mt-2 flex-wrap text-[12.5px] text-muted">
              {manga.year && <span>{manga.year}</span>}
              {chapters.length > 0 && <span>{chapters.length} capítulos</span>}
              <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10.5px] font-semibold uppercase tracking-wide">{provider.name}</span>
            </div>

            {manga.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {manga.tags.slice(0, 8).map((tag) => (
                  <span key={tag} className="text-[11.5px] px-2.5 py-0.5 rounded-full bg-white/[0.07] text-on-surface-variant">{tag}</span>
                ))}
              </div>
            )}

            <div className="mt-3">
              <p className={`text-[13.5px] text-on-surface-variant leading-relaxed ${descOpen ? 'max-h-40 overflow-y-auto pr-2' : 'line-clamp-2'}`}>{cleanDescription}</p>
              {cleanDescription.length > 160 && (
                <button onClick={() => setDescOpen((o) => !o)} className="text-[12px] text-secondary hover:text-white mt-1">{descOpen ? 'Ver menos' : 'Ver más'}</button>
              )}
            </div>

            {/* ── Acciones ── */}
            <div className="mt-4 flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => target && onReadChapter(target.index, chapters)}
                disabled={!target}
                className="btn-moon h-11 px-5 rounded-full text-[14px] font-semibold flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
              >
                <span className="material-symbols-outlined filled text-[20px]">{target?.kind === 'reread' ? 'replay' : 'auto_stories'}</span>
                {loading ? 'Cargando…' : target ? targetLabel : 'Sin capítulos'}
              </button>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={`h-11 px-4 rounded-full text-[13.5px] font-medium flex items-center gap-2 transition-colors ${
                    inLibrary ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-white/[0.08] text-white hover:bg-white/[0.15]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[19px]">{inLibrary ? 'bookmark' : 'bookmark_add'}</span>
                  {inLibrary ? LIBRARY_LABELS[record!.status!].label : 'Añadir a la biblioteca'}
                  <span className="material-symbols-outlined text-[18px] -mr-1">expand_more</span>
                </button>

                {menuOpen && (
                  <div role="menu" className="absolute left-0 top-12 z-20 w-56 rounded-2xl bg-[#1d1119] ring-1 ring-white/10 shadow-2xl p-1.5">
                    {(Object.keys(LIBRARY_LABELS) as MangaLibraryStatus[]).map((st) => (
                      <button
                        key={st}
                        role="menuitem"
                        onClick={() => { inLibrary ? setLibraryStatus(manga, st) : addToLibrary(manga, st); setMenuOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-left transition-colors hover:bg-white/[0.08] ${record?.status === st ? 'text-primary' : 'text-white'}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">{LIBRARY_LABELS[st].icon}</span>
                        {LIBRARY_LABELS[st].label}
                        {record?.status === st && <span className="material-symbols-outlined text-[16px] ml-auto">check</span>}
                      </button>
                    ))}
                    {inLibrary && (
                      <>
                        <div className="h-px bg-white/10 my-1" />
                        <button role="menuitem" onClick={() => { removeFromLibrary(manga); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-error text-left hover:bg-error/10 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">bookmark_remove</span>
                          Quitar de la biblioteca
                        </button>
                      </>
                    )}
                    {(record?.read.length || record?.last) ? (
                      <button role="menuitem" onClick={() => { clearReading(manga); setMenuOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] text-on-surface-variant text-left hover:bg-white/[0.08] transition-colors">
                        <span className="material-symbols-outlined text-[18px]">history_toggle_off</span>
                        Olvidar lo leído
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              <ShareMangaButton manga={manga} />
            </div>

            {/* Progreso de lectura */}
            {chapters.length > 0 && readCount > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((readCount / chapters.length) * 100)}%` }} />
                </div>
                <span className="text-[12px] text-muted tabular-nums whitespace-nowrap">{readCount} de {chapters.length} leídos</span>
              </div>
            )}
          </div>

          {/* ── Lista de capítulos ── */}
          <div className="flex-1 min-h-0 mt-4 px-6 pb-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <h3 className="text-[13.5px] font-headline font-semibold text-white flex items-center gap-2 mr-auto">
                <span className="material-symbols-outlined text-primary text-[18px]">format_list_numbered</span>
                Capítulos
                {provider.languages && (
                  <span className="text-[11.5px] font-normal text-muted">· {includeEnglish ? 'Español e inglés' : 'En español'}</span>
                )}
              </h3>

              {provider.languages && (
                <button
                  onClick={() => setPrefs({ mangaIncludeEnglish: !includeEnglish })}
                  aria-pressed={includeEnglish}
                  title="Incluir capítulos en inglés cuando no haya en español"
                  className={`h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${includeEnglish ? 'bg-primary/20 text-primary' : 'bg-white/[0.07] text-on-surface-variant hover:text-white'}`}
                >
                  + Inglés
                </button>
              )}
              {lastIdx >= 0 && (
                <button onClick={jumpToLastRead} className="h-8 px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-[12px] font-medium text-on-surface-variant hover:text-white transition-colors flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px]">my_location</span>Último leído
                </button>
              )}
              <button
                onClick={() => setNewestFirst((v) => !v)}
                title={newestFirst ? 'Mostrando los más nuevos primero' : 'Mostrando los más antiguos primero'}
                aria-label="Cambiar orden"
                className="h-8 px-3 rounded-full bg-white/[0.07] hover:bg-white/[0.13] text-[12px] font-medium text-on-surface-variant hover:text-white transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[15px]">{newestFirst ? 'arrow_downward' : 'arrow_upward'}</span>
                {newestFirst ? 'Nuevos primero' : 'Antiguos primero'}
              </button>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-[16px] pointer-events-none">search</span>
                <input
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setVisible(BATCH); }}
                  placeholder="Ir al capítulo…"
                  aria-label="Buscar capítulo"
                  className="h-8 w-36 pl-8 pr-2 rounded-full bg-white/[0.07] text-[12.5px] text-white placeholder:text-muted outline-none focus:bg-white/[0.12] transition-colors"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center"><Spinner size={28} /></div>
            ) : error ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <span className="material-symbols-outlined text-error text-4xl">cloud_off</span>
                <p className="text-[13.5px] text-on-surface-variant max-w-sm">{error}</p>
                <div className="flex gap-2">
                  <button onClick={() => setReload((n) => n + 1)} className="btn-glass h-9 px-5 rounded-full text-[13px] font-medium">Reintentar</button>
                  {onSearchElsewhere && (
                    <button onClick={() => onSearchElsewhere(manga.title)} className="btn-glass h-9 px-5 rounded-full text-[13px] font-medium">Buscar en otras fuentes</button>
                  )}
                </div>
              </div>
            ) : chapters.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                <span className="material-symbols-outlined text-muted text-4xl">translate</span>
                <p className="text-[13.5px] text-on-surface-variant max-w-xs">
                  No hay capítulos disponibles {provider.languages && !includeEnglish ? 'en español' : ''} en {provider.name}.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  {provider.languages && !includeEnglish && (
                    <button onClick={() => setPrefs({ mangaIncludeEnglish: true })} className="btn-glass h-9 px-5 rounded-full text-[13px] font-medium">Buscar también en inglés</button>
                  )}
                  {onSearchElsewhere && (
                    <button onClick={() => onSearchElsewhere(manga.title)} className="btn-moon h-9 px-5 rounded-full text-[13px] font-semibold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[17px]">travel_explore</span>
                      Buscar en otras fuentes
                    </button>
                  )}
                </div>
              </div>
            ) : displayed.length === 0 ? (
              <p className="flex-1 flex items-center justify-center text-[13.5px] text-muted">Ningún capítulo coincide con «{filter}».</p>
            ) : (
              <div ref={listRef} className="flex-1 overflow-y-auto pr-2 scrollbar-thin">
                <ul className="flex flex-col gap-1">
                  {shown.map(({ ch, index }) => {
                    const chRead = isRead(ch);
                    const isLast = index === lastIdx;
                    const isNew = ch.publishAt && Date.now() - Date.parse(ch.publishAt) < NEW_MS;
                    const date = ch.publishAt ? new Date(ch.publishAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
                    return (
                      <li key={ch.id} className="group flex items-center gap-1">
                        {/* Marca de leído */}
                        <button
                          onClick={() => setChapterRead(manga, ch, !chRead)}
                          title={chRead ? 'Marcar como no leído' : 'Marcar como leído'}
                          aria-label={chRead ? 'Marcar como no leído' : 'Marcar como leído'}
                          aria-pressed={chRead}
                          className={`w-8 h-8 flex-none rounded-full flex items-center justify-center transition-colors ${chRead ? 'text-primary hover:bg-primary/10' : 'text-white/25 hover:text-white hover:bg-white/10'}`}
                        >
                          <span className={`material-symbols-outlined text-[20px] ${chRead ? 'filled' : ''}`}>{chRead ? 'check_circle' : 'radio_button_unchecked'}</span>
                        </button>

                        <button
                          ref={isLast ? lastReadRef : undefined}
                          onClick={() => onReadChapter(index, chapters)}
                          className={`flex-1 min-w-0 flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors ${
                            isLast ? 'bg-primary/10 ring-1 ring-primary/30 hover:bg-primary/15' : 'hover:bg-white/[0.07]'
                          }`}
                        >
                          <span className="flex-1 min-w-0">
                            <span className={`text-[14px] font-medium ${chRead && !isLast ? 'text-on-surface-variant/70' : 'text-white'}`}>
                              {ch.chapter ? `Cap. ${ch.chapter}` : 'Extra'}
                            </span>
                            {ch.title && <span className="text-[12.5px] text-muted ml-2 truncate">— {ch.title}</span>}
                            {isNew && <span className="ml-2 text-[9.5px] px-1.5 py-0.5 rounded bg-primary text-white font-bold align-middle">NUEVO</span>}
                            {isLast && (
                              <span className="ml-2 text-[9.5px] px-1.5 py-0.5 rounded bg-primary/25 text-primary font-bold align-middle">
                                {record?.last && record.last.pageCount > 0 ? `PÁG. ${record.last.page + 1}/${record.last.pageCount}` : 'AQUÍ TE QUEDASTE'}
                              </span>
                            )}
                            {ch.translatedLanguage && ch.translatedLanguage !== 'es' && ch.translatedLanguage !== 'es-la' && (
                              <span className="ml-2 text-[9.5px] px-1.5 py-0.5 rounded bg-white/10 text-on-surface-variant font-bold align-middle uppercase">{ch.translatedLanguage}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-3 flex-none text-[11.5px] text-muted">
                            {date && <span>{date}</span>}
                            {ch.pages > 0 && <span className="tabular-nums">{ch.pages}p</span>}
                          </span>
                        </button>

                        {/* Marcar hasta aquí */}
                        <button
                          onClick={() => markReadUpTo(manga, chapters, index)}
                          title="Marcar como leídos todos hasta este capítulo"
                          aria-label={`Marcar como leídos hasta ${chapterLabel(ch, false)}`}
                          className="w-8 h-8 flex-none rounded-full flex items-center justify-center text-white/0 group-hover:text-white/50 hover:!text-white hover:bg-white/10 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[18px]">done_all</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {remaining > 0 && (
                  <button onClick={() => setVisible(shownCount + BATCH * 2)} className="mt-2 w-full py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] text-[12.5px] font-medium text-on-surface-variant hover:text-white transition-colors">
                    Mostrar más capítulos ({remaining} restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
