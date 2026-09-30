import { MangaChapterModel, MangaModel, MangaProvider } from './types';
import { MangaDexProvider, setMangaDexIncludeEnglish } from './providers/mangadex';
import { InMangaProvider } from './providers/inmanga';
import { ManhwaWebProvider } from './providers/manhwaweb';
import { MangaOniProvider } from './providers/mangaoni';
import { normalizeChapters } from './chapters';

export * from './types';
export { normalizeChapters, chapterLabel, parseChapterNumber } from './chapters';

export const MANGA_PROVIDERS: Record<string, MangaProvider> = {
  [MangaDexProvider.id]: MangaDexProvider,
  [InMangaProvider.id]: InMangaProvider,
  [ManhwaWebProvider.id]: ManhwaWebProvider,
  [MangaOniProvider.id]: MangaOniProvider,
};

export const DEFAULT_PROVIDER_ID = MangaDexProvider.id;

export function getMangaProvider(id: string): MangaProvider {
  return MANGA_PROVIDERS[id] || MANGA_PROVIDERS[DEFAULT_PROVIDER_ID];
}

export function getAllMangaProviders(): MangaProvider[] {
  return Object.values(MANGA_PROVIDERS);
}

/** Aplica preferencias que afectan a las fuentes (hoy: capítulos en inglés en MangaDex). */
export function configureMangaProviders(opts: { includeEnglish?: boolean }): void {
  setMangaDexIncludeEnglish(!!opts.includeEnglish);
}

/** Idiomas de capítulos a pedir según la preferencia. */
export const chapterLanguages = (includeEnglish: boolean): string[] => (includeEnglish ? ['es', 'en'] : ['es']);

/**
 * Capítulos de un manga SIEMPRE en orden ascendente (1 → último), sea cual sea
 * la fuente: así «siguiente capítulo» es `índice + 1`.
 */
export async function loadMangaChapters(
  manga: Pick<MangaModel, 'id' | 'sourceId'>,
  opts: { includeEnglish?: boolean } = {}
): Promise<MangaChapterModel[]> {
  const provider = getMangaProvider(manga.sourceId);
  const raw = await provider.getMangaChapters(manga.id, { languages: chapterLanguages(!!opts.includeEnglish) });
  return normalizeChapters(raw);
}

// ─── Búsqueda en todas las fuentes ─────────────────────────
export interface ProviderSearchResult {
  provider: MangaProvider;
  items: MangaModel[];
  error?: string;
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Tardó demasiado en responder')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });

/**
 * Busca en varias fuentes A LA VEZ. Una fuente caída o lenta no bloquea a las
 * demás: su resultado trae `error` y el resto siguen mostrándose. Devuelve en el
 * mismo orden que `providers`.
 */
export async function searchAllProviders(
  query: string,
  providers: MangaProvider[],
  timeoutMs = 15000
): Promise<ProviderSearchResult[]> {
  const q = query.trim();
  const settled = await Promise.allSettled(providers.map((p) => withTimeout(p.searchManga(q), timeoutMs)));
  return settled.map((res, i) =>
    res.status === 'fulfilled'
      ? { provider: providers[i], items: res.value }
      : { provider: providers[i], items: [], error: res.reason instanceof Error ? res.reason.message : 'Error' }
  );
}
