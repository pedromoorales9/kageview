import { proxyGet } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider, MangaGenre, MangaSort } from '../types';

// ═══════════════════════════════════════════════════════════
// Olympus Scanlation (olympusxyz.com) — API JSON en español
//
// El sitio es una SPA (Nuxt) cuyo servidor reenvía parte de la API:
//   · `SITE/api/series`          catálogo paginado (15/pág., orden alfabético)
//   · `SITE/api/series/list`     todo el catálogo (id, nombre, slug, portada) en una petición
//   · `SITE/api/new-chapters`    series por último capítulo publicado (15/pág.)
//   · `SITE/api/homepage`        populares de la portada
//   · `SITE/api/genres-statuses` géneros
//   · `SITE/api/capitulo/{slug}/{idCap}` páginas de un capítulo
// y los capítulos de una serie solo se sirven desde el panel:
//   · `PANEL/api/series/{slug}/chapters?page&direction&type` (40/pág.)
//
// El dominio cambia de vez en cuando (olympusbiblioteca.com → olympusxyz.com): basta
// con actualizar SITE/PANEL (el sitio viejo redirige al nuevo, pero el panel no).
// Las imágenes (media.imagesolymp.xyz) no exigen Referer.
// ═══════════════════════════════════════════════════════════

const SITE = 'https://olympusxyz.com';
const PANEL = 'https://panel.olympusxyz.com';
const API = `${SITE}/api`;
const PANEL_API = `${PANEL}/api`;

/** Tamaño de página del catálogo y de las novedades (y de nuestros resultados de búsqueda). */
const PAGE_SIZE = 15;
/** Salvaguarda: ninguna serie real pasa de ~1.500 capítulos (el panel da 40 por página). */
const MAX_CHAPTER_PAGES = 60;
/** Peticiones simultáneas al bajar el resto de páginas de capítulos (pocas, por cortesía). */
const CHAPTER_BATCH = 3;
/** Vigencia de la lista completa de series usada por la búsqueda. */
const LIST_TTL_MS = 10 * 60 * 1000;

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

// ─── Utilidades ──────────────────────────────────────────────────

/** El proxy ya parsea el JSON, pero por si llega como texto. */
function asJson(data: unknown): any {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      throw new Error('Olympus devolvió una respuesta que no es JSON');
    }
  }
  return data;
}

async function getJson(url: string, params?: Record<string, string | number>): Promise<any> {
  const res = await proxyGet<any>(url, { headers: HEADERS, params, retries: 1 });
  const json = asJson(res.data);
  if (!json || typeof json !== 'object' || json.error) {
    throw new Error('Olympus devolvió una respuesta inválida');
  }
  return json;
}

/** Las portadas pueden llevar espacios en la ruta ("soy el jefe final 2-lg.webp"). */
function cleanUrl(url: unknown): string {
  return typeof url === 'string' ? url.trim().replace(/ /g, '%20') : '';
}

function mapStatus(status: any): MangaModel['status'] {
  switch (Number(status?.id)) {
    case 4: // Finalizado
      return 'completed';
    case 3: // Pausado por el autor (Hiatus)
      return 'hiatus';
    case 5: // Cancelado por el autor
    case 7: // Abandonado por el scan
      return 'cancelled';
    default: // 1 Activo
      return 'ongoing';
  }
}

/** Convierte un elemento de `series`, `series/list`, `new-chapters` u `homepage` en MangaModel. */
function toManga(item: any): MangaModel | null {
  if (!item?.slug || item.type === 'novel') return null; // las novelas no son manga
  const last = Array.isArray(item.last_chapters) ? item.last_chapters[0]?.name : null;
  return {
    id: String(item.slug),
    sourceId: 'olympus',
    title: String(item.name ?? '').trim() || 'Sin título',
    description: '',
    coverUrl: cleanUrl(item.cover),
    status: mapStatus(item.status),
    tags: [],
    year: null,
    lastChapter: last != null ? String(last) : null,
    isAdult: false, // el catálogo no incluye contenido +18 (a lo sumo "Ecchi")
  };
}

function mapList(items: unknown): MangaModel[] {
  if (!Array.isArray(items)) return [];
  return items.map(toManga).filter((m): m is MangaModel => m !== null);
}

/** Minúsculas y sin acentos, para buscar sin que importen. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Lista completa de series (para la búsqueda) ────────────────

let listCache: { at: number; promise: Promise<MangaModel[]> } | null = null;

async function loadFullList(): Promise<MangaModel[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.promise;
  const promise = getJson(`${API}/series/list`).then((json) => mapList(json.data));
  const entry = { at: Date.now(), promise };
  listCache = entry;
  // no cachear un fallo
  promise.catch(() => {
    if (listCache === entry) listCache = null;
  });
  return promise;
}

/** Solo para pruebas: olvida la lista de series en memoria. */
export function resetOlympusCache(): void {
  listCache = null;
}

/** Puntuación de relevancia (menor = mejor); -1 si no coincide. */
function matchRank(title: string, terms: string[], whole: string): number {
  const t = normalize(title);
  if (!terms.every((w) => t.includes(w))) return -1;
  if (t === whole) return 0;
  if (t.startsWith(whole)) return 1;
  if (t.split(' ').some((w) => w.startsWith(terms[0]))) return 2;
  return 3;
}

// ─── Populares ───────────────────────────────────────────────────

/** Los populares de la portada (≈6): `popular_comics` viene como JSON dentro de JSON. */
async function loadHomePopular(): Promise<MangaModel[]> {
  const json = await getJson(`${API}/homepage`);
  let raw = json?.data?.popular_comics;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  return mapList(raw);
}

async function catalogPage(page: number, extra: Record<string, string | number> = {}): Promise<MangaModel[]> {
  const json = await getJson(`${API}/series`, {
    page: Math.max(1, page),
    direction: 'asc',
    type: 'comic',
    ...extra,
  });
  return mapList(json?.data?.series?.data);
}

// ─── Capítulos ───────────────────────────────────────────────────

function toChapter(slug: string, c: any): MangaChapterModel {
  const iso = c?.published_at ? new Date(c.published_at).toISOString() : '';
  return {
    id: `${slug}/${c.id}`,
    sourceId: 'olympus',
    chapter: c?.name != null && String(c.name).trim() !== '' ? String(c.name).trim() : null,
    volume: null,
    title: null,
    pages: 0,
    publishAt: iso === 'Invalid Date' ? '' : iso,
    translatedLanguage: 'es',
  };
}

async function chaptersPage(slug: string, page: number): Promise<any> {
  return getJson(`${PANEL_API}/series/${encodeURIComponent(slug)}/chapters`, {
    page,
    direction: 'desc',
    type: 'comic',
  });
}

// ─── Provider ────────────────────────────────────────────────────

export const OlympusProvider: MangaProvider = {
  id: 'olympus',
  name: 'Olympus Scanlation',
  pageSize: PAGE_SIZE,

  /** Búsqueda local sobre la lista completa (la API no tiene buscador): título sin acentos. */
  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const whole = normalize(query);
    if (!whole) return [];
    const terms = whole.split(' ');
    const all = await loadFullList();
    const ranked = all
      .map((m) => ({ m, rank: matchRank(m.title, terms, whole) }))
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.m.title.localeCompare(b.m.title, 'es'))
      .map((x) => x.m);
    const start = (Math.max(1, page) - 1) * PAGE_SIZE;
    return ranked.slice(start, start + PAGE_SIZE);
  },

  /**
   * La API no ordena por popularidad: la página 1 empieza por los populares de la
   * portada y sigue con el catálogo (A–Z); las siguientes son el catálogo.
   */
  async getPopularManga(page = 1): Promise<MangaModel[]> {
    if (page > 1) return catalogPage(page);
    const [popular, first] = await Promise.all([
      loadHomePopular().catch(() => [] as MangaModel[]), // si falla la portada, sigue el catálogo
      catalogPage(1),
    ]);
    const seen = new Set(popular.map((m) => m.id));
    return [...popular, ...first.filter((m) => !seen.has(m.id))];
  },

  /** Series ordenadas por su último capítulo publicado (el más reciente primero). */
  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    const json = await getJson(`${API}/new-chapters`, { page: Math.max(1, page) });
    return mapList(json?.data);
  },

  /** Todos los capítulos (40 por petición; las páginas 2+ se piden de 3 en 3). */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const first = await chaptersPage(mangaId, 1);
    const collected: any[] = Array.isArray(first?.data) ? [...first.data] : [];
    const last = Math.min(Number(first?.meta?.last_page) || 1, MAX_CHAPTER_PAGES);

    for (let from = 2; from <= last; from += CHAPTER_BATCH) {
      const pages: number[] = [];
      for (let p = from; p < from + CHAPTER_BATCH && p <= last; p++) pages.push(p);
      const results = await Promise.all(pages.map((p) => chaptersPage(mangaId, p)));
      for (const r of results) if (Array.isArray(r?.data)) collected.push(...r.data);
    }

    return collected.filter((c) => c?.id != null).map((c) => toChapter(mangaId, c));
  },

  /** `chapterId` = `{slug}/{idCapítulo}` (la API necesita ambos). */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const slash = chapterId.lastIndexOf('/');
    if (slash <= 0) throw new Error(`Id de capítulo de Olympus no válido: ${chapterId}`);
    const slug = chapterId.slice(0, slash);
    const id = chapterId.slice(slash + 1);

    const json = await getJson(`${API}/capitulo/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`, {
      type: 'comic',
    });
    const pages: unknown = json?.chapter?.pages;
    if (!Array.isArray(pages)) throw new Error('Olympus no devolvió las páginas del capítulo');

    const data = pages
      .filter((u): u is string => typeof u === 'string' && u.length > 0)
      .map((u) => cleanUrl(u).replace(/^http:\/\//i, 'https://'));
    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },

  async getGenres(): Promise<MangaGenre[]> {
    const json = await getJson(`${API}/genres-statuses`);
    const genres: any[] = Array.isArray(json?.genres) ? json.genres : [];
    const seen = new Set<string>();
    const out: MangaGenre[] = [];
    for (const g of genres) {
      const name = String(g?.name ?? '').trim();
      if (g?.id == null || !name || seen.has(name.toLowerCase())) continue; // hay géneros repetidos ("Superpoderes")
      seen.add(name.toLowerCase());
      out.push({ id: String(g.id), name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  },

  /** Con género solo hay orden alfabético; sin género sirven popular / recientes / A–Z. */
  async browse({ genre, sort, page }: { genre?: string; sort: MangaSort; page: number }): Promise<MangaModel[]> {
    if (genre) return catalogPage(page, { genres: genre });
    if (sort === 'recent') return this.getRecentlyUpdatedManga(page);
    if (sort === 'az') return catalogPage(page);
    return this.getPopularManga(page);
  },
};
