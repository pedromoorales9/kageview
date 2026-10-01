import { proxyGet } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider, MangaGenre, MangaSort } from '../types';

// ═══════════════════════════════════════════════════════════
// WEBTOON en español (webtoons.com/es) — la plataforma oficial, solo "Originales"
//
//   · Listados: HTML. Cada tarjeta es `ul.webtoon_list li a[data-title-no]`.
//       - `/es/originals/{lunes…domingo}?sortOrder=UPDATE|MANA` (series en emisión por día)
//       - `/es/originals/complete`   (series terminadas)
//       - `/es/ranking/popular`      (top 30 de popularidad)
//       - `/es/genres/{género}?sortOrder=…` (todo el género en una página)
//   · Búsqueda: JSON, `/es/search/immediate?keyword&start&display` (máx. ~30 resultados).
//   · Capítulos: JSON del sitio móvil, `m.webtoons.com/api/v1/webtoon/{titleNo}/episodes`
//       con `pageSize` y `cursor` (devuelve la lista entera en una petición).
//   · Páginas: HTML del lector (`…/viewer?title_no&episode_no`), imágenes `img._images[data-url]`.
//
// IMPORTANTE: las imágenes (webtoon-phinf.pstatic.net) devuelven 403 sin
// `Referer: https://www.webtoons.com/` — hay que añadirlo en main.ts por host (`pstatic.net`).
// Los títulos +18 no aparecen sin iniciar sesión, así que no hay contenido adulto aquí.
// ═══════════════════════════════════════════════════════════

const BASE = 'https://www.webtoons.com';
const MOBILE_API = 'https://m.webtoons.com/api/v1/webtoon';
/** Las miniaturas de búsqueda y de capítulos vienen como ruta relativa a este host. */
const THUMB_HOST = 'https://swebtoon-phinf.pstatic.net';

/**
 * Resultados por página. Las páginas "llenas" de los listados traen ≥ 30, pero la
 * búsqueda devuelve ≤ 30 y algunas entradas son de autores (se descartan), así
 * que se declara 20 para que una página de búsqueda casi llena siga contando como llena.
 */
const PAGE_SIZE = 20;
/** Trozo de listado que se devuelve por página en las vistas paginadas en cliente. */
const SLICE = 30;
/** Resultados pedidos al buscador por página (su máximo real ronda los 30). */
const SEARCH_DISPLAY = 30;
const EPISODES_CHUNK = 500;
const MAX_EPISODE_LOOPS = 10;
const CATALOG_TTL_MS = 30 * 60 * 1000;
const CATALOG_CONCURRENCY = 3;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'es-ES,es;q=0.9',
  Referer: `${BASE}/`,
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** Géneros de la web (id = trozo de la URL `/es/genres/{id}`). */
const GENRES: MangaGenre[] = [
  { id: 'action', name: 'Acción' },
  { id: 'comedy', name: 'Comedia' },
  { id: 'drama', name: 'Drama' },
  { id: 'fantasy', name: 'Fantasía' },
  { id: 'heartwarming', name: 'Conmovedor' },
  { id: 'historical', name: 'Histórico' },
  { id: 'horror', name: 'Terror' },
  { id: 'mystery', name: 'Misterio' },
  { id: 'romance', name: 'Romance' },
  { id: 'sf', name: 'Ciencia ficción' },
  { id: 'slice_of_life', name: 'Vida cotidiana' },
  { id: 'sports', name: 'Deportes' },
  { id: 'super_hero', name: 'Superhéroes' },
  { id: 'supernatural', name: 'Paranormal' },
  { id: 'thriller', name: 'Suspenso' },
  { id: 'tiptoon', name: 'Informativo' },
];

// ─── Utilidades ──────────────────────────────────────────────────

async function getText(url: string, params?: Record<string, string | number>): Promise<string> {
  const res = await proxyGet<any>(url, { headers: HEADERS, params, retries: 1 });
  if (typeof res.data !== 'string') throw new Error('WEBTOON devolvió una respuesta inesperada (no es HTML)');
  return res.data;
}

async function getJson(url: string, params?: Record<string, string | number>): Promise<any> {
  const res = await proxyGet<any>(url, { headers: HEADERS, params, retries: 1 });
  let data = res.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new Error('WEBTOON devolvió una respuesta que no es JSON');
    }
  }
  if (!data || typeof data !== 'object') throw new Error('WEBTOON devolvió una respuesta vacía');
  return data;
}

/** "606,217" → 606217; "1.1M" → 1100000; "12K" → 12000. */
export function parseLikes(raw: string | null | undefined): number {
  const s = (raw ?? '').trim().toUpperCase();
  const m = /^([\d.,]+)\s*([KM])?$/.exec(s);
  if (!m) return 0;
  if (m[2]) {
    const n = parseFloat(m[1].replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * (m[2] === 'M' ? 1_000_000 : 1_000)) : 0;
  }
  return parseInt(m[1].replace(/[.,]/g, ''), 10) || 0;
}

function httpsUrl(url: string | null | undefined): string {
  if (!url) return '';
  const u = url.trim();
  if (u.startsWith('//')) return `https:${u}`;
  return u.replace(/^http:\/\//i, 'https://');
}

interface Card {
  manga: MangaModel;
  likes: number;
}

/** Lee las tarjetas de un listado (`ul.webtoon_list li a[data-title-no]`). */
function parseCards(html: string, status: MangaModel['status'] = 'ongoing'): Card[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: Card[] = [];
  const seen = new Set<string>();
  doc.querySelectorAll('ul.webtoon_list li a[data-title-no]').forEach((a) => {
    const id = (a.getAttribute('data-title-no') ?? '').trim();
    if (!/^\d+$/.test(id) || seen.has(id)) return;
    const title = (a.querySelector('.title')?.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!title) return;
    const genre = (a.querySelector('.genre')?.textContent ?? '').trim();
    seen.add(id);
    out.push({
      likes: parseLikes(a.querySelector('.view_count')?.textContent),
      manga: {
        id,
        sourceId: 'webtoons',
        title,
        description: '',
        coverUrl: httpsUrl(a.querySelector('img')?.getAttribute('src')),
        status,
        tags: genre ? [genre] : [],
        year: null,
        lastChapter: null,
        isAdult: false,
      },
    });
  });
  return out;
}

const byLikes = (a: Card, b: Card) => b.likes - a.likes || a.manga.title.localeCompare(b.manga.title, 'es');

// ─── Catálogo completo (7 días + terminadas), en memoria ─────────

let catalogCache: { at: number; promise: Promise<Card[]> } | null = null;

async function loadCatalog(): Promise<Card[]> {
  if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.promise;
  const promise = buildCatalog();
  const entry = { at: Date.now(), promise };
  catalogCache = entry;
  promise.catch(() => {
    if (catalogCache === entry) catalogCache = null; // no cachear un fallo
  });
  return promise;
}

async function buildCatalog(): Promise<Card[]> {
  const pages: Array<{ path: string; status: MangaModel['status'] }> = [
    ...WEEKDAYS.map((d) => ({ path: d, status: 'ongoing' as const })),
    { path: 'complete', status: 'completed' as const },
  ];
  const all = new Map<string, Card>();
  let ok = 0;
  let lastError: unknown = null;
  // De pocas en pocas, para no martillear el servidor.
  for (let i = 0; i < pages.length; i += CATALOG_CONCURRENCY) {
    const batch = pages.slice(i, i + CATALOG_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          return parseCards(await getText(`${BASE}/es/originals/${p.path}`, { sortOrder: 'MANA' }), p.status);
        } catch (e) {
          lastError = e;
          return null;
        }
      })
    );
    for (const cards of results) {
      if (!cards) continue;
      ok++;
      for (const c of cards) if (!all.has(c.manga.id)) all.set(c.manga.id, c);
    }
  }
  if (ok === 0) throw lastError instanceof Error ? lastError : new Error('No se pudo cargar el catálogo de WEBTOON');
  return [...all.values()];
}

/** Solo para pruebas: olvida el catálogo en memoria. */
export function resetWebtoonsCache(): void {
  catalogCache = null;
}

// ─── Capítulos ───────────────────────────────────────────────────

const GENERIC_TITLE = /^(?:ep(?:isodio)?|cap(?:[ií]tulo)?|ch(?:apter)?)\.?\s*\d+(?:\.\d+)?$/i;

function toChapter(ep: any): MangaChapterModel | null {
  const link = typeof ep?.viewerLink === 'string' ? ep.viewerLink.trim() : '';
  const no = ep?.episodeNo;
  if (!link || no == null) return null;
  const rawTitle = String(ep?.episodeTitle ?? '').trim();
  const ms = Number(ep?.exposureDateMillis);
  return {
    id: link, // ruta + query del lector: basta para abrirlo
    sourceId: 'webtoons',
    chapter: String(no),
    volume: null,
    title: rawTitle && !GENERIC_TITLE.test(rawTitle) ? rawTitle : null,
    pages: 0,
    publishAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '',
    translatedLanguage: 'es',
  };
}

// ─── Provider ────────────────────────────────────────────────────

export const WebtoonsProvider: MangaProvider = {
  id: 'webtoons',
  name: 'WEBTOON',
  pageSize: PAGE_SIZE,

  /** Buscador de la web (solo títulos de Originales; devuelve ≤ 30 resultados). */
  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const keyword = query.trim();
    if (!keyword) return [];
    const json = await getJson(`${BASE}/es/search/immediate`, {
      keyword,
      start: (Math.max(1, page) - 1) * SEARCH_DISPLAY + 1,
      display: SEARCH_DISPLAY,
    });
    if (json.success === false) throw new Error('El buscador de WEBTOON falló');
    const list: any[] = Array.isArray(json?.result?.searchedList) ? json.result.searchedList : [];
    const out: MangaModel[] = [];
    for (const it of list) {
      // también devuelve entradas de autores (searchMode "AUTHOR") sin título
      if (it?.searchMode && it.searchMode !== 'TITLE') continue;
      if (it?.titleNo == null || !it.title) continue;
      const thumb = typeof it.thumbnailMobile === 'string' ? it.thumbnailMobile : '';
      out.push({
        id: String(it.titleNo),
        sourceId: 'webtoons',
        title: String(it.title).trim(),
        description: '',
        coverUrl: thumb.startsWith('/') ? `${THUMB_HOST}${thumb}` : httpsUrl(thumb),
        status: 'ongoing',
        tags: it.representGenre ? [String(it.representGenre)] : [],
        year: null,
        lastChapter: null,
        isAdult: false,
      });
    }
    return out;
  },

  /** Página 1 = el ranking oficial (top 30); las siguientes, el catálogo por "me gusta". */
  async getPopularManga(page = 1): Promise<MangaModel[]> {
    if (page <= 1) {
      try {
        const top = parseCards(await getText(`${BASE}/es/ranking/popular`));
        if (top.length > 0) return top.map((c) => c.manga);
      } catch {
        /* si el ranking falla, se sirve desde el catálogo */
      }
    }
    const sorted = (await loadCatalog()).slice().sort(byLikes);
    const start = (Math.max(1, page) - 1) * SLICE;
    return sorted.slice(start, start + SLICE).map((c) => c.manga);
  },

  /**
   * La web no tiene "recientes" paginado: cada serie sale un día fijo de la semana.
   * Página 1 = las series de hoy (por fecha de actualización), 2 = ayer… hasta 7 días.
   */
  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    if (page < 1 || page > 7) return [];
    const day = WEEKDAYS[(new Date().getDay() - (page - 1) + 7) % 7];
    const cards = parseCards(await getText(`${BASE}/es/originals/${day}`, { sortOrder: 'UPDATE' }));
    return cards.map((c) => c.manga);
  },

  /** Todos los episodios con una sola petición (con cursor por si alguna serie es enorme). */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const titleNo = String(mangaId).trim();
    if (!/^\d+$/.test(titleNo)) throw new Error(`Id de serie de WEBTOON no válido: ${mangaId}`);

    const chapters: MangaChapterModel[] = [];
    let cursor = 0;
    for (let i = 0; i < MAX_EPISODE_LOOPS; i++) {
      const params: Record<string, string | number> = { pageSize: EPISODES_CHUNK };
      if (cursor > 0) params.cursor = cursor;
      const json = await getJson(`${MOBILE_API}/${titleNo}/episodes`, params);
      if (json.success === false || !json.result) throw new Error('WEBTOON no devolvió los capítulos de la serie');
      const list: any[] = Array.isArray(json.result.episodeList) ? json.result.episodeList : [];
      for (const ep of list) {
        const ch = toChapter(ep);
        if (ch) chapters.push(ch);
      }
      const next = Number(json.result.nextCursor);
      if (!Number.isFinite(next) || next <= cursor || list.length === 0) break;
      cursor = next;
    }
    return chapters;
  },

  /** `chapterId` = ruta del lector (`/es/drama/lookism/ep-1/viewer?title_no=1930&episode_no=1`). */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    if (!/^(?:https:\/\/(?:www|m)\.webtoons\.com)?\/es\/.+\/viewer\?/.test(chapterId)) {
      throw new Error(`Id de capítulo de WEBTOON no válido: ${chapterId}`);
    }
    const url = chapterId.startsWith('/') ? `${BASE}${chapterId}` : chapterId;
    const html = await getText(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const data: string[] = [];
    doc.querySelectorAll('img._images').forEach((img) => {
      const src = httpsUrl(img.getAttribute('data-url'));
      if (!src || data.includes(src)) return;
      // La primera "página" suele ser un aviso de clasificación por edades del propio sitio
      if (data.length === 0 && /warning\.(?:png|jpe?g|webp)/i.test(src)) return;
      data.push(src);
    });
    if (data.length === 0) {
      throw new Error('WEBTOON no devolvió imágenes (capítulo bloqueado, de pago o con restricción de edad)');
    }
    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },

  async getGenres(): Promise<MangaGenre[]> {
    return GENRES.map((g) => ({ ...g }));
  },

  /** Con género: la página del género entera, ordenada y troceada en cliente. */
  async browse({ genre, sort, page }: { genre?: string; sort: MangaSort; page: number }): Promise<MangaModel[]> {
    const start = (Math.max(1, page) - 1) * SLICE;
    if (genre) {
      if (!GENRES.some((g) => g.id === genre)) throw new Error(`Género de WEBTOON desconocido: ${genre}`);
      const order = sort === 'recent' ? 'UPDATE' : sort === 'rating' ? 'LIKEIT' : 'MANA';
      let cards = parseCards(await getText(`${BASE}/es/genres/${genre}`, { sortOrder: order }));
      if (sort === 'az') cards = cards.slice().sort((a, b) => a.manga.title.localeCompare(b.manga.title, 'es'));
      return cards.slice(start, start + SLICE).map((c) => c.manga);
    }
    if (sort === 'recent') return this.getRecentlyUpdatedManga(page);
    if (sort === 'az') {
      const all = (await loadCatalog()).slice().sort((a, b) => a.manga.title.localeCompare(b.manga.title, 'es'));
      return all.slice(start, start + SLICE).map((c) => c.manga);
    }
    if (sort === 'rating') {
      const all = (await loadCatalog()).slice().sort(byLikes);
      return all.slice(start, start + SLICE).map((c) => c.manga);
    }
    return this.getPopularManga(page);
  },
};
