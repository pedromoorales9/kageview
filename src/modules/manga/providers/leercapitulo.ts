import { proxyGet } from '../../httpProxy';
import {
  MangaModel,
  MangaChapterModel,
  MangaPagesModel,
  MangaProvider,
  MangaGenre,
  MangaSort,
} from '../types';

// ═══════════════════════════════════════════════════════════
// LeerCapitulo (leercapitulo.co) — Scraper HTML en español
// Catálogo de ~28.000 series (manga, manhwa, manhua, cómic) con capítulos
// nuevos a diario. Todo viene en el HTML, sin JavaScript ni tokens:
//   · Directorio:  /manga/?q=&genre=&sort=popular|latest|az|za&page=N  (30 por página)
//   · Detalle:     /manga/{id}/{slug}/      → lista completa de capítulos
//   · Lector:      /leer/{id}/{slug}/{cap}/ → <img data-src> con todas las páginas
// Las imágenes del lector las sirve un CDN con dominio rotatorio y NO exigen
// Referer. Un número de página fuera de rango redirige a la página 1, así que
// se comprueba la página activa del paginador para no repetir resultados.
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://www.leercapitulo.co';
const SOURCE_ID = 'leercapitulo';

/** El directorio muestra 30 títulos por página. */
const PAGE_SIZE = 30;

function headers(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: `${BASE_URL}/`,
  };
}

/** Descarga y parsea una página HTML; lanza un error claro si la web falla o pide verificación. */
async function fetchDoc(url: string, params?: Record<string, string>): Promise<Document> {
  const res = await proxyGet<string>(url, { params, headers: headers(), retries: 1 });
  const html = typeof res.data === 'string' ? res.data : '';
  if (!html) throw new Error('LeerCapitulo devolvió una respuesta vacía');
  if (/<title>\s*Just a moment/i.test(html)) {
    throw new Error('LeerCapitulo pide una verificación anti-bot; inténtalo más tarde');
  }
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Texto sin espacios de sobra ni marcas invisibles (LRM/RLM/BOM) que la web mete en algunos títulos. */
function clean(text: string | null | undefined): string {
  return (text ?? '').replace(/[‎‏﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** Ruta relativa → URL absoluta https de la web. */
function absUrl(path: string | null | undefined): string {
  if (!path) return '';
  try {
    const u = new URL(path, `${BASE_URL}/`);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return '';
  }
}

/** `/manga/{id}/{slug}/` → `{id}/{slug}` (lo mínimo para pedir la ficha). */
function mangaIdFromHref(href: string | null): string {
  if (!href) return '';
  const m = /\/manga\/([^/?#]+\/[^/?#]+)/.exec(href);
  return m ? m[1] : '';
}

/** `/leer/{id}/{slug}/{cap}/` → `{id}/{slug}/{cap}`. */
function chapterIdFromHref(href: string | null): string {
  if (!href) return '';
  const m = /\/leer\/([^/?#]+\/[^/?#]+\/[^/?#]+)/.exec(href);
  return m ? decodeURIComponent(m[1]) : '';
}

function mapStatus(raw: string): MangaModel['status'] {
  const t = raw.toLowerCase();
  if (t.includes('complet') || t.includes('finaliz')) return 'completed';
  if (t.includes('paus') || t.includes('hiatus')) return 'hiatus';
  if (t.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

/** "Capitulo 12.5" → "12.5" */
function chapterNumberFromText(text: string): string | null {
  return /(\d+(?:\.\d+)?)/.exec(text)?.[1] ?? null;
}

/** Parsea las tarjetas del directorio (`article.lc-card`). */
function parseCards(doc: Document, adultIds: ReadonlySet<string> = new Set()): MangaModel[] {
  const out: MangaModel[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('article.lc-card').forEach((card) => {
    const link = card.querySelector('a.lc-card-name');
    const id = mangaIdFromHref(link?.getAttribute('href') ?? null);
    if (!link || !id || seen.has(id)) return;
    seen.add(id);

    const type = clean(card.querySelector('.lc-card-badge')?.textContent);
    const lastChapterText = clean(card.querySelector('.lc-chapter-link')?.textContent);

    out.push({
      id,
      sourceId: SOURCE_ID,
      title: clean(link.textContent) || 'Sin título',
      description: '',
      coverUrl: absUrl(card.querySelector('.lc-card-cover img')?.getAttribute('src')),
      status: mapStatus(clean(card.querySelector('span.lc-muted')?.textContent)),
      tags: type ? [type] : [],
      year: null,
      lastChapter: chapterNumberFromText(lastChapterText),
      isAdult: adultIds.has(id),
    });
  });

  return out;
}

/** Página activa del paginador (1 si no hay paginador: resultado de una sola página). */
function activePage(doc: Document): number {
  const el = doc.querySelector('.pagination .page-item.active');
  const n = parseInt(clean(el?.textContent), 10);
  return Number.isFinite(n) ? n : 1;
}

/** Última página que enlaza el paginador. */
function lastPage(doc: Document): number {
  let max = activePage(doc);
  doc.querySelectorAll('.pagination .page-link').forEach((el) => {
    const n = parseInt(clean(el.textContent), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return max;
}

interface ListingQuery {
  q?: string;
  genre?: string;
  sort?: 'popular' | 'latest' | 'az' | 'za';
}

async function fetchListing(query: ListingQuery, page: number): Promise<Document | null> {
  const params: Record<string, string> = {};
  if (query.q) params.q = query.q;
  if (query.genre) params.genre = query.genre;
  if (query.sort) params.sort = query.sort;
  if (page > 1) params.page = String(page);
  const doc = await fetchDoc(`${BASE_URL}/manga/`, params);
  // Fuera de rango la web redirige a la página 1: no es una página real
  if (page > 1 && activePage(doc) !== page) return null;
  return doc;
}

// ─── Marca de contenido adulto ─────────────────────────────
// Las tarjetas del directorio no dicen el género, así que se descargan UNA vez
// por sesión los listados de los géneros +18 (~17 páginas, de 4 en 4) y se
// guardan los ids. Si tarda o falla, los listados salen sin la marca.
const ADULT_GENRES = ['adult', 'hentai', 'smut', 'lolicon', 'shotacon'];
const ADULT_MAX_PAGES = 15;
const ADULT_WAIT_MS = 6000;
const ADULT_CONCURRENCY = 4;

let adultIdsPromise: Promise<Set<string>> | null = null;

/** Ejecuta las tareas con un máximo de peticiones simultáneas. */
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function buildAdultIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const add = (doc: Document | null) => doc && parseCards(doc).forEach((m) => ids.add(m.id));

  const rest: Array<{ genre: string; page: number }> = [];
  await runPool(ADULT_GENRES, ADULT_CONCURRENCY, async (genre) => {
    try {
      const doc = await fetchListing({ genre }, 1);
      add(doc);
      if (doc) {
        for (let p = 2; p <= Math.min(lastPage(doc), ADULT_MAX_PAGES); p++) rest.push({ genre, page: p });
      }
    } catch {
      /* un género que falla no impide marcar los demás */
    }
  });
  await runPool(rest, ADULT_CONCURRENCY, async ({ genre, page }) => {
    try {
      add(await fetchListing({ genre }, page));
    } catch {
      /* idem */
    }
  });
  return ids;
}

/** Ids de series +18 (vacío si la carga tarda más de unos segundos; sigue en segundo plano). */
async function getAdultIds(): Promise<Set<string>> {
  adultIdsPromise ??= buildAdultIds().catch(() => {
    adultIdsPromise = null; // reintentar en el próximo listado
    return new Set<string>();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Set<string>>((resolve) => {
    timer = setTimeout(() => resolve(new Set()), ADULT_WAIT_MS);
  });
  try {
    return await Promise.race([adultIdsPromise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function list(query: ListingQuery, page: number): Promise<MangaModel[]> {
  const [doc, adultIds] = await Promise.all([fetchListing(query, page), getAdultIds()]);
  return doc ? parseCards(doc, adultIds) : [];
}

const SORT_PARAM: Record<MangaSort, ListingQuery['sort']> = {
  popular: 'popular',
  recent: 'latest',
  rating: 'popular', // la web no ofrece valoraciones: lo más cercano es popularidad
  az: 'az',
};

let genresCache: Promise<MangaGenre[]> | null = null;

export const LeerCapituloProvider: MangaProvider = {
  id: SOURCE_ID,
  name: 'LeerCapitulo',
  pageSize: PAGE_SIZE,

  /** Búsqueda por título, título alternativo o autor, paginada. */
  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const q = query.trim();
    if (!q) return [];
    return list({ q }, page);
  },

  /** Populares — orden `sort=popular` del directorio */
  async getPopularManga(page = 1): Promise<MangaModel[]> {
    return list({ sort: 'popular' }, page);
  },

  /** Recientes — series con capítulos añadidos más recientemente */
  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    return list({ sort: 'latest' }, page);
  },

  /** Géneros del filtro del directorio (el id es el slug que acepta `?genre=`). */
  async getGenres(): Promise<MangaGenre[]> {
    genresCache ??= fetchDoc(`${BASE_URL}/manga/`)
      .then((doc) => {
        const genres: MangaGenre[] = [];
        doc.querySelectorAll('#f-genre option').forEach((opt) => {
          const slug = /[?&]genre=([^&]+)/.exec(opt.getAttribute('value') ?? '')?.[1];
          const name = clean(opt.textContent);
          if (slug && name) genres.push({ id: decodeURIComponent(slug), name });
        });
        if (!genres.length) throw new Error('LeerCapitulo: no se encontraron géneros');
        return genres;
      })
      .catch((err) => {
        genresCache = null; // reintentar la próxima vez
        throw err;
      });
    return genresCache;
  },

  async browse({ genre, sort, page }): Promise<MangaModel[]> {
    return list({ genre, sort: SORT_PARAM[sort] ?? 'popular' }, page);
  },

  /** Capítulos desde la ficha `/manga/{id}/{slug}/` (todos van en el HTML). */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const doc = await fetchDoc(`${BASE_URL}/manga/${mangaId}/`);
    const chapters: MangaChapterModel[] = [];
    const seen = new Set<string>();

    doc.querySelectorAll('#chapterList a.lc-chapter-row').forEach((row) => {
      const id = chapterIdFromHref(row.getAttribute('href'));
      if (!id || seen.has(id)) return;
      seen.add(id);

      // El número viene en la URL (`.../53.50/`); el texto "Capitulo 53.50" es el respaldo
      const slugNumber = id.split('/').pop() ?? '';
      const chapter = /^\d+(?:\.\d+)?$/.test(slugNumber)
        ? slugNumber
        : chapterNumberFromText(clean(row.querySelector('.n')?.textContent));

      // Fecha "2026-09-25" → ISO
      const date = clean(row.querySelector('.d')?.textContent);
      const time = /^\d{4}-\d{2}-\d{2}/.test(date) ? Date.parse(`${date.slice(0, 10)}T00:00:00Z`) : NaN;

      chapters.push({
        id,
        sourceId: SOURCE_ID,
        chapter,
        volume: null,
        title: null,
        pages: 0, // se conoce al abrir el capítulo
        publishAt: Number.isFinite(time) ? new Date(time).toISOString() : '',
        translatedLanguage: 'es',
      });
    });

    return chapters;
  },

  /** Páginas del capítulo: `<img data-src>` dentro de `#lcPages`. */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const doc = await fetchDoc(`${BASE_URL}/leer/${chapterId}/`);
    const data: string[] = [];

    doc.querySelectorAll('#lcPages img').forEach((img) => {
      const url = absUrl(img.getAttribute('data-src') || img.getAttribute('src'));
      if (url && !data.includes(url)) data.push(url);
    });

    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },
};
