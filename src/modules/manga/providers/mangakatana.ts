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
// MangaKatana (mangakatana.com) — scraper HTML en inglés
// Catálogo de ~27.000 series con actualizaciones diarias. Sin API:
//   · listados  → #book_list .item (20 por página), paginados con /page/N
//   · detalle   → tabla `.chapters` con todos los capítulos
//   · lector    → las páginas van en un array JS (`var xxxx=['https://…',…]`)
// Las imágenes salen de i*.mangakatana.com y no exigen Referer.
// OJO: las sirve con `Content-Type: application/octet-stream`; el <img>
// las pinta igual (son PNG/JPG reales).
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://mangakatana.com';
const SOURCE_ID = 'mangakatana';
const PAGE_SIZE = 20;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,*/*',
};

/** Etiquetas que indican contenido +18 en la web. */
const ADULT_GENRES = new Set(['adult', 'erotica', 'hentai', 'loli', 'shota', 'sexual-violence']);

/** Orden del directorio (`order=`). La web no tiene orden por rating/vistas: "popular" = más capítulos. */
const ORDER_PARAM: Record<MangaSort, string> = {
  popular: 'numc',
  recent: 'latest',
  rating: 'numc',
  az: 'az',
};

/** Géneros de la web (slug → nombre). */
const GENRE_SLUGS: [string, string][] = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['comedy', 'Comedy'], ['cooking', 'Cooking'],
  ['drama', 'Drama'], ['ecchi', 'Ecchi'], ['fantasy', 'Fantasy'], ['gender-bender', 'Gender Bender'],
  ['harem', 'Harem'], ['historical', 'Historical'], ['horror', 'Horror'], ['isekai', 'Isekai'],
  ['josei', 'Josei'], ['manhua', 'Manhua'], ['manhwa', 'Manhwa'], ['martial-arts', 'Martial Arts'],
  ['mecha', 'Mecha'], ['medical', 'Medical'], ['music', 'Music'], ['mystery', 'Mystery'],
  ['one-shot', 'One Shot'], ['psychological', 'Psychological'], ['reincarnation', 'Reincarnation'],
  ['romance', 'Romance'], ['school-life', 'School Life'], ['sci-fi', 'Sci-Fi'], ['seinen', 'Seinen'],
  ['shoujo', 'Shoujo'], ['shounen', 'Shounen'], ['slice-of-life', 'Slice of Life'], ['sports', 'Sports'],
  ['super-power', 'Super Power'], ['supernatural', 'Supernatural'], ['survival', 'Survival'],
  ['time-travel', 'Time Travel'], ['tragedy', 'Tragedy'], ['webtoon', 'Webtoon'], ['yuri', 'Yuri'],
];
const GENRES: MangaGenre[] = GENRE_SLUGS.map(([id, name]) => ({ id, name }));

// ─── Utilidades ──────────────────────────────────────────────────

function toHtml(data: unknown): string {
  if (typeof data === 'string') return data;
  throw new Error('MangaKatana: respuesta inesperada (no es HTML)');
}

async function fetchHtml(url: string): Promise<string> {
  const res = await proxyGet<string>(url, { headers: HEADERS, retries: 1 });
  return toHtml(res.data);
}

/** Listado: la web responde 404 (con HTML) cuando no hay resultados o la página se pasa del final. */
async function fetchListing(url: string): Promise<MangaModel[]> {
  try {
    return parseListing(await fetchHtml(url));
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return [];
    throw err;
  }
}

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** `https://mangakatana.com/manga/one-piece.49` → `one-piece.49`. */
function mangaIdFromHref(href: string): string | null {
  const m = href.match(/\/manga\/([^/?#]+\.\d+)(?:[/?#]|$)/);
  return m ? m[1] : null;
}

function mapStatus(raw: string): MangaModel['status'] {
  const s = raw.trim().toLowerCase();
  if (s.includes('complet')) return 'completed';
  if (s.includes('hiatus')) return 'hiatus';
  if (s.includes('cancel') || s.includes('discontinu')) return 'cancelled';
  return 'ongoing';
}

/** "Chapter 12.5: Título" → { chapter: '12.5', title: 'Título' }. */
function parseChapterLabel(label: string): { chapter: string | null; volume: string | null; title: string | null } {
  const clean = label.replace(/\s+/g, ' ').trim();
  const volume = clean.match(/vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i)?.[1] ?? null;
  const m = clean.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)\s*(?:[:\-–]\s*)?(.*)$/i);
  if (m) return { chapter: m[1], volume, title: m[2].trim() || null };
  return { chapter: null, volume, title: clean || null };
}

/** "Sep-26-2026" → ISO. Cadena vacía si no se entiende. */
function parseDate(raw: string): string {
  const m = raw.trim().match(/^([A-Za-z]{3})-(\d{1,2})-(\d{4})$/);
  if (!m) return '';
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const mi = months.indexOf(m[1].toLowerCase());
  if (mi < 0) return '';
  return new Date(Date.UTC(Number(m[3]), mi, Number(m[2]))).toISOString();
}

// ─── Listados ────────────────────────────────────────────────────

function parseListing(html: string): MangaModel[] {
  const doc = parseDoc(html);
  const out: MangaModel[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('#book_list .item').forEach((item) => {
    const a = item.querySelector('h3.title a, .title a');
    const id = mangaIdFromHref(a?.getAttribute('href') ?? '');
    if (!a || !id || seen.has(id)) return;
    seen.add(id);

    const tagSlugs: string[] = [];
    const tags: string[] = [];
    item.querySelectorAll('.genres a').forEach((g) => {
      const name = (g.textContent ?? '').trim();
      const slug = (g.getAttribute('href') ?? '').split('/genre/')[1]?.replace(/\/.*$/, '') ?? '';
      if (name) tags.push(name);
      if (slug) tagSlugs.push(slug);
    });

    // "Capítulo más reciente": primer enlace de `.chapter` dentro de la tarjeta
    const lastLabel = item.querySelector('.chapters .chapter a')?.textContent ?? '';
    const last = parseChapterLabel(lastLabel).chapter;

    const cover =
      item.querySelector('.wrap_img img')?.getAttribute('src') ??
      item.querySelector('.wrap_img source')?.getAttribute('srcset') ??
      '';

    const statusRaw = item.querySelector('.status')?.textContent ?? '';
    const isAdult = tagSlugs.some((s) => ADULT_GENRES.has(s));

    out.push({
      id,
      sourceId: SOURCE_ID,
      title: (a.textContent ?? '').trim() || 'Sin título',
      description: (item.querySelector('.summary')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      coverUrl: cover,
      status: mapStatus(statusRaw),
      tags,
      year: null,
      lastChapter: last,
      ...(isAdult ? { isAdult: true } : {}),
    });
  });
  return out;
}

const pageSuffix = (page: number) => `/page/${Math.max(1, page)}`;

async function directory(order: string, page: number): Promise<MangaModel[]> {
  const qs = `?filter=1&include_mode=and&chapters=1&order=${order}`;
  return fetchListing(`${BASE_URL}/manga${pageSuffix(page)}${qs}`);
}

// ─── Provider ────────────────────────────────────────────────────

export const MangaKatanaProvider: MangaProvider = {
  id: SOURCE_ID,
  name: 'MangaKatana',
  pageSize: PAGE_SIZE,
  languages: [{ code: 'en', label: 'Inglés' }],

  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const q = encodeURIComponent(query.trim()).replace(/%20/g, '+');
    return fetchListing(`${BASE_URL}${pageSuffix(page)}?search=${q}&search_by=book_name`);
  },

  async getPopularManga(page = 1): Promise<MangaModel[]> {
    return directory(ORDER_PARAM.popular, page);
  },

  /** `/latest` ordena por la última actualización de capítulos. */
  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    return fetchListing(`${BASE_URL}/latest${pageSuffix(page)}`);
  },

  async getGenres(): Promise<MangaGenre[]> {
    return GENRES;
  },

  async browse({ genre, sort, page }): Promise<MangaModel[]> {
    const order = ORDER_PARAM[sort] ?? ORDER_PARAM.popular;
    if (!genre) return directory(order, page);
    return fetchListing(`${BASE_URL}/genre/${encodeURIComponent(genre)}${pageSuffix(page)}?order=${order}`);
  },

  /** Todos los capítulos (en inglés) de la página de la serie. El id de capítulo es `{serie}/c{n}`. */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const doc = parseDoc(await fetchHtml(`${BASE_URL}/manga/${mangaId}`));
    const out: MangaChapterModel[] = [];
    const seen = new Set<string>();

    doc.querySelectorAll('.chapters tr').forEach((row) => {
      const a = row.querySelector('.chapter a');
      const path = (a?.getAttribute('href') ?? '').match(/\/manga\/([^/?#]+\/c[^/?#]+)/)?.[1];
      if (!a || !path || seen.has(path)) return;
      seen.add(path);
      const parsed = parseChapterLabel(a.textContent ?? '');
      out.push({
        id: path,
        sourceId: SOURCE_ID,
        chapter: parsed.chapter,
        volume: parsed.volume,
        title: parsed.title,
        pages: 0,
        publishAt: parseDate(row.querySelector('.update_time')?.textContent ?? ''),
        translatedLanguage: 'en',
      });
    });
    return out;
  },

  /** Las páginas están en un array JS del HTML; el nombre de la variable es ofuscado y cambia. */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const html = await fetchHtml(`${BASE_URL}/manga/${chapterId}`);
    let best: string[] = [];
    for (const m of html.matchAll(/var\s+\w+\s*=\s*\[((?:\s*'[^']*'\s*,?)+)\s*\]\s*;/g)) {
      const urls = Array.from(m[1].matchAll(/'([^']*)'/g))
        .map((x) => x[1].trim().replace(/^http:\/\//i, 'https://'))
        .filter((u) => /^https:\/\//i.test(u));
      if (urls.length > best.length) best = urls;
    }
    return { baseUrl: '', hash: '', data: best, dataSaver: [] };
  },
};
