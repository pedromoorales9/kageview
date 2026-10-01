import { MangaChapterModel, MangaModel, MangaProvider } from './types';
import { MangaDexProvider, setMangaDexIncludeEnglish } from './providers/mangadex';
import { InMangaProvider } from './providers/inmanga';
import { ManhwaWebProvider } from './providers/manhwaweb';
import { MangaOniProvider } from './providers/mangaoni';
import { LeerCapituloProvider } from './providers/leercapitulo';
import { OlympusProvider } from './providers/olympus';
import { BarMangaProvider } from './providers/barmanga';
import { MantrazScanProvider } from './providers/mantrazscan';
import { WebtoonsProvider } from './providers/webtoons';
import { WeebCentralProvider } from './providers/weebcentral';
import { MangaKatanaProvider } from './providers/mangakatana';
import { normalizeChapters } from './chapters';

export * from './types';
export { normalizeChapters, chapterLabel, parseChapterNumber } from './chapters';

export const MANGA_PROVIDERS: Record<string, MangaProvider> = {
  [MangaDexProvider.id]: MangaDexProvider,
  [InMangaProvider.id]: InMangaProvider,
  [ManhwaWebProvider.id]: ManhwaWebProvider,
  [MangaOniProvider.id]: MangaOniProvider,
  [LeerCapituloProvider.id]: LeerCapituloProvider,
  [OlympusProvider.id]: OlympusProvider,
  [BarMangaProvider.id]: BarMangaProvider,
  [MantrazScanProvider.id]: MantrazScanProvider,
  [WebtoonsProvider.id]: WebtoonsProvider,
  [WeebCentralProvider.id]: WeebCentralProvider,
  [MangaKatanaProvider.id]: MangaKatanaProvider,
};

/**
 * Idioma de los capítulos de cada fuente: 'es' español, 'en' solo inglés, 'multi' varios.
 * La interfaz marca con «EN» las que están solo en inglés. Una fuente nueva sin entrada
 * se considera española.
 */
export type SourceLanguage = 'es' | 'en' | 'multi';
export const PROVIDER_LANGUAGE: Record<string, SourceLanguage> = {
  mangadex: 'multi',
  weebcentral: 'en',
  mangakatana: 'en',
};
export const providerLanguage = (id: string): SourceLanguage => PROVIDER_LANGUAGE[id] ?? 'es';

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
