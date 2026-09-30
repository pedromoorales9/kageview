// ═══════════════════════════════════════════════════════════
// readerLogic — reglas puras del lector de manga (sin React)
//
// Dirección de lectura (izquierda→derecha o derecha→izquierda, como el manga
// japonés), qué hace cada tecla o clic, dónde retomar un capítulo y cuándo se
// da por leído. Aparte del componente para poder probarlas.
// ═══════════════════════════════════════════════════════════

import type { MangaPagesModel } from './types';

export type ReadingMode = 'cascade' | 'single' | 'double';
export type ReadingDirection = 'ltr' | 'rtl';
export type Step = 'next' | 'prev';

/** Páginas que avanza cada paso en cada modo. */
export const pageStep = (mode: ReadingMode): 1 | 2 => (mode === 'double' ? 2 : 1);

/** En doble página los pliegos empiezan siempre en índice par. */
export const alignToSpread = (page: number): number => Math.max(0, page - (page % 2));

/**
 * Clic en la mitad izquierda o derecha: en «izquierda a derecha» la derecha
 * avanza; en «derecha a izquierda» (manga) la izquierda avanza.
 */
export function clickZone(clientX: number, left: number, width: number, direction: ReadingDirection): Step {
  const rightHalf = clientX - left > width / 2;
  return direction === 'ltr' ? (rightHalf ? 'next' : 'prev') : rightHalf ? 'prev' : 'next';
}

/** Flechas laterales en modos paginados (la dirección invierte su sentido). */
export function arrowStep(key: string, direction: ReadingDirection): Step | null {
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  const right = key === 'ArrowRight';
  return direction === 'ltr' ? (right ? 'next' : 'prev') : right ? 'prev' : 'next';
}

/**
 * URLs de las páginas. MangaDex sirve dos calidades: `data` (original) y
 * `data-saver` (comprimida, ~1/3 del peso). El resto de fuentes ya dan URLs completas.
 */
export function buildPageUrls(pages: MangaPagesModel, dataSaver: boolean): string[] {
  if (!pages.baseUrl) return [...pages.data];
  const useSaver = dataSaver && pages.dataSaver.length > 0;
  const folder = useSaver ? 'data-saver' : 'data';
  const files = useSaver ? pages.dataSaver : pages.data;
  return files.map((f) => `${pages.baseUrl}/${folder}/${pages.hash}/${f}`);
}

/**
 * Página con la que abrir un capítulo: la guardada si es ese capítulo y no lo
 * habías terminado; si ya estabas en la última página, se empieza de cero.
 */
export function resumePage(
  saved: { chapterId: string; page: number } | undefined,
  chapterId: string,
  pageCount: number
): number {
  if (!saved || saved.chapterId !== chapterId || pageCount <= 0) return 0;
  if (saved.page >= pageCount - 1) return 0; // ya lo habías terminado
  return Math.max(0, Math.min(saved.page, pageCount - 1));
}

/** ¿Se ha llegado al final del capítulo (última página o último pliego)? */
export function reachedEnd(page: number, pageCount: number, mode: ReadingMode): boolean {
  if (pageCount <= 0) return false;
  return page + pageStep(mode) >= pageCount;
}

/** Porcentaje de lectura del capítulo (0–100). */
export function chapterProgress(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0;
  return Math.min(100, Math.round(((page + 1) / pageCount) * 100));
}

/** Índice del capítulo siguiente/anterior dentro de la lista (o null si no hay). */
export function siblingIndex(index: number, total: number, step: Step): number | null {
  const next = step === 'next' ? index + 1 : index - 1;
  return next >= 0 && next < total ? next : null;
}

/**
 * En cascada: página actual = la última cuyo borde superior ya pasó por el
 * punto de referencia (un tercio de la ventana). `tops` son los offsetTop de cada página.
 */
export function currentCascadePage(tops: readonly number[], scrollTop: number, viewportHeight: number): number {
  if (tops.length === 0) return 0;
  const line = scrollTop + viewportHeight * 0.35;
  let page = 0;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= line) page = i;
    else break;
  }
  return page;
}
