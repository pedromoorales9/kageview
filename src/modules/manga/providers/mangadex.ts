import { proxyGet } from '../../httpProxy';
import {
  MangaChapterModel,
  MangaGenre,
  MangaModel,
  MangaPagesModel,
  MangaProvider,
  MangaSort,
} from '../types';

const MDEX_API = 'https://api.mangadex.org';
const MDEX_COVERS = 'https://uploads.mangadex.org/covers';

// MangaDex bloquea User-Agents de navegador (Chrome/Firefox → 400 "Unsupported
// Browser"). Su API exige un UA de cliente que identifique la app, no que finja
// ser un navegador. main.ts inyecta Chrome por defecto, así que lo sobrescribimos.
const MDEX_USER_AGENT = 'KageView/1.0 (https://github.com/pedromoorales9/KageView)';
const MDEX_HEADERS = { 'User-Agent': MDEX_USER_AGENT };

const PAGE_SIZE = 24;
/** MangaDex admite como máximo 500 capítulos por petición. */
const FEED_PAGE = 500;
/** Freno de seguridad: 20 × 500 = 10 000 capítulos (ninguna serie se acerca). */
const FEED_MAX_REQUESTS = 20;

const DEFAULT_LANGUAGES = ['es', 'es-la'];

/** Idiomas de los LISTADOS (búsqueda, populares…); ampliable con el inglés. */
let listLanguages = [...DEFAULT_LANGUAGES];

/** Lo llama la interfaz al cambiar la preferencia «incluir capítulos en inglés». */
export function setMangaDexIncludeEnglish(include: boolean): void {
  listLanguages = include ? [...DEFAULT_LANGUAGES, 'en'] : [...DEFAULT_LANGUAGES];
}

function parseManga(raw: any): MangaModel {
  const attrs = raw.attributes || {};

  const titleObj: Record<string, string> = attrs.title ?? {};
  const altTitles: Record<string, string>[] = attrs.altTitles ?? [];
  const merged: Record<string, string> = {};
  altTitles.forEach((t) => Object.assign(merged, t));
  Object.assign(merged, titleObj);
  const title =
    merged['es'] ??
    merged['es-la'] ??
    merged['en'] ??
    merged['ja-ro'] ??
    merged['ja'] ??
    Object.values(merged)[0] ??
    'Sin título';

  const descObj: Record<string, string> = attrs.description ?? {};
  const description = descObj['es'] ?? descObj['es-la'] ?? descObj['en'] ?? '';

  const coverRel = (raw.relationships ?? []).find((r: any) => r.type === 'cover_art');
  const coverUrl = coverRel?.attributes?.fileName
    ? `${MDEX_COVERS}/${raw.id}/${coverRel.attributes.fileName}.256.jpg`
    : '';

  const tags = (attrs.tags ?? [])
    .map((t: any) => t.attributes?.name?.en ?? '')
    .filter(Boolean) as string[];

  return {
    id: raw.id,
    sourceId: 'mangadex',
    title,
    description,
    coverUrl,
    status: attrs.status ?? 'ongoing',
    tags,
    year: attrs.year ?? null,
    lastChapter: attrs.lastChapter ?? null,
  };
}

function baseParams(page = 1): URLSearchParams {
  const p = new URLSearchParams();
  listLanguages.forEach((l) => p.append('availableTranslatedLanguage[]', l));
  p.append('includes[]', 'cover_art');
  p.set('limit', String(PAGE_SIZE));
  p.set('offset', String(Math.max(0, page - 1) * PAGE_SIZE));
  p.append('contentRating[]', 'safe');
  p.append('contentRating[]', 'suggestive');
  return p;
}

async function list(p: URLSearchParams): Promise<MangaModel[]> {
  const res = await proxyGet<any>(`${MDEX_API}/manga?${p.toString()}`, { headers: MDEX_HEADERS, retries: 1 });
  return (res.data?.data ?? []).map(parseManga);
}

// ─── Géneros ───────────────────────────────────────────────
/** Géneros a ofrecer, en este orden: [nombre en MangaDex (inglés), etiqueta en español]. */
const CURATED_GENRES: Array<[string, string]> = [
  ['Action', 'Acción'], ['Adventure', 'Aventura'], ['Comedy', 'Comedia'], ['Drama', 'Drama'],
  ['Fantasy', 'Fantasía'], ['Romance', 'Romance'], ['Horror', 'Terror'], ['Mystery', 'Misterio'],
  ['Sci-Fi', 'Ciencia ficción'], ['Slice of Life', 'Recuentos de la vida'], ['Sports', 'Deportes'],
  ['Supernatural', 'Sobrenatural'], ['Psychological', 'Psicológico'], ['Historical', 'Histórico'],
  ['Isekai', 'Isekai'], ['School Life', 'Escolar'], ['Martial Arts', 'Artes marciales'],
  ['Mecha', 'Mecha'], ['Tragedy', 'Tragedia'], ['Thriller', 'Suspense'], ['Crime', 'Crimen'],
  ['Magic', 'Magia'], ['Reincarnation', 'Reencarnación'], ['Survival', 'Supervivencia'],
  ['Post-Apocalyptic', 'Postapocalíptico'], ['Music', 'Música'], ['Cooking', 'Cocina'],
  ['Villainess', 'Villana'], ['Monsters', 'Monstruos'], ['Superhero', 'Superhéroes'],
];

/** Convierte la respuesta de /manga/tag en la lista curada (pura, con tests). */
export function buildGenres(rawTags: any[]): MangaGenre[] {
  const idByName = new Map<string, string>();
  for (const t of rawTags ?? []) {
    const en = t?.attributes?.name?.en;
    if (typeof en === 'string' && typeof t.id === 'string') idByName.set(en, t.id);
  }
  const out: MangaGenre[] = [];
  for (const [en, es] of CURATED_GENRES) {
    const id = idByName.get(en);
    if (id) out.push({ id, name: es });
  }
  return out;
}

let genresCache: Promise<MangaGenre[]> | null = null;

// ─── Capítulos ─────────────────────────────────────────────
/**
 * Un capítulo por número, prefiriendo el idioma más arriba en `languages`
 * (varios grupos suben el mismo capítulo). Descarta los de 0 páginas (enlaces
 * externos que no se pueden leer aquí). Pura, con tests.
 */
export function mergeChapters(raw: any[], languages: string[]): MangaChapterModel[] {
  const rank = (lang: string) => {
    const i = languages.indexOf(lang);
    return i === -1 ? languages.length : i;
  };

  const chosen = new Map<string, MangaChapterModel>();
  for (const c of raw) {
    const a = c?.attributes;
    if (!a || !c.id) continue;
    const ch: MangaChapterModel = {
      id: c.id,
      sourceId: 'mangadex',
      chapter: a.chapter ?? null,
      volume: a.volume ?? null,
      title: a.title ?? null,
      pages: a.pages ?? 0,
      publishAt: a.publishAt ?? '',
      translatedLanguage: a.translatedLanguage ?? '',
    };
    if (ch.pages === 0) continue;
    const key = ch.chapter ?? ch.id;
    const cur = chosen.get(key);
    if (!cur || rank(ch.translatedLanguage) < rank(cur.translatedLanguage)) chosen.set(key, ch);
  }
  return Array.from(chosen.values());
}

const SORT_PARAM: Record<MangaSort, [string, 'asc' | 'desc']> = {
  popular: ['followedCount', 'desc'],
  recent: ['latestUploadedChapter', 'desc'],
  rating: ['rating', 'desc'],
  az: ['title', 'asc'],
};

export const MangaDexProvider: MangaProvider = {
  id: 'mangadex',
  name: 'MangaDex',
  pageSize: PAGE_SIZE,
  languages: [
    { code: 'es', label: 'Español' },
    { code: 'en', label: 'Inglés' },
  ],

  async searchManga(query: string, page = 1): Promise<MangaModel[]> {
    const p = baseParams(page);
    if (query.trim()) p.set('title', query.trim());
    return list(p);
  },

  async getPopularManga(page = 1): Promise<MangaModel[]> {
    const p = baseParams(page);
    p.set('order[followedCount]', 'desc');
    return list(p);
  },

  async getRecentlyUpdatedManga(page = 1): Promise<MangaModel[]> {
    const p = baseParams(page);
    p.set('order[latestUploadedChapter]', 'desc');
    return list(p);
  },

  async getGenres(): Promise<MangaGenre[]> {
    genresCache ??= proxyGet<any>(`${MDEX_API}/manga/tag`, { headers: MDEX_HEADERS, retries: 1 })
      .then((res) => buildGenres(res.data?.data ?? []))
      .catch((err) => {
        genresCache = null; // reintentar la próxima vez
        throw err;
      });
    return genresCache;
  },

  async browse({ genre, sort, page }): Promise<MangaModel[]> {
    const p = baseParams(page);
    if (genre) p.append('includedTags[]', genre);
    const [field, dir] = SORT_PARAM[sort] ?? SORT_PARAM.popular;
    p.set(`order[${field}]`, dir);
    return list(p);
  },

  async getMangaChapters(mangaId: string, opts = {}): Promise<MangaChapterModel[]> {
    const languages = opts.languages?.length ? opts.languages : DEFAULT_LANGUAGES;
    // 'es' implica también 'es-la' (español latino)
    const wanted = languages.flatMap((l) => (l === 'es' ? ['es', 'es-la'] : [l]));

    const raw: any[] = [];
    for (let i = 0; i < FEED_MAX_REQUESTS; i++) {
      const p = new URLSearchParams();
      wanted.forEach((l) => p.append('translatedLanguage[]', l));
      p.append('includeExternalUrl', '0');
      p.set('order[chapter]', 'asc');
      p.set('limit', String(FEED_PAGE));
      p.set('offset', String(i * FEED_PAGE));

      const res = await proxyGet<any>(`${MDEX_API}/manga/${mangaId}/feed?${p.toString()}`, {
        headers: MDEX_HEADERS,
        retries: 1,
      });
      const batch: any[] = res.data?.data ?? [];
      raw.push(...batch);
      const total = Number(res.data?.total ?? 0);
      if (batch.length === 0 || raw.length >= total) break;
    }
    return mergeChapters(raw, wanted);
  },

  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const res = await proxyGet<any>(`${MDEX_API}/at-home/server/${chapterId}`, { headers: MDEX_HEADERS });
    const ch = res.data?.chapter;
    return {
      baseUrl: res.data?.baseUrl ?? 'https://uploads.mangadex.org',
      hash: ch?.hash ?? '',
      data: ch?.data ?? [],
      dataSaver: ch?.dataSaver ?? [],
    };
  },
};
