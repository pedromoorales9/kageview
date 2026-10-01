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
// WeebCentral (weebcentral.com) — scraper HTML en inglés
// Catálogo grande (decenas de miles de series) y actualizado a diario.
// Las listas salen de fragmentos HTMX estables:
//   · /search/data?...                 → tarjetas de series (32 por página)
//   · /series/{id}/full-chapter-list   → todos los capítulos de una serie
//   · /chapters/{id}/images?...        → <img> de cada página del capítulo
// Las imágenes (scans-*.planeptune.us / lastation.us…) no exigen Referer.
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://weebcentral.com';
const SOURCE_ID = 'weebcentral';
const PAGE_SIZE = 32;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,*/*',
};

/** Orden del buscador → valores de `sort` de la web. */
const SORT_PARAM: Record<MangaSort, [string, 'Ascending' | 'Descending']> = {
  popular: ['Popularity', 'Descending'],
  recent: ['Latest Updates', 'Descending'],
  rating: ['Subscribers', 'Descending'],
  az: ['Alphabet', 'Ascending'],
};

/** Etiquetas (`included_tag`) disponibles en el buscador de la web. */
const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Gender Bender', 'Harem',
  'Historical', 'Horror', 'Isekai', 'Josei', 'Martial Arts', 'Mature', 'Mecha', 'Mystery',
  'Psychological', 'Romance', 'School Life', 'Sci-fi', 'Seinen', 'Shoujo', 'Shounen',
  'Slice of Life', 'Sports', 'Supernatural', 'Tragedy',
].map((name): MangaGenre => ({ id: name, name }));

/** Etiquetas que, por sí solas, indican contenido +18. */
const ADULT_TAGS = new Set(['adult', 'hentai', 'smut', 'lolicon', 'shotacon']);

// ─── Utilidades ──────────────────────────────────────────────────

function toHtml(data: unknown): string {
  if (typeof data === 'string') return data;
  throw new Error('WeebCentral: respuesta inesperada (no es HTML)');
}

function parseDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

async function getHtml(path: string, params?: Record<string, string>): Promise<Document> {
  const res = await proxyGet<string>(`${BASE_URL}${path}`, { headers: HEADERS, params, retries: 1 });
  return parseDoc(toHtml(res.data));
}

function mapStatus(raw: string): MangaModel['status'] {
  switch (raw.trim().toLowerCase()) {
    case 'complete':
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    case 'canceled':
    case 'cancelled':
      return 'cancelled';
    default:
      return 'ongoing';
  }
}

/** Id de la serie: el ULID de 26 caracteres de `/series/{ULID}/{slug}`. */
function seriesIdFromHref(href: string): string | null {
  const m = href.match(/\/series\/([0-9A-Za-z]{20,32})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

/** Valor del campo `<strong>Etiqueta:</strong> <span>valor</span>` de una tarjeta. */
function fieldValue(card: Element, label: string): string {
  const strongs = Array.from(card.querySelectorAll('strong'));
  const strong = strongs.find((s) => (s.textContent ?? '').trim().toLowerCase().startsWith(label));
  const box = strong?.parentElement;
  if (!box) return '';
  return (box.textContent ?? '').replace(strong?.textContent ?? '', '').replace(/\s+/g, ' ').trim();
}

// ─── Listado de series ───────────────────────────────────────────

function parseSeriesCards(html: string): MangaModel[] {
  const doc = parseDoc(html);
  const cards = Array.from(doc.querySelectorAll('article.bg-base-300'));
  const results: MangaModel[] = [];
  const seen = new Set<string>();

  for (const card of cards) {
    const link = Array.from(card.querySelectorAll('a')).find((a) =>
      seriesIdFromHref(a.getAttribute('href') ?? '')
    );
    const id = link ? seriesIdFromHref(link.getAttribute('href') ?? '') : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    // Título: enlace con tooltip; si no, el alt de la portada ("X cover")
    const titleLink = Array.from(card.querySelectorAll('.tooltip a')).find((a) =>
      seriesIdFromHref(a.getAttribute('href') ?? '')
    );
    const alt = card.querySelector('img')?.getAttribute('alt') ?? '';
    const title =
      (titleLink?.textContent ?? '').trim() || alt.replace(/\s+cover$/i, '').trim() || 'Sin título';

    const img = card.querySelector('img');
    const source = card.querySelector('source');
    const coverUrl =
      (source?.getAttribute('srcset') ?? '').split(/\s+/)[0] || img?.getAttribute('src') || '';

    const tags = fieldValue(card, 'tag')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const yearNum = parseInt(fieldValue(card, 'year'), 10);
    const hasAdultBadge = !!card.querySelector('[data-tip="Adult Content"]');
    const isAdult = hasAdultBadge || tags.some((t) => ADULT_TAGS.has(t.toLowerCase()));

    results.push({
      id,
      sourceId: SOURCE_ID,
      title,
      description: '',
      coverUrl,
      status: mapStatus(fieldValue(card, 'status')),
      tags,
      year: Number.isFinite(yearNum) ? yearNum : null,
      lastChapter: null,
      ...(isAdult ? { isAdult: true } : {}),
    });
  }
  return results;
}

async function list(opts: {
  page: number;
  sort: MangaSort | 'match';
  text?: string;
  genre?: string;
}): Promise<MangaModel[]> {
  const [sort, order] = opts.sort === 'match' ? ['Best Match', 'Descending'] : SORT_PARAM[opts.sort];
  const params: Record<string, string> = {
    limit: String(PAGE_SIZE),
    offset: String((Math.max(1, opts.page) - 1) * PAGE_SIZE),
    sort,
    order,
    official: 'Any',
    display_mode: 'Full Display',
  };
  if (opts.text) params.text = opts.text;
  if (opts.genre) params.included_tag = opts.genre;
  const res = await proxyGet<string>(`${BASE_URL}/search/data`, { headers: HEADERS, params, retries: 1 });
  return parseSeriesCards(toHtml(res.data));
}

// ─── Capítulos ───────────────────────────────────────────────────

/** "Chapter 12.5" → 12.5 · "Dragon Ball Z 325" → 325 · "Special" → null. */
function parseChapterNumber(label: string): string | null {
  const m = label.match(/(\d+(?:\.\d+)?)\s*$/) ?? label.match(/(\d+(?:\.\d+)?)/);
  return m ? m[1] : null;
}

function parseChapterList(html: string): MangaChapterModel[] {
  const doc = parseDoc(html);
  const out: MangaChapterModel[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll('a[href*="/chapters/"]').forEach((a) => {
    const m = (a.getAttribute('href') ?? '').match(/\/chapters\/([0-9A-Za-z]{20,32})/);
    if (!m || seen.has(m[1])) return;
    seen.add(m[1]);

    const label = (a.querySelector('span.grow span')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const timeEl = a.querySelector('time');
    const rawDate = timeEl?.getAttribute('datetime') || timeEl?.textContent || '';
    const date = rawDate ? new Date(rawDate.trim()) : null;
    const chapter = parseChapterNumber(label);
    const volume = label.match(/volume\s+(\d+(?:\.\d+)?)/i)?.[1] ?? null;
    // Solo guardamos título si no es el típico "Chapter N"
    const isPlain = /^chapter\s+\d+(?:\.\d+)?$/i.test(label);

    out.push({
      id: m[1],
      sourceId: SOURCE_ID,
      chapter,
      volume,
      title: label && !isPlain ? label : null,
      pages: 0,
      publishAt: date && !isNaN(date.getTime()) ? date.toISOString() : '',
      translatedLanguage: 'en',
    });
  });
  return out;
}

// ─── Provider ────────────────────────────────────────────────────

export const WeebCentralProvider: MangaProvider = {
  id: SOURCE_ID,
  name: 'WeebCentral',
  pageSize: PAGE_SIZE,
  languages: [{ code: 'en', label: 'Inglés' }],

  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    return list({ page, sort: 'match', text: query.trim() });
  },

  async getPopularManga(page = 1): Promise<MangaModel[]> {
    return list({ page, sort: 'popular' });
  },

  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    return list({ page, sort: 'recent' });
  },

  async getGenres(): Promise<MangaGenre[]> {
    return GENRES;
  },

  async browse({ genre, sort, page }): Promise<MangaModel[]> {
    return list({ page, sort: sort ?? 'popular', genre });
  },

  /** Todos los capítulos en inglés (la web no ofrece otros idiomas). */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const res = await proxyGet<string>(`${BASE_URL}/series/${mangaId}/full-chapter-list`, {
      headers: HEADERS,
      retries: 1,
    });
    return parseChapterList(toHtml(res.data));
  },

  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const doc = await getHtml(`/chapters/${chapterId}/images`, {
      is_prev: 'False',
      current_page: '1',
      reading_style: 'long_strip',
    });
    const data: string[] = [];
    doc.querySelectorAll('section#chapter-images img, img').forEach((img) => {
      const src = (img.getAttribute('src') ?? '').trim();
      // Descartamos iconos/placeholders de la propia web (rutas relativas /static/...)
      if (/^https:\/\//i.test(src) && !data.includes(src)) data.push(src);
    });
    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },
};
