import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MangaModel, MangaChapterModel, getMangaProvider, chapterLabel } from '../../../modules/manga';
import {
  flushMangaData,
  getRecord,
  recordOpen,
  recordPage,
  setChapterRead,
} from '../../../modules/manga/mangaStore';
import {
  ReadingDirection,
  ReadingMode,
  Step,
  alignToSpread,
  arrowStep,
  buildPageUrls,
  chapterProgress,
  clickZone,
  currentCascadePage,
  pageStep,
  reachedEnd,
  resumePage,
  siblingIndex,
} from '../../../modules/manga/readerLogic';
import { startReading, stopReading, updateReadingPage } from '../../../modules/manga/readingPresence';
import { getCache, setCache } from '../../../modules/cache';
import { proxyHead } from '../../../modules/httpProxy';

/** Preferencias del lector persistidas entre sesiones. */
interface ReaderPrefs {
  readingMode?: ReadingMode;
  cascadeWidth?: 'md' | 'lg' | 'xl' | 'full';
  brightness?: number;
  direction?: ReadingDirection;
  dataSaver?: boolean;
}

interface MangaReaderProps {
  manga: MangaModel;
  /** SIEMPRE en orden ascendente (capítulo 1 → último). */
  chapters: MangaChapterModel[];
  initialChapterIndex: number;
  onExit: () => void;
}

const CASCADE_WIDTH_CLASS = { md: 'max-w-3xl', lg: 'max-w-5xl', xl: 'max-w-7xl', full: 'max-w-none' } as const;
const UI_HIDE_MS = 2600;

const SHORTCUTS: Array<[string, string]> = [
  ['← →', 'Página (según la dirección)'],
  ['Espacio / ↓', 'Bajar · Shift para subir'],
  ['N  /  P', 'Capítulo siguiente / anterior'],
  ['1  2  3', 'Página · doble · cascada'],
  ['D', 'Cambiar dirección de lectura'],
  ['H', 'Ocultar / mostrar controles'],
  ['F', 'Pantalla completa'],
  ['Esc', 'Salir'],
];

function withRetry(url: string, n: number): string {
  return n === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}kvretry=${n}`;
}

export default function MangaReader({ manga, chapters, initialChapterIndex, onExit }: MangaReaderProps) {
  const [chapterIndex, setChapterIndex] = useState(initialChapterIndex);
  const chapter = chapters[chapterIndex];

  const [pages, setPages] = useState<string[]>([]);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [readingMode, setReadingMode] = useState<ReadingMode>('cascade');
  const [direction, setDirection] = useState<ReadingDirection>('ltr');
  const [cascadeWidth, setCascadeWidth] = useState<'md' | 'lg' | 'xl' | 'full'>('md');
  const [brightness, setBrightness] = useState(100);
  const [dataSaver, setDataSaver] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [pageIndex, setPageIndex] = useState(0);        // modos paginados
  const [cascadePage, setCascadePage] = useState(0);    // modo cascada
  const paged = readingMode !== 'cascade';
  const currentPage = paged ? pageIndex : cascadePage;

  const [pageDims, setPageDims] = useState<Record<number, { w: number; h: number }>>({});
  const [retries, setRetries] = useState<Record<number, number>>({});
  const [brokenPages, setBrokenPages] = useState<Record<number, boolean>>({});

  const [uiVisible, setUiVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overNav = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Array<HTMLDivElement | null>>([]);
  const resumeRef = useRef<number | null>(null);          // página a la que volver al abrir (cascada)
  const openAtEnd = useRef(false);                        // al abrir, ir a la ÚLTIMA página (vienes del capítulo siguiente)
  const finishedRef = useRef(false);                      // ya marcado como leído
  const prefetched = useRef(new Map<string, ReturnType<ReturnType<typeof getMangaProvider>['getChapterPages']> extends Promise<infer R> ? R : never>());
  const prefetching = useRef(new Set<string>());
  const modeRef = useRef(readingMode);
  const saverRef = useRef(dataSaver);
  modeRef.current = readingMode;
  saverRef.current = dataSaver;

  const label = chapter ? chapterLabel(chapter) : '';
  const total = chapters.length;
  const prevIdx = siblingIndex(chapterIndex, total, 'prev');
  const nextIdx = siblingIndex(chapterIndex, total, 'next');

  // ─── Dimensiones y tiras de webtoon ──────────────────────
  const registerDims = (i: number) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0) {
      setPageDims((prev) => (prev[i] ? prev : { ...prev, [i]: { w: img.naturalWidth, h: img.naturalHeight } }));
    }
    if (resumeRef.current !== null && i <= resumeRef.current) scrollToPage(resumeRef.current);
  };
  const isStrip = (i: number) => {
    const d = pageDims[i];
    return !!d && d.h / d.w > 2.5;
  };
  const doubleStripMode = readingMode === 'double' && (isStrip(pageIndex) || isStrip(pageIndex + 1));

  // ─── Preferencias persistentes ───────────────────────────
  const prefsLoaded = useRef(false);
  useEffect(() => {
    getCache<ReaderPrefs>('readerPrefs')
      .then((saved) => {
        if (saved?.readingMode) setReadingMode(saved.readingMode);
        if (saved?.cascadeWidth) setCascadeWidth(saved.cascadeWidth);
        if (typeof saved?.brightness === 'number') setBrightness(saved.brightness);
        if (saved?.direction) setDirection(saved.direction);
        if (typeof saved?.dataSaver === 'boolean') setDataSaver(saved.dataSaver);
      })
      .finally(() => { prefsLoaded.current = true; });
  }, []);
  useEffect(() => {
    if (!prefsLoaded.current) return;
    const t = setTimeout(() => {
      setCache('readerPrefs', { readingMode, cascadeWidth, brightness, direction, dataSaver } satisfies ReaderPrefs);
    }, 800);
    return () => clearTimeout(t);
  }, [readingMode, cascadeWidth, brightness, direction, dataSaver]);

  // ─── Controles que se ocultan solos ──────────────────────
  const showUi = useCallback(() => {
    setUiVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!overNav.current) setUiVisible(false);
    }, UI_HIDE_MS);
  }, []);
  useEffect(() => {
    showUi();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [showUi]);
  const chromeVisible = uiVisible || settingsOpen || loadingChapter || !!error;

  // ─── Desplazamiento a una página (cascada) ───────────────
  const scrollToPage = useCallback((i: number) => {
    const el = pageEls.current[i];
    const box = scrollRef.current;
    if (!el || !box) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTop = Math.max(0, top - 56);
  }, []);

  // ─── Cargar el capítulo ──────────────────────────────────
  useEffect(() => {
    if (!chapter) return;
    let cancelled = false;
    setLoadingChapter(true);
    setError(null);
    setPages([]);
    setPageIndex(0);
    setCascadePage(0);
    setPageDims({});
    setRetries({});
    setBrokenPages({});
    setZoomLevel(1);
    finishedRef.current = false;
    resumeRef.current = null;
    pageEls.current = [];
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const provider = getMangaProvider(manga.sourceId);
    const pagesPromise = prefetched.current.get(chapter.id)
      ? Promise.resolve(prefetched.current.get(chapter.id)!)
      : provider.getChapterPages(chapter.id);

    pagesPromise
      .then((pagesData) => {
        if (cancelled) return;
        const urls = buildPageUrls(pagesData, saverRef.current);
        if (urls.length === 0) {
          setError('Este capítulo no tiene páginas disponibles.');
          setLoadingChapter(false);
          return;
        }

        // ManhwaWeb: su API sigue listando capítulos cuyas imágenes ya no existen.
        // Sondear la primera evita mostrar un capítulo entero de imágenes rotas.
        if (manga.sourceId === 'manhwaweb') {
          proxyHead(urls[0], { headers: { Referer: 'https://manhwaweb.com/' } })
            .then(({ status }) => {
              if (cancelled) return;
              if (status === 403 || status === 404 || status === 410) {
                setPages([]);
                setError(
                  'Las imágenes de este capítulo ya no están disponibles en ManhwaWeb ' +
                  '(su hosting de imágenes fue eliminado). Prueba a buscar este título ' +
                  'en MangaOni o MangaDex desde la pestaña Manga.'
                );
              }
            })
            .catch(() => { /* sonda fallida ≠ capítulo roto */ });
        }

        // Dónde te quedaste (solo si es este mismo capítulo y no lo habías terminado)
        const saved = getRecord(manga)?.last;
        let start = resumePage(saved && { chapterId: saved.chapterId, page: saved.page }, chapter.id, urls.length);
        if (openAtEnd.current) start = urls.length - 1;
        openAtEnd.current = false;

        recordOpen(manga, chapter, chapterIndex, urls.length);
        startReading(manga, chapter.chapter, start, urls.length); // «leyendo ahora» para tus amigos
        setPages(urls);
        setLoadingChapter(false);

        if (start > 0) {
          if (modeRef.current === 'cascade') {
            setCascadePage(start);
            resumeRef.current = start;
            setTimeout(() => { resumeRef.current = null; }, 5000); // deja de forzar el scroll
          } else {
            setPageIndex(modeRef.current === 'double' ? alignToSpread(start) : start);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Error cargando páginas');
        setLoadingChapter(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.id]);

  // Al tener las páginas en cascada, ir a donde te quedaste
  useEffect(() => {
    if (readingMode === 'cascade' && pages.length > 0 && resumeRef.current !== null) {
      requestAnimationFrame(() => resumeRef.current !== null && scrollToPage(resumeRef.current));
    }
  }, [pages, readingMode, scrollToPage]);

  // ─── Cambio de modo: conservar la página ─────────────────
  const switchMode = (next: ReadingMode) => {
    if (next === readingMode) return;
    const page = currentPage;
    setReadingMode(next);
    if (next === 'cascade') {
      setCascadePage(page);
      resumeRef.current = null;
      setTimeout(() => scrollToPage(page), 60);
    } else {
      setPageIndex(next === 'double' ? alignToSpread(page) : page);
    }
  };

  // ─── Guardar dónde vas y marcar como leído ───────────────
  useEffect(() => {
    if (loadingChapter || !chapter || pages.length === 0) return;
    if (resumeRef.current !== null) return; // aún colocando el scroll
    recordPage(manga, chapter.id, currentPage, pages.length);
    updateReadingPage(currentPage, pages.length);
    const end = paged ? reachedEnd(pageIndex, pages.length, readingMode) : cascadePage >= pages.length - 1;
    if (end && !finishedRef.current) {
      finishedRef.current = true;
      setChapterRead(manga, chapter, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pages.length, loadingChapter]);

  // Al salir (o cerrar la app) dejar todo guardado
  useEffect(() => {
    const flush = () => { void flushMangaData(); };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
      stopReading();
    };
  }, []);

  // ─── Precarga: siguiente capítulo y páginas cercanas ─────
  useEffect(() => {
    if (!paged || pages.length === 0) return;
    for (let i = pageIndex + 1; i <= pageIndex + 4 && i < pages.length; i++) {
      const img = new Image();
      img.src = pages[i];
    }
  }, [paged, pageIndex, pages]);

  useEffect(() => {
    if (loadingChapter || pages.length === 0 || nextIdx === null) return;
    if (currentPage < Math.floor(pages.length * 0.6) && pages.length > 3) return;
    const next = chapters[nextIdx];
    if (!next || prefetched.current.has(next.id) || prefetching.current.has(next.id)) return;
    prefetching.current.add(next.id);
    getMangaProvider(manga.sourceId)
      .getChapterPages(next.id)
      .then((pd) => {
        prefetched.current.set(next.id, pd);
        buildPageUrls(pd, saverRef.current).slice(0, 2).forEach((u) => { const img = new Image(); img.src = u; });
      })
      .catch(() => prefetching.current.delete(next.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pages.length, loadingChapter, nextIdx]);

  // ─── Navegación ──────────────────────────────────────────
  const goChapter = useCallback((step: Step, atEnd = false) => {
    const idx = siblingIndex(chapterIndex, total, step);
    if (idx === null) return;
    openAtEnd.current = atEnd;
    setChapterIndex(idx);
  }, [chapterIndex, total]);

  const goPage = useCallback((step: Step) => {
    const size = pageStep(readingMode);
    if (step === 'next') {
      if (pageIndex + size < pages.length) setPageIndex(pageIndex + size);
      else goChapter('next');
    } else if (pageIndex > 0) {
      setPageIndex(Math.max(0, pageIndex - size));
    } else {
      goChapter('prev', true);
    }
  }, [readingMode, pageIndex, pages.length, goChapter]);

  const goToPage = (i: number) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    if (paged) setPageIndex(readingMode === 'double' ? alignToSpread(clamped) : clamped);
    else scrollToPage(clamped);
  };

  const scrollBox = (fraction: number) => {
    const box = scrollRef.current;
    if (box) box.scrollBy({ top: box.clientHeight * fraction, behavior: 'smooth' });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  };

  // ─── Teclado ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false);
        else onExit();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      resumeRef.current = null; // el usuario toma el control del scroll
      showUi();

      const step = paged ? arrowStep(e.key, direction) : null;
      if (step) { e.preventDefault(); goPage(step); return; }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (paged) goPage(e.shiftKey ? 'prev' : 'next');
          else scrollBox(e.shiftKey ? -0.9 : 0.9);
          break;
        case 'PageDown': e.preventDefault(); if (paged) goPage('next'); else scrollBox(0.9); break;
        case 'PageUp': e.preventDefault(); if (paged) goPage('prev'); else scrollBox(-0.9); break;
        case 'ArrowDown': case 'j': if (!paged) { e.preventDefault(); scrollBox(0.25); } break;
        case 'ArrowUp': case 'k': if (!paged) { e.preventDefault(); scrollBox(-0.25); } break;
        case 'n': case 'N': case ']': case '.': goChapter('next'); break;
        case 'p': case 'P': case '[': case ',': goChapter('prev'); break;
        case '1': switchMode('single'); break;
        case '2': switchMode('double'); break;
        case '3': switchMode('cascade'); break;
        case 'd': case 'D': setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr')); break;
        case 'h': case 'H': setUiVisible((v) => !v); break;
        case 'f': case 'F': toggleFullscreen(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, direction, settingsOpen, goPage, goChapter, onExit, showUi, readingMode, currentPage]);

  // ─── Scroll en cascada: página actual y fin de capítulo ──
  const scrollTick = useRef(false);
  const onScroll = () => {
    if (readingMode !== 'cascade' || scrollTick.current) return;
    scrollTick.current = true;
    requestAnimationFrame(() => {
      scrollTick.current = false;
      const box = scrollRef.current;
      if (!box) return;
      const boxTop = box.getBoundingClientRect().top;
      const tops = pageEls.current.map((el) => (el ? el.getBoundingClientRect().top - boxTop + box.scrollTop : Number.MAX_SAFE_INTEGER));
      const page = currentCascadePage(tops, box.scrollTop, box.clientHeight);
      setCascadePage((p) => (p === page ? p : page));
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 120 && !finishedRef.current && pages.length > 0) {
        finishedRef.current = true;
        setChapterRead(manga, chapter, true);
      }
    });
  };

  const onPageClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    goPage(clickZone(e.clientX, rect.left, rect.width, direction));
  };

  const progress = chapterProgress(currentPage, pages.length);
  const chapterOptions = useMemo(() => chapters.map((c, i) => ({ i, text: chapterLabel(c, false) })), [chapters]);

  // ─── Piezas de render ────────────────────────────────────
  const pageImg = (i: number, extra = '') => (
    brokenPages[i] ? (
      <div className="flex flex-col items-center justify-center gap-2 aspect-[3/4] w-full max-w-md rounded-xl bg-white/[0.04] text-on-surface-variant">
        <span className="material-symbols-outlined text-[36px]">broken_image</span>
        <p className="text-[12.5px]">No se pudo cargar la página {i + 1}</p>
        <button
          onClick={(e) => { e.stopPropagation(); setBrokenPages((b) => ({ ...b, [i]: false })); setRetries((r) => ({ ...r, [i]: (r[i] ?? 0) + 1 })); }}
          className="btn-glass h-8 px-4 rounded-full text-[12.5px] font-medium"
        >
          Reintentar
        </button>
      </div>
    ) : (
      <img
        src={withRetry(pages[i], retries[i] ?? 0)}
        alt={`Página ${i + 1}`}
        onLoad={registerDims(i)}
        onError={() => setBrokenPages((b) => ({ ...b, [i]: true }))}
        className={extra}
        draggable={false}
      />
    )
  );

  const navBtn = 'w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none';
  const modeBtn = (active: boolean) =>
    `w-10 h-10 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-primary text-white shadow-moon' : 'text-on-surface-variant hover:bg-white/10 hover:text-white'}`;

  const spread = readingMode === 'double' ? [pageIndex, pageIndex + 1].filter((i) => i < pages.length) : [pageIndex];
  const spreadOrder = direction === 'rtl' ? [...spread].reverse() : spread;

  return (
    <div
      className="fixed inset-0 z-[80] bg-background flex flex-col font-body select-none"
      onMouseMove={showUi}
    >
      {/* ── Barra superior ── */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 flex items-center gap-4 px-6 pt-5 pb-10 bg-gradient-to-b from-background/95 via-background/60 to-transparent pointer-events-none transition-opacity duration-300 ${chromeVisible ? 'opacity-100' : 'opacity-0'}`}
      >
        <button
          onClick={onExit}
          aria-label="Salir del lector"
          className={`w-11 h-11 flex items-center justify-center rounded-full bg-[#1a0d14]/90 ring-1 ring-white/10 text-white hover:text-secondary transition-colors ${chromeVisible ? 'pointer-events-auto' : ''}`}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className={`min-w-0 flex flex-col drop-shadow-md ${chromeVisible ? 'pointer-events-auto' : ''}`}>
          <span className="font-headline font-bold text-[19px] tracking-[-0.02em] text-white truncate">{manga.title}</span>
          <select
            value={chapterIndex}
            onChange={(e) => setChapterIndex(Number(e.target.value))}
            aria-label="Ir al capítulo"
            className="mt-0.5 -ml-1 max-w-[320px] bg-transparent text-[12.5px] font-medium text-secondary outline-none cursor-pointer [color-scheme:dark] truncate"
          >
            {chapterOptions.map((o) => <option key={chapters[o.i].id} value={o.i}>{o.text}</option>)}
          </select>
        </div>
      </div>

      {/* ── Páginas ── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={() => { resumeRef.current = null; }}
        onMouseDown={() => { resumeRef.current = null; }}
        style={{ filter: `brightness(${brightness}%)` }}
        className={`relative flex-1 w-full overflow-y-auto overflow-x-hidden ${paged ? 'pt-16 pb-28' : 'pt-14 pb-32'}`}
      >
        {loadingChapter ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
            <p className="text-[13px] text-on-surface-variant">Cargando {label}…</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 px-8">
            <span className="material-symbols-outlined text-error text-6xl">broken_image</span>
            <p className="text-[14px] text-on-surface-variant text-center max-w-sm">{error}</p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => goChapter('prev')} disabled={prevIdx === null} className="btn-glass h-10 px-5 rounded-full text-[13px] font-medium disabled:opacity-30">Capítulo anterior</button>
              <button onClick={() => goChapter('next')} disabled={nextIdx === null} className="btn-moon h-10 px-5 rounded-full text-[13px] font-semibold disabled:opacity-30">Capítulo siguiente</button>
            </div>
          </div>
        ) : readingMode === 'cascade' ? (
          <div
            className={`flex flex-col items-center w-full ${CASCADE_WIDTH_CLASS[cascadeWidth]} mx-auto px-4 origin-top transition-transform duration-300`}
            style={{ transform: `scale(${zoomLevel})` }}
          >
            {pages.map((_, i) => (
              <div
                key={i}
                ref={(el) => { pageEls.current[i] = el; }}
                className={`w-full flex justify-center ${pageDims[i] || brokenPages[i] ? '' : 'min-h-[70vh] bg-white/[0.025]'}`}
              >
                {pageImg(i, 'w-full h-auto object-contain shadow-2xl select-none')}
              </div>
            ))}

            {/* Fin del capítulo */}
            <div className="w-full py-16 text-center flex flex-col items-center gap-6">
              <span className="w-16 h-px bg-white/15" />
              <div>
                <p className="font-headline text-[15px] text-on-surface-variant">Fin de {label}</p>
                <p className="text-[12.5px] text-muted mt-1">
                  {nextIdx !== null ? 'Siguiente: ' + chapterLabel(chapters[nextIdx]) : 'Estás al día: es el último capítulo disponible.'}
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => goChapter('prev')} disabled={prevIdx === null} className="btn-glass h-11 px-6 rounded-full text-[13.5px] font-medium flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none">
                  <span className="material-symbols-outlined text-[18px]">navigate_before</span>Anterior
                </button>
                <button onClick={() => goChapter('next')} disabled={nextIdx === null} className="btn-moon h-11 px-7 rounded-full text-[14px] font-semibold flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none">
                  Siguiente<span className="material-symbols-outlined text-[18px]">navigate_next</span>
                </button>
              </div>
            </div>
          </div>
        ) : doubleStripMode ? (
          <div className={`flex items-start justify-center gap-2 px-4 pb-10 cursor-pointer min-h-full ${direction === 'rtl' ? 'flex-row-reverse' : ''}`} onClick={onPageClick}>
            {spread.map((i) => (
              <div key={i} className="w-[46%] max-w-[760px]">{pageImg(i, 'w-full h-auto object-contain shadow-2xl rounded-md')}</div>
            ))}
          </div>
        ) : readingMode === 'double' ? (
          <div className="flex items-center justify-center p-4 lg:p-8 h-[calc(100vh-150px)] cursor-pointer overflow-hidden" onClick={onPageClick}>
            <div className="flex items-center justify-center gap-1 max-h-full transition-transform duration-300" style={{ transform: `scale(${zoomLevel})` }}>
              {spreadOrder.map((i) => (
                <div key={i} className="flex max-h-[calc(100vh-170px)]">
                  {pageImg(i, 'max-h-[calc(100vh-170px)] w-auto object-contain shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] rounded-md')}
                </div>
              ))}
            </div>
          </div>
        ) : isStrip(pageIndex) ? (
          <div className="flex items-start justify-center px-4 pb-10 cursor-pointer min-h-full" onClick={onPageClick}>
            <div className="w-full max-w-3xl">{pageImg(pageIndex, 'w-full h-auto object-contain shadow-2xl rounded-md')}</div>
          </div>
        ) : (
          <div
            className={`flex items-center justify-center p-6 lg:p-10 h-[calc(100vh-150px)] cursor-pointer ${zoomLevel > 1 ? 'overflow-auto !items-start !justify-start' : ''}`}
            onClick={onPageClick}
          >
            {pages.length > 0 && (
              <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: zoomLevel > 1 ? 'top left' : 'center center' }} className="flex max-h-full max-w-full transition-transform duration-300">
                {pageImg(pageIndex, `max-h-[calc(100vh-170px)] max-w-full object-contain shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] rounded-md ${zoomLevel > 1 ? '!max-h-none !max-w-none' : ''}`)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Indicador discreto, siempre visible ── */}
      {!loadingChapter && !error && pages.length > 0 && (
        <div className={`fixed left-5 bottom-5 z-40 pointer-events-none transition-opacity duration-300 ${chromeVisible ? 'opacity-0' : 'opacity-70'}`}>
          <span className="h-7 px-3 inline-flex items-center rounded-full text-[12px] font-semibold text-white bg-black/60 ring-[0.5px] ring-white/15 tabular-nums">
            {currentPage + 1} / {pages.length}
          </span>
        </div>
      )}

      {/* ── Barra inferior ── */}
      <nav
        onMouseEnter={() => { overNav.current = true; setUiVisible(true); }}
        onMouseLeave={() => { overNav.current = false; showUi(); }}
        className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-3 py-2 rounded-2xl bg-[#1a0d14]/[0.97] ring-1 ring-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.7)] transition-all duration-300 ${chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}
      >
        {/* Capítulos */}
        <button onClick={() => goChapter('prev')} disabled={prevIdx === null} title="Capítulo anterior (P)" aria-label="Capítulo anterior" className={navBtn}>
          <span className="material-symbols-outlined text-[20px]">skip_previous</span>
        </button>

        {/* Páginas */}
        <button onClick={() => goPage(direction === 'ltr' ? 'prev' : 'next')} disabled={!paged} title="Página a la izquierda" aria-label="Página a la izquierda" className={navBtn}>
          <span className="material-symbols-outlined text-[20px]">chevron_left</span>
        </button>
        <div className="flex flex-col items-center min-w-[92px] px-1">
          <span className="font-headline font-bold text-[14px] text-white tabular-nums leading-tight">
            {pages.length > 0 ? `${currentPage + 1} / ${pages.length}` : '—'}
          </span>
          <span className="text-[10px] text-muted tabular-nums leading-tight">Cap. {chapter?.chapter ?? '?'} · {chapterIndex + 1}/{total}</span>
        </div>
        <button onClick={() => goPage(direction === 'ltr' ? 'next' : 'prev')} disabled={!paged} title="Página a la derecha" aria-label="Página a la derecha" className={navBtn}>
          <span className="material-symbols-outlined text-[20px]">chevron_right</span>
        </button>

        {/* Deslizador de página */}
        {pages.length > 1 && (
          <input
            type="range"
            min={0}
            max={pages.length - 1}
            value={currentPage}
            onChange={(e) => goToPage(Number(e.target.value))}
            aria-label="Página"
            style={{ direction: paged && direction === 'rtl' ? 'rtl' : 'ltr' }}
            className="hidden md:block w-40 mx-2 h-1.5 accent-[#ff3d5a] cursor-pointer"
          />
        )}

        <button onClick={() => goChapter('next')} disabled={nextIdx === null} title="Capítulo siguiente (N)" aria-label="Capítulo siguiente" className={navBtn}>
          <span className="material-symbols-outlined text-[20px]">skip_next</span>
        </button>

        <span className="w-px h-7 bg-white/10 mx-2" />

        {/* Modos */}
        <button onClick={() => switchMode('single')} title="Una página (1)" aria-label="Una página" aria-pressed={readingMode === 'single'} className={modeBtn(readingMode === 'single')}>
          <span className="material-symbols-outlined text-[21px]">description</span>
        </button>
        <button onClick={() => switchMode('double')} title="Doble página (2)" aria-label="Doble página" aria-pressed={readingMode === 'double'} className={modeBtn(readingMode === 'double')}>
          <span className="material-symbols-outlined text-[21px]">menu_book</span>
        </button>
        <button onClick={() => switchMode('cascade')} title="Cascada (3)" aria-label="Cascada" aria-pressed={readingMode === 'cascade'} className={modeBtn(readingMode === 'cascade')}>
          <span className="material-symbols-outlined text-[21px]">view_day</span>
        </button>

        <span className="w-px h-7 bg-white/10 mx-2" />

        {/* Herramientas */}
        <button
          onClick={() => setDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
          title={`Dirección: ${direction === 'ltr' ? 'izquierda → derecha' : 'derecha → izquierda (manga)'} (D)`}
          aria-label="Cambiar dirección de lectura"
          className={`h-9 px-2.5 rounded-lg text-[11px] font-bold tracking-wide flex items-center gap-1 transition-colors ${direction === 'rtl' ? 'bg-primary/25 text-primary' : 'text-on-surface-variant hover:bg-white/10 hover:text-white'}`}
        >
          <span className="material-symbols-outlined text-[17px]">{direction === 'ltr' ? 'east' : 'west'}</span>
          {direction === 'ltr' ? 'LTR' : 'RTL'}
        </button>
        <button
          onClick={() => setZoomLevel((z) => (z === 1 ? 1.5 : z === 1.5 ? 2 : 1))}
          title="Zoom"
          aria-label="Zoom"
          className={`${navBtn} ${zoomLevel > 1 ? '!bg-primary/20 !text-primary' : ''}`}
        >
          <span className="material-symbols-outlined text-[20px]">zoom_in</span>
        </button>
        <button onClick={toggleFullscreen} title="Pantalla completa (F)" aria-label="Pantalla completa" className={navBtn}>
          <span className="material-symbols-outlined text-[19px]">fullscreen</span>
        </button>
        <div className="relative">
          <button onClick={() => setSettingsOpen((o) => !o)} aria-label="Ajustes de lectura" aria-expanded={settingsOpen} className={`${navBtn} ${settingsOpen ? '!bg-primary/20 !text-primary' : ''}`}>
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>

          {settingsOpen && (
            <div className="absolute bottom-14 right-0 w-72 rounded-2xl bg-[#1a0d14] ring-1 ring-white/10 shadow-2xl p-4 flex flex-col gap-4">
              <h3 className="font-headline font-bold text-[14px] text-white">Ajustes de lectura</h3>

              <label className="flex items-center gap-3 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">light_mode</span>
                <input type="range" min={20} max={100} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} aria-label="Brillo" className="flex-1 h-1.5 accent-[#ff3d5a] cursor-pointer" />
                <span className="text-[11px] tabular-nums w-8 text-right">{brightness}%</span>
              </label>

              <div className="flex flex-col gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">Ancho en cascada</span>
                <div className="grid grid-cols-4 gap-1.5">
                  {([['md', 'S'], ['lg', 'M'], ['xl', 'L'], ['full', 'XL']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setCascadeWidth(v)} aria-pressed={cascadeWidth === v}
                      className={`py-1.5 rounded-lg text-[12px] font-bold transition-colors ${cascadeWidth === v ? 'bg-primary/25 text-primary ring-1 ring-primary/40' : 'bg-white/[0.06] text-on-surface-variant hover:bg-white/[0.12]'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {manga.sourceId === 'mangadex' && (
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span>
                    <span className="block text-[13px] text-white font-medium">Ahorro de datos</span>
                    <span className="block text-[11px] text-muted leading-snug">Imágenes comprimidas (se aplica al abrir el siguiente capítulo)</span>
                  </span>
                  <input type="checkbox" checked={dataSaver} onChange={(e) => setDataSaver(e.target.checked)} className="accent-[#ff3d5a] w-4 h-4" />
                </label>
              )}

              <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted mt-1">Atajos</span>
                {SHORTCUTS.map(([k, d]) => (
                  <div key={k} className="flex items-center justify-between gap-3 text-[11.5px]">
                    <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-white font-mono text-[10.5px] whitespace-nowrap">{k}</kbd>
                    <span className="text-on-surface-variant text-right">{d}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setSettingsOpen(false)} className="w-full h-9 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white text-[12.5px] font-medium transition-colors">Cerrar</button>
            </div>
          )}
        </div>
      </nav>

      {/* Barra de progreso del capítulo (fina, en el borde inferior) */}
      {!loadingChapter && !error && pages.length > 0 && (
        <div className="fixed left-0 right-0 bottom-0 h-[3px] z-40 bg-white/10 pointer-events-none" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
