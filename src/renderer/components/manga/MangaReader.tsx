import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MangaModel, MangaChapterModel, getMangaProvider } from '../../../modules/manga';
import { saveProgress } from '../../../modules/manga/mangaLibrary';
import Spinner from '../ui/Spinner';

interface ReaderConfig {
  manga: MangaModel;
  chapters: MangaChapterModel[];
  initialChapterIndex: number;
}

interface MangaReaderProps extends ReaderConfig {
  onExit: () => void;
}

export default function MangaReader({
  manga,
  chapters,
  initialChapterIndex,
  onExit,
}: MangaReaderProps) {
  const [chapterIndex, setChapterIndex] = useState(initialChapterIndex);
  const [pages, setPages] = useState<string[]>([]);
  const [loadingChapter, setLoadingChapter] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chapter = chapters[chapterIndex];

  const [readingMode, setReadingMode] = useState<'cascade' | 'single' | 'double'>('cascade');
  const [pageIndex, setPageIndex] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Modos paginados (single/double) vs cascada vertical
  const paged = readingMode !== 'cascade';

  // Load pages whenever chapter changes
  useEffect(() => {
    if (!chapter) return;
    let cancelled = false;

    setLoadingChapter(true);
    setError(null);
    setPages([]);
    setPageIndex(0);

    // Scroll back to top on chapter change
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const provider = getMangaProvider(manga.sourceId);
    provider.getChapterPages(chapter.id)
      .then((pagesData) => {
        if (cancelled) return;
        if (pagesData.data.length === 0) {
          setError('Este capítulo no tiene páginas disponibles.');
          setLoadingChapter(false);
          return;
        }
        const urls = pagesData.data.map((filename) => {
          if (pagesData.baseUrl) {
             return `${pagesData.baseUrl}/data/${pagesData.hash}/${filename}`;
          }
          return filename; // For providers like InManga that return absolute urls
        });
        setPages(urls);
        setLoadingChapter(false);

        // Auto-save reading progress
        if (!cancelled) {
          saveProgress(
            manga.id,
            manga.sourceId,
            chapter.id,
            chapter.chapter,
            chapterIndex,
          ).catch(() => { /* silent */ });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error cargando páginas');
          setLoadingChapter(false);
        }
      });

    return () => { cancelled = true; };
  }, [chapter?.id]);

  const goPrevChapter = useCallback(() => {
    setChapterIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNextChapter = useCallback(() => {
    setChapterIndex((i) => Math.min(chapters.length - 1, i + 1));
  }, [chapters.length]);

  const goPrevPage = useCallback(() => {
    const step = readingMode === 'double' ? 2 : 1;
    if (pageIndex > 0) {
      setPageIndex((i) => Math.max(0, i - step));
    } else if (chapterIndex > 0) {
      goPrevChapter();
    }
  }, [pageIndex, chapterIndex, goPrevChapter, readingMode]);

  const goNextPage = useCallback(() => {
    const step = readingMode === 'double' ? 2 : 1;
    if (pageIndex + step < pages.length) {
      setPageIndex((i) => i + step);
    } else if (chapterIndex < chapters.length - 1) {
      goNextChapter();
    }
  }, [pageIndex, pages.length, chapterIndex, chapters.length, goNextChapter, readingMode]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onExit();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (paged) goPrevPage();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (paged) goNextPage();
          break;
        case 'PageUp':
          if (readingMode === 'cascade') {
            e.preventDefault();
            goPrevChapter();
          }
          break;
        case 'PageDown':
          if (readingMode === 'cascade') {
            e.preventDefault();
            goNextChapter();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit, goPrevChapter, goNextChapter, goPrevPage, goNextPage, readingMode]);

  const chapterLabel = chapter
    ? chapter.chapter
      ? `Capítulo ${chapter.chapter}${chapter.title ? ` — ${chapter.title}` : ''}`
      : chapter.title ?? 'Capítulo'
    : '';

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col font-body">
      {/* Cinematic Top Navigation Overlay */}
      <h1 className="fixed top-0 left-0 right-0 z-50 flex items-start justify-between p-6 bg-gradient-to-b from-background/90 via-background/40 to-transparent pointer-events-none h-32 transition-opacity duration-300">
        <div className="flex items-center gap-6 pointer-events-auto">
          <button
            onClick={onExit}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-high/40 backdrop-blur-md text-on-surface hover:bg-surface-bright hover:text-primary transition-all duration-300 group"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex flex-col drop-shadow-md">
            <span className="font-headline font-extrabold text-xl tracking-tight text-on-surface">{manga.title}</span>
            <span className="font-label text-[10px] uppercase tracking-[0.2em] text-on-surface-variant text-primary mt-1">
              {chapterLabel}
            </span>
          </div>
        </div>
      </h1>

      {/* Pages area */}
      <div 
        ref={scrollRef} 
        style={{ filter: `brightness(${brightness}%)` }}
        className={`flex-1 w-full pt-16 pb-32 overflow-y-auto overflow-x-hidden ${readingMode === 'single' ? 'flex flex-col' : ''} transition-all duration-300`}
      >
        {loadingChapter ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
            <p className="text-sm text-on-surface-variant font-label tracking-widest uppercase">Decodificando archivo...</p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 px-8">
            <span className="material-symbols-outlined text-error text-6xl drop-shadow-md">broken_image</span>
            <p className="text-sm text-on-surface-variant text-center max-w-sm">{error}</p>
            <button
              onClick={goNextChapter}
              disabled={chapterIndex >= chapters.length - 1}
              className="mt-4 px-8 py-3 rounded-full bg-primary-container text-on-primary-container text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all neon-glow disabled:opacity-30 disabled:scale-100"
            >
              Forzar Siguiente
            </button>
          </div>
        ) : readingMode === 'cascade' ? (
          <div 
            className="flex flex-col items-center gap-0 w-full max-w-3xl mx-auto px-4 transition-transform duration-300 origin-top"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            {pages.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Página ${i + 1}`}
                loading="lazy"
                className="w-full h-auto object-contain shadow-2xl select-none"
                draggable={false}
              />
            ))}

            {/* End of chapter — navigation anchor */}
            <div className="w-full py-20 text-center flex flex-col items-center">
              <span className="w-16 h-[1px] bg-outline-variant/30 inline-block mb-6"></span>
              <p className="font-headline text-on-surface-variant/40 italic font-light tracking-wide mb-8">
                Fin del {chapterLabel}
              </p>
              
              <div className="flex gap-4">
                <button
                  onClick={goPrevChapter}
                  disabled={chapterIndex === 0}
                  className="px-8 py-4 bg-surface-container-high hover:bg-surface-bright text-on-surface rounded-full font-headline font-bold text-xs tracking-widest uppercase transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <span className="material-symbols-outlined align-middle mr-2 mt-[-2px] text-sm">navigate_before</span>
                  Anterior
                </button>
                <button
                  onClick={goNextChapter}
                  disabled={chapterIndex >= chapters.length - 1}
                  className="px-10 py-4 bg-primary-container text-on-primary-container rounded-full font-headline font-bold text-xs tracking-widest uppercase hover:scale-105 transition-all duration-300 neon-glow-primary disabled:opacity-30 disabled:pointer-events-none disabled:scale-100"
                >
                  Siguiente 
                  <span className="material-symbols-outlined align-middle ml-2 mt-[-2px] text-sm">navigate_next</span>
                </button>
              </div>
            </div>
          </div>
        ) : readingMode === 'double' ? (
          /* Double Page Mode */
          <div
            className="flex-1 flex items-center justify-center p-4 lg:p-8 h-[calc(100vh-120px)] cursor-pointer select-none overflow-hidden"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickedRight = e.clientX - rect.left > rect.width / 2;
              if (clickedRight) goNextPage();
              else goPrevPage();
            }}
          >
            <div
              className="flex items-center justify-center gap-1 max-h-full transition-transform duration-300"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {pages[pageIndex] && (
                <img
                  src={pages[pageIndex]}
                  alt={`Página ${pageIndex + 1}`}
                  className="max-h-[calc(100vh-150px)] w-auto object-contain shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] rounded-md select-none"
                  draggable={false}
                />
              )}
              {pages[pageIndex + 1] && (
                <img
                  src={pages[pageIndex + 1]}
                  alt={`Página ${pageIndex + 2}`}
                  className="max-h-[calc(100vh-150px)] w-auto object-contain shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] rounded-md select-none"
                  draggable={false}
                />
              )}
            </div>
          </div>
        ) : (
          /* Single Page Mode */
          <div
            className={`flex-1 flex items-center justify-center p-8 lg:p-12 h-[calc(100vh-120px)] cursor-pointer select-none ${zoomLevel > 1 ? 'overflow-auto block items-start' : ''}`}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickedRight = e.clientX - rect.left > rect.width / 2;
              if (clickedRight) goNextPage();
              else goPrevPage();
            }}
          >
            {pages.length > 0 && (
              <img 
                src={pages[pageIndex]} 
                alt={`Página ${pageIndex + 1}`}
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: zoomLevel > 1 ? 'top left' : 'center center' }}
                className={`max-h-full max-w-full object-contain shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] rounded-md transition-transform duration-300 ${zoomLevel > 1 ? 'max-h-none max-w-none' : ''}`}
                draggable={false}
              />
            )}
          </div>
        )}
      </div>

      {/* Grand Unified Dashboard - Bottom Float */}
      <nav className="fixed bottom-6 lg:bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center px-4 py-2 bg-[#1A1820]/90 backdrop-blur-2xl rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] border border-white/5">
        
        {/* Pagination Section (Visible mainly in single/double mode, but kept for chapter tracking in cascade) */}
        <div className="flex items-center gap-1 sm:gap-2 pr-6 border-r border-white/10">
          <button
            onClick={() => paged ? setPageIndex(0) : goPrevChapter()}
            disabled={paged ? pageIndex === 0 : chapterIndex === 0}
            className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-[18px]">skip_previous</span>
          </button>

          <button
            onClick={paged ? goPrevPage : goPrevChapter}
            disabled={paged ? pageIndex === 0 && chapterIndex === 0 : chapterIndex === 0}
            className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-[18px]">navigate_before</span>
          </button>

          <div className="flex flex-col items-center justify-center min-w-[50px] mx-2">
            <span className="text-[9px] font-bold tracking-widest text-on-surface-variant/60 uppercase -mb-1">
              {paged ? 'PAGE' : 'CAP'}
            </span>
            <div className="font-headline font-bold text-sm text-primary">
              {paged ? pageIndex + 1 : chapterIndex + 1}
              <span className="text-on-surface-variant/40 mx-1 text-xs">/</span>
              <span className="text-on-surface-variant text-xs">{paged ? pages.length || 0 : chapters.length}</span>
            </div>
          </div>

          <button
            onClick={paged ? goNextPage : goNextChapter}
            disabled={paged ? pageIndex === pages.length - 1 && chapterIndex === chapters.length - 1 : chapterIndex === chapters.length - 1}
            className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-[18px]">navigate_next</span>
          </button>

          <button
            onClick={() => paged ? setPageIndex(pages.length - 1) : null}
            disabled={paged ? pageIndex === pages.length - 1 : true}
            className="w-8 h-8 rounded hover:bg-white/10 flex items-center justify-center text-on-surface-variant hover:text-white transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-[18px]">skip_next</span>
          </button>
        </div>

        {/* Viewing Modes */}
        <div className="flex items-center gap-1.5 px-6 border-r border-white/10">
          <button 
            onClick={() => setReadingMode('single')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${readingMode === 'single' ? 'bg-[#E3C6FF] text-[#30005C] shadow-[0_0_20px_rgba(227,198,255,0.4)]' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
            title="Por Páginas"
          >
            <span className="material-symbols-outlined text-xl">description</span>
          </button>
          
          <button 
            onClick={() => setReadingMode('cascade')}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${readingMode === 'cascade' ? 'bg-[#E3C6FF] text-[#30005C] shadow-[0_0_20px_rgba(227,198,255,0.4)]' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
            title="Cascada"
          >
            <span className="material-symbols-outlined text-xl">view_day</span>
          </button>

          <button
            onClick={() => { setReadingMode('double'); setPageIndex((i) => i - (i % 2)); }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${readingMode === 'double' ? 'bg-[#E3C6FF] text-[#30005C] shadow-[0_0_20px_rgba(227,198,255,0.4)]' : 'text-on-surface-variant hover:bg-white/5 hover:text-white'}`}
            title="Lectura Doble"
          >
            <span className="material-symbols-outlined text-xl">menu_book</span>
          </button>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-3 pl-6 pr-2 relative">
          
          {/* Active Brightness Slider */}
          <div className="hidden sm:flex items-center gap-3 text-on-surface-variant group">
            <span className="material-symbols-outlined text-[18px]">light_mode</span>
            <input 
              type="range" 
              min="20" 
              max="100" 
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-24 h-1.5 bg-surface-variant/30 rounded-full appearance-none cursor-pointer accent-[#E3C6FF] transition-all group-hover:bg-surface-variant/50"
            />
          </div>
          
          <button 
            className={`w-8 h-8 rounded flex items-center justify-center transition-colors ml-2 ${zoomLevel > 1 ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-white/10 hover:text-white'}`}
            onClick={() => setZoomLevel(z => z === 1 ? 1.5 : z === 1.5 ? 2 : 1)}
            title="Aumentar Zoom"
          >
            <span className="material-symbols-outlined text-[20px]">zoom_in</span>
          </button>

          <button 
            className="w-8 h-8 rounded flex items-center justify-center text-on-surface-variant hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen();
              else document.exitFullscreen();
            }}
            title="Pantalla Completa"
          >
            <span className="material-symbols-outlined text-[18px]">fullscreen</span>
          </button>

          <button 
            className={`w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center transition-colors ml-2 ${isSettingsOpen ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:bg-surface-variant/40 hover:text-white'}`}
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          >
            <span className="material-symbols-outlined text-[20px]">settings</span>
          </button>

          {/* Simple Settings Popup */}
          {isSettingsOpen && (
            <div className="absolute bottom-16 right-0 w-64 bg-surface-container-high border border-white/10 shadow-2xl rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="font-headline font-bold text-sm text-on-surface">Ajustes de Lectura</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                El modo lectura inmersiva se ha activado. Más configuraciones personales llegarán en próximas versiones.
              </p>
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition text-xs font-bold uppercase tracking-widest"
              >
                Cerrar
              </button>
            </div>
          )}

        </div>

      </nav>
    </div>
  );
}
