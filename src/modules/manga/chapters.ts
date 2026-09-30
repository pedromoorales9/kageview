// ═══════════════════════════════════════════════════════════
// chapters — orden y etiquetas de capítulos, iguales para TODAS las fuentes
//
// Cada proveedor devolvía los capítulos en un orden distinto (InManga de mayor
// a menor; MangaDex, ManhwaWeb y MangaOni de menor a mayor), y el lector avanza
// con `índice + 1`: en InManga "siguiente capítulo" retrocedía. Aquí se
// normaliza SIEMPRE a orden ascendente (capítulo 1 → último), de modo que
// `índice + 1` es el siguiente en cualquier fuente. La interfaz decide después
// cómo mostrarlos (p. ej. los más nuevos primero).
// ═══════════════════════════════════════════════════════════

import type { MangaChapterModel } from './types';

/**
 * "12" → 12, "12.5" → 12.5, "12,5" → 12.5, "1,000" → 1000, "Extra" → null.
 * InManga escribe los capítulos ≥ 1000 con separador de miles ("1,196"), que no
 * debe confundirse con una coma decimal.
 */
export function parseChapterNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  const thousands = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?/.exec(s);
  if (thousands) {
    const n = Number(thousands[1].replace(/,/g, '') + (thousands[2] ? `.${thousands[2]}` : ''));
    return Number.isFinite(n) ? n : null;
  }
  const m = /^(\d+(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const time = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Ascendente por número de capítulo; a igualdad, por fecha; los que no tienen
 * número (extras, one-shots) van al final por fecha. Estable y sin duplicados
 * por `id`. No modifica el array recibido.
 */
export function normalizeChapters<T extends Pick<MangaChapterModel, 'id' | 'chapter' | 'publishAt'>>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  const decorated: Array<{ ch: T; n: number | null; t: number; i: number }> = [];
  list.forEach((ch, i) => {
    if (seen.has(ch.id)) return;
    seen.add(ch.id);
    decorated.push({ ch, n: parseChapterNumber(ch.chapter), t: time(ch.publishAt), i });
  });

  decorated.sort((a, b) => {
    if (a.n !== null && b.n !== null) return a.n - b.n || a.t - b.t || a.i - b.i;
    if (a.n !== null) return -1; // los numerados primero
    if (b.n !== null) return 1;
    return a.t - b.t || a.i - b.i;
  });
  return decorated.map((d) => d.ch);
}

/** Mayor número de capítulo publicado (null si ninguno tiene número). */
export function latestChapterNumber(list: readonly Pick<MangaChapterModel, 'chapter'>[]): number | null {
  let max: number | null = null;
  for (const c of list) {
    const n = parseChapterNumber(c.chapter);
    if (n !== null && (max === null || n > max)) max = n;
  }
  return max;
}

/** "Cap. 12", "Cap. 12 — Título" o, sin número, el título / "Extra". */
export function chapterLabel(ch: Pick<MangaChapterModel, 'chapter' | 'title'>, withTitle = true): string {
  const n = ch.chapter?.trim();
  const title = ch.title?.trim();
  if (n) return withTitle && title && title !== n ? `Cap. ${n} — ${title}` : `Cap. ${n}`;
  return title || 'Extra';
}

/** Número para mostrar sin ceros de sobra: 12 → "12", 12.5 → "12.5". */
export function formatChapterNumber(n: number | null): string {
  if (n === null) return '?';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Busca un capítulo por su número (para «ir al capítulo…»); -1 si no existe. */
export function findChapterIndex(list: readonly Pick<MangaChapterModel, 'chapter'>[], wanted: string): number {
  const n = parseChapterNumber(wanted);
  if (n === null) return -1;
  return list.findIndex((c) => parseChapterNumber(c.chapter) === n);
}

/**
 * Primer capítulo por leer: el siguiente al último leído (por número), o el
 * primero si no hay lectura. `read` son ids de capítulos leídos.
 */
export function firstUnreadIndex(list: readonly Pick<MangaChapterModel, 'id'>[], read: ReadonlySet<string>): number {
  let lastRead = -1;
  list.forEach((c, i) => { if (read.has(c.id)) lastRead = i; });
  const next = lastRead + 1;
  return next < list.length ? next : Math.max(0, list.length - 1);
}
