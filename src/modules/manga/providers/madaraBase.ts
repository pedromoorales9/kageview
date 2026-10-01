import { proxyGet, proxyPost } from '../../httpProxy';
import {
  MangaChapterModel,
  MangaGenre,
  MangaModel,
  MangaPagesModel,
  MangaProvider,
  MangaSort,
} from '../types';

// ═══════════════════════════════════════════════════════════
// madaraBase — base reutilizable para webs WordPress con el tema Madara
// (plugin "WP Manga"). Muchas scans en español usan este tema, así que un
// único parser sirve para varias: cada web concreta solo aporta su
// configuración (`createMadaraProvider({ id, name, baseUrl, ... })`).
//
//  · Listados  → `admin-ajax.php?action=madara_load_more` (POST, `page` base 0)
//                o, si la web lo permite, el archivo HTML `/manga/page/N/`.
//  · Búsqueda  → `/?s=…&post_type=wp-manga` (y `/page/N/?s=…`).
//  · Capítulos → POST `/manga/{slug}/ajax/chapters/` (lista `li.wp-manga-chapter`).
//  · Páginas   → `/manga/{slug}/{capítulo}/` → `.reading-content img`.
//
// Ids: manga = slug; capítulo = ruta bajo `/manga/` ("{slug}/{capítulo}").
// ═══════════════════════════════════════════════════════════

export interface MadaraConfig {
  id: string;
  name: string;
  /** Sin barra final, p. ej. `https://sitio.com`. */
  baseUrl: string;
  /** `posts_per_page` del tema (suele ser 16-20): resultados por página. */
  pageSize: number;
  /** Segmento de la URL de las fichas (por defecto `manga`). */
  mangaPath?: string;
  /** `ajax`: admin-ajax madara_load_more (por defecto); `archive`: HTML `/manga/page/N/`. */
  listing?: 'ajax' | 'archive';
  /** Parámetros extra para pedir las páginas del capítulo (por defecto `style=list`). */
  readerParams?: Record<string, string>;
  /** Marca como +18 una tarjeta del listado (por defecto ninguna lo es). */
  isAdult?: (title: string, card: Element) => boolean;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── Utilidades de texto ─────────────────────────────────────────

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

const PLACEHOLDER = /dflazy|placeholder|data:image|loading\.(?:gif|svg)|default\.(?:gif|png|jpg)/i;

/** Toma la mejor URL de imagen de un <img> (los temas con carga diferida usan data-src). */
function imgUrl(img: Element | null, baseUrl: string): string {
  if (!img) return '';
  for (const attr of ['data-src', 'data-lazy-src', 'data-cfsrc', 'src']) {
    const v = clean(img.getAttribute(attr));
    if (v && !PLACEHOLDER.test(v)) {
      try {
        return new URL(v, baseUrl).toString();
      } catch {
        return '';
      }
    }
  }
  return '';
}

const MONTHS: Record<string, number> = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
};

/**
 * Fecha de un capítulo → ISO ('' si no se entiende). Admite "24/09/2026",
 * "septiembre 25, 2026", "2026-09-25" y relativas ("2 horas ago", "hace 3 días").
 */
export function parseMadaraDate(raw: string, now: Date = new Date()): string {
  const s = clean(raw).toLowerCase();
  if (!s) return '';

  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).toISOString();

  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString();

  m = /^([a-záéíóú]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && m[1] in MONTHS) return new Date(Date.UTC(+m[3], MONTHS[m[1]], +m[2])).toISOString();

  m = /(\d+)\s*(segundo|seg|minuto|min|hora|h|d[ií]a|d|semana|sem|mes|a[ñn]o)/.exec(s);
  if (m && /ago|hace/.test(s)) {
    const n = +m[1];
    const unit = m[2];
    const MIN = 60_000;
    const ms =
      unit.startsWith('seg') ? n * 1000
      : unit.startsWith('min') ? n * MIN
      : unit === 'h' || unit.startsWith('hora') ? n * 60 * MIN
      : unit === 'd' || unit.startsWith('d') ? n * 24 * 60 * MIN
      : unit.startsWith('sem') ? n * 7 * 24 * 60 * MIN
      : unit.startsWith('mes') ? n * 30 * 24 * 60 * MIN
      : n * 365 * 24 * 60 * MIN;
    return new Date(now.getTime() - ms).toISOString();
  }
  return '';
}

/**
 * "Capítulo 73 Extra 03" → { chapter: "73", title: "Extra 03" }.
 * "Capitulo 139 - FIN" → { "139", "FIN" }. "Oneshot" → { null, "Oneshot" }.
 */
export function parseChapterLabel(label: string): { chapter: string | null; title: string | null } {
  const text = clean(label);
  const m = /^(?:cap[ií]tulo|cap\.?|chapter|ch\.?|episodio|ep\.?)?\s*#?(\d+(?:[.,]\d+)?)\s*(?:[-–—:]\s*)?(.*)$/i.exec(text);
  if (m) return { chapter: m[1].replace(',', '.').replace(/^0+(?=\d)/, ''), title: clean(m[2]) || null };
  return { chapter: null, title: text || null };
}

function mapStatus(raw: string): MangaModel['status'] {
  const t = raw.toLowerCase();
  if (/finaliz|complet|termin/.test(t)) return 'completed';
  if (/paus|hiatus|espera/.test(t)) return 'hiatus';
  if (/cancel|abandon/.test(t)) return 'cancelled';
  return 'ongoing';
}

function html(res: { data: unknown }): string {
  return typeof res.data === 'string' ? res.data : '';
}

// ─── Fábrica ─────────────────────────────────────────────────────

export function createMadaraProvider(cfg: MadaraConfig): MangaProvider {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const mangaPath = cfg.mangaPath ?? 'manga';
  const listing = cfg.listing ?? 'ajax';
  const readerParams = cfg.readerParams ?? { style: 'list' };
  const headers = { 'User-Agent': UA, Referer: `${base}/` };

  /** Slug (o ruta) bajo `/manga/` de una URL de la web; '' si no es una ficha/capítulo. */
  const pathUnderManga = (href: string): string => {
    try {
      const p = new URL(href, base).pathname.replace(/^\/+|\/+$/g, '');
      const prefix = `${mangaPath}/`;
      return p.startsWith(prefix) ? p.slice(prefix.length) : '';
    } catch {
      return '';
    }
  };

  /** Tarjetas de listado (`.page-item-detail`), de búsqueda estándar o personalizada (`.sr-card`). */
  function parseCards(markup: string): MangaModel[] {
    if (!markup) return [];
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const cards = doc.querySelectorAll('.page-item-detail, .c-tabs-item__content, .sr-card');
    const out: MangaModel[] = [];
    const seen = new Set<string>();

    cards.forEach((card) => {
      const a =
        card.querySelector('.sr-card-title a, .post-title a, h3 a, h4 a, h5 a') ??
        card.querySelector(`a[href*="/${mangaPath}/"]`);
      const href = a?.getAttribute('href');
      if (!a || !href) return;
      const id = pathUnderManga(href).split('/')[0];
      if (!id || seen.has(id)) return;

      const title = clean(a.getAttribute('title')) || clean(a.textContent) || 'Sin título';
      const status = card.querySelector('.sr-badge span, .mg_status .summary-content');
      const lastLink = card.querySelector('.list-chapter .chapter-item .chapter a, .latest-chap .chapter a');
      const lastNum = lastLink ? parseChapterLabel(lastLink.textContent ?? '').chapter : null;

      seen.add(id);
      out.push({
        id,
        sourceId: cfg.id,
        title,
        description: '',
        coverUrl: imgUrl(card.querySelector('img'), base),
        status: status ? mapStatus(clean(status.textContent)) : 'ongoing',
        // Tipo (Manhwa/Manhua…) y géneros de la búsqueda, si la tarjeta los muestra
        tags: Array.from(card.querySelectorAll('.manga-title-badges, .manga-type, .sr-genre-pill'))
          .map((g) => clean(g.textContent))
          .filter(Boolean),
        year: null,
        lastChapter: lastNum,
        isAdult: cfg.isAdult ? cfg.isAdult(title, card) : false,
      });
    });
    return out;
  }

  const ORDER: Record<MangaSort, { orderby: string; meta_key?: string; order: 'asc' | 'desc'; m: string }> = {
    popular: { orderby: 'meta_value_num', meta_key: '_wp_manga_views', order: 'desc', m: 'views' },
    recent: { orderby: 'meta_value_num', meta_key: '_latest_update', order: 'desc', m: 'latest' },
    rating: { orderby: 'meta_value_num', meta_key: '_manga_avarage_reviews', order: 'desc', m: 'rating' },
    az: { orderby: 'title', order: 'asc', m: 'alphabet' },
  };

  /** Una página de un listado ordenado, opcionalmente de un género. */
  async function list(sort: MangaSort, page: number, genre?: string): Promise<MangaModel[]> {
    const o = ORDER[sort];
    if (listing === 'archive') {
      const root = genre ? `${base}/manga-genre/${encodeURIComponent(genre)}` : `${base}/${mangaPath}`;
      const url = page > 1 ? `${root}/page/${page}/` : `${root}/`;
      const res = await proxyGet<string>(url, { params: { m_orderby: o.m }, headers, retries: 1 });
      return parseCards(html(res));
    }

    const body = new URLSearchParams({
      action: 'madara_load_more',
      page: String(Math.max(0, page - 1)),
      template: 'madara-core/content/content-archive',
      'vars[paged]': '1',
      'vars[post_type]': 'wp-manga',
      'vars[post_status]': 'publish',
      'vars[posts_per_page]': String(cfg.pageSize),
      'vars[orderby]': o.orderby,
      'vars[order]': o.order,
    });
    if (o.meta_key) body.set('vars[meta_key]', o.meta_key);
    if (genre) body.set('vars[wp-manga-genre]', genre);

    const res = await proxyPost<string>(`${base}/wp-admin/admin-ajax.php`, body.toString(), {
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    return parseCards(html(res));
  }

  let genresCache: Promise<MangaGenre[]> | null = null;

  return {
    id: cfg.id,
    name: cfg.name,
    pageSize: cfg.pageSize,

    async searchManga(query: string, page = 1): Promise<MangaModel[]> {
      const q = query.trim();
      if (!q) return [];
      const url = page > 1 ? `${base}/page/${page}/` : `${base}/`;
      try {
        const res = await proxyGet<string>(url, { params: { s: q, post_type: 'wp-manga' }, headers, retries: 1 });
        return parseCards(html(res));
      } catch (e) {
        // Madara responde 404 al pedir una página de resultados que no existe
        if ((e as { status?: number })?.status === 404 && page > 1) return [];
        throw e;
      }
    },

    getPopularManga: (page = 1) => list('popular', page),
    getRecentlyUpdatedManga: (page = 1) => list('recent', page),

    async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
      const mangaUrl = `${base}/${mangaPath}/${mangaId}/`;
      let markup = '';
      try {
        const res = await proxyPost<string>(`${mangaUrl}ajax/chapters/`, '', {
          headers: { ...headers, 'X-Requested-With': 'XMLHttpRequest' },
        });
        markup = html(res);
      } catch {
        /* temas antiguos: la lista va dentro de la propia ficha */
      }
      if (!markup.includes('wp-manga-chapter')) {
        markup = html(await proxyGet<string>(mangaUrl, { headers, retries: 1 }));
      }

      const doc = new DOMParser().parseFromString(markup, 'text/html');
      const out: MangaChapterModel[] = [];
      const seen = new Set<string>();

      doc.querySelectorAll('li.wp-manga-chapter').forEach((li) => {
        const a = li.querySelector('a[href]');
        const href = a?.getAttribute('href');
        if (!a || !href) return;
        const id = pathUnderManga(href);
        if (!id || !id.includes('/') || seen.has(id)) return;
        seen.add(id);

        const { chapter, title } = parseChapterLabel(a.textContent ?? '');
        const dateEl = li.querySelector('.chapter-release-date');
        const raw = clean(dateEl?.textContent) || clean(dateEl?.querySelector('a')?.getAttribute('title'));
        out.push({
          id,
          sourceId: cfg.id,
          chapter,
          volume: null,
          title,
          pages: 0,
          publishAt: parseMadaraDate(raw),
          translatedLanguage: 'es',
        });
      });
      return out;
    },

    async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
      const res = await proxyGet<string>(`${base}/${mangaPath}/${chapterId}/`, {
        params: readerParams,
        headers,
        retries: 1,
      });
      const doc = new DOMParser().parseFromString(html(res), 'text/html');
      const imgs = doc.querySelectorAll('.reading-content img, img.wp-manga-chapter-img');
      const data: string[] = [];
      imgs.forEach((img) => {
        const url = imgUrl(img, base);
        if (url && !data.includes(url)) data.push(url);
      });
      return { baseUrl: '', hash: '', data, dataSaver: [] };
    },

    getGenres(): Promise<MangaGenre[]> {
      genresCache ??= proxyGet<string>(`${base}/`, { headers, retries: 1 })
        .then((res) => {
          const doc = new DOMParser().parseFromString(html(res), 'text/html');
          const map = new Map<string, string>();
          doc.querySelectorAll('a[href*="/manga-genre/"]').forEach((a) => {
            const slug = (a.getAttribute('href') ?? '').split('/manga-genre/')[1]?.split('/')[0];
            const name = clean(a.textContent).replace(/\s*\(\d+\)$/, '');
            if (slug && name && !map.has(slug)) map.set(slug, name);
          });
          return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
        })
        .catch((e) => {
          genresCache = null; // permitir reintentar
          throw e;
        });
      return genresCache;
    },

    browse({ genre, sort, page }): Promise<MangaModel[]> {
      return list(sort, page, genre);
    },
  };
}
