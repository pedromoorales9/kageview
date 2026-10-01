import { proxyGet } from '../../httpProxy';
import {
  MangaChapterModel,
  MangaGenre,
  MangaModel,
  MangaPagesModel,
  MangaProvider,
} from '../types';
import { parseChapterLabel, parseMadaraDate } from './madaraBase';

// ═══════════════════════════════════════════════════════════
// Mantraz Scan (mantrazscan.co) — manhwa / manhua / manga en español.
//
// Web propia (Next.js con render en servidor, HTML estático): ~5000 series con
// actualizaciones cada hora. La misma plantilla se publica en varios dominios
// espejo (p. ej. manhwass.lat) con idéntico HTML; cambiar `BASE_URL` basta.
//
//  · Recientes → `/explorar/` (15 por página: `/explorar/page/N/`), orden de última actualización.
//  · Búsqueda  → `/explorar/?q=…` (paginada igual).
//  · Género    → `/explorar/?genero=slug`.
//  · Populares → la portada solo ofrece el top 10 "Más vistos hoy" (sin paginar).
//  · Ficha     → `/manga/{slug}/` con todos los `a.ch-row` (algunos con display:none).
//  · Lector    → `/manga/{slug}/{capítulo}/` con las imágenes en el HTML.
//
// Ids: manga = slug; capítulo = "{slug}/{capítulo}" (p. ej. "mi-serie/capitulo-12.5").
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://mantrazscan.co';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: `${BASE_URL}/` };

/** `/explorar/` muestra 15 series por página. */
const PAGE_SIZE = 15;

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const absolute = (url: string | null | undefined): string => {
  const v = clean(url);
  if (!v) return '';
  try {
    return new URL(v, BASE_URL).toString();
  } catch {
    return '';
  }
};

/** "/manga/slug/capitulo-3/" → "slug/capitulo-3" ('' si no es de /manga/). */
function pathUnderManga(href: string | null | undefined): string {
  if (!href) return '';
  try {
    const p = new URL(href, BASE_URL).pathname.replace(/^\/+|\/+$/g, '');
    return p.startsWith('manga/') ? p.slice('manga/'.length) : '';
  } catch {
    return '';
  }
}

/** "Cap 17hace 2 h" → "17"; "Cap 884.5" → "884.5". */
function chipNumber(text: string | null | undefined): string | null {
  const m = /(\d+(?:\.\d+)?)/.exec(clean(text));
  return m ? m[1] : null;
}

function html(res: { data: unknown }): string {
  return typeof res.data === 'string' ? res.data : '';
}

/** Tarjetas `.s-card` del directorio y de la búsqueda. */
function parseCards(markup: string): MangaModel[] {
  if (!markup) return [];
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const out: MangaModel[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('.s-card').forEach((card) => {
    const a = card.querySelector('a.s-card-title') ?? card.querySelector('a[href^="/manga/"]');
    const id = pathUnderManga(a?.getAttribute('href')).split('/')[0];
    if (!a || !id || seen.has(id)) return;
    seen.add(id);

    // Insignias del directorio: <span title="adult|bl|shoujo|manga">
    const flags = Array.from(card.querySelectorAll('.s-card-img span[title]')).map((s) =>
      (s.getAttribute('title') ?? '').toLowerCase()
    );
    const img = card.querySelector('.s-card-img img') ?? card.querySelector('img');

    out.push({
      id,
      sourceId: 'mantrazscan',
      title: clean(a.textContent) || clean(img?.getAttribute('alt')) || 'Sin título',
      description: '',
      coverUrl: absolute(img?.getAttribute('src')),
      status: 'ongoing',
      tags: flags.filter((f) => f !== 'adult'),
      year: null,
      lastChapter: chipNumber(card.querySelector('.ch-chip')?.textContent),
      isAdult: flags.includes('adult'),
    });
  });
  return out;
}

/** El top "Más vistos hoy" de la portada (10 series). */
function parseTrending(markup: string): MangaModel[] {
  if (!markup) return [];
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const out: MangaModel[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('.tsl-slide').forEach((slide) => {
    const a = slide.querySelector('a.tsl-cover') ?? slide.querySelector('a.tsl-cta');
    const id = pathUnderManga(a?.getAttribute('href')).split('/')[0];
    if (!id || seen.has(id)) return;
    seen.add(id);
    const img = slide.querySelector('img');
    out.push({
      id,
      sourceId: 'mantrazscan',
      title: clean(slide.querySelector('.tsl-title')?.textContent) || clean(img?.getAttribute('alt')) || 'Sin título',
      description: '',
      coverUrl: absolute(img?.getAttribute('src')),
      status: 'ongoing',
      tags: [],
      year: null,
      lastChapter: chipNumber(slide.querySelector('.tsl-chip')?.textContent),
      isAdult: false,
    });
  });
  return out;
}

/**
 * Página N del directorio (con filtros opcionales). La página 1 sin parámetros
 * es una copia en caché con horas de retraso; con cualquier parámetro el servidor
 * la genera al momento, así que se pide siempre con `p`.
 */
async function explore(page: number, params: Record<string, string>): Promise<MangaModel[]> {
  const url = page > 1 ? `${BASE_URL}/explorar/page/${page}/` : `${BASE_URL}/explorar/`;
  try {
    const res = await proxyGet<string>(url, { params: { p: String(page), ...params }, headers: HEADERS, retries: 1 });
    return parseCards(html(res));
  } catch (e) {
    if ((e as { status?: number })?.status === 404 && page > 1) return []; // fuera de rango
    throw e;
  }
}

let genresCache: Promise<MangaGenre[]> | null = null;

async function getTrending(): Promise<MangaModel[]> {
  const res = await proxyGet<string>(`${BASE_URL}/`, { headers: HEADERS, retries: 1 });
  return parseTrending(html(res));
}

export const MantrazScanProvider: MangaProvider = {
  id: 'mantrazscan',
  name: 'Mantraz Scan',
  pageSize: PAGE_SIZE,

  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const q = query.trim();
    if (!q) return [];
    return explore(page, { q });
  },

  /** Solo hay el top 10 "Más vistos hoy" de la portada: una única página. */
  async getPopularManga(page = 1): Promise<MangaModel[]> {
    return page > 1 ? [] : getTrending();
  },

  getRecentlyUpdatedManga: (page = 1) => explore(page, {}),

  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const res = await proxyGet<string>(`${BASE_URL}/manga/${mangaId}/`, { headers: HEADERS, retries: 1 });
    const doc = new DOMParser().parseFromString(html(res), 'text/html');
    const out: MangaChapterModel[] = [];
    const seen = new Set<string>();

    // Incluye las filas ocultas (`display:none`) que la web muestra con "Ver todos"
    doc.querySelectorAll('a.ch-row').forEach((a) => {
      const id = pathUnderManga(a.getAttribute('href'));
      if (!id || !id.includes('/') || seen.has(id)) return;
      seen.add(id);

      const { chapter, title } = parseChapterLabel(a.querySelector('.ch-num')?.textContent ?? a.textContent ?? '');
      // La web solo da fechas relativas ("hace 14 h", "hace 3 meses"): fecha aproximada
      const rel = clean(a.querySelector('span:not(.ch-num)')?.textContent);
      out.push({
        id,
        sourceId: 'mantrazscan',
        chapter,
        volume: null,
        title,
        pages: 0,
        publishAt: parseMadaraDate(rel),
        translatedLanguage: 'es',
      });
    });
    return out;
  },

  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const res = await proxyGet<string>(`${BASE_URL}/manga/${chapterId}/`, { headers: HEADERS, retries: 1 });
    const doc = new DOMParser().parseFromString(html(res), 'text/html');
    const data: string[] = [];
    doc.querySelectorAll('img').forEach((img) => {
      const src = absolute(img.getAttribute('src'));
      const isPage = /\/WP-manga\/data\//i.test(src) || /P[áa]gina\s+\d+/i.test(img.getAttribute('alt') ?? '');
      if (isPage && src && !data.includes(src)) data.push(src);
    });
    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },

  getGenres(): Promise<MangaGenre[]> {
    genresCache ??= proxyGet<string>(`${BASE_URL}/explorar/`, { headers: HEADERS, retries: 1 })
      .then((res) => {
        const doc = new DOMParser().parseFromString(html(res), 'text/html');
        const out: MangaGenre[] = [];
        const seen = new Set<string>();
        doc.querySelectorAll('a.exp-genre[href*="genero="]').forEach((a) => {
          const slug = (a.getAttribute('href') ?? '').split('genero=')[1]?.split('&')[0] ?? '';
          const name = clean(a.textContent);
          // Algunos slugs vienen doblemente codificados (emoji): se descartan
          if (!slug || !name || slug.includes('%') || seen.has(slug)) return;
          seen.add(slug);
          out.push({ id: slug, name });
        });
        return out;
      })
      .catch((e) => {
        genresCache = null; // permitir reintentar
        throw e;
      });
    return genresCache;
  },

  /** Género + paginación; sin género, "popular" es el top de la portada y el resto, recientes. */
  async browse({ genre, sort, page }): Promise<MangaModel[]> {
    if (genre) return explore(page, { genero: genre });
    if (sort === 'popular') return MantrazScanProvider.getPopularManga(page);
    return explore(page, {});
  },
};
