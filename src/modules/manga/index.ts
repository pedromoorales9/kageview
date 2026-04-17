import { MangaProvider } from './types';
import { MangaDexProvider } from './providers/mangadex';
import { InMangaProvider } from './providers/inmanga';
import { ManhwaWebProvider } from './providers/manhwaweb';

export * from './types';

export const MANGA_PROVIDERS: Record<string, MangaProvider> = {
  [MangaDexProvider.id]: MangaDexProvider,
  [InMangaProvider.id]: InMangaProvider,
  [ManhwaWebProvider.id]: ManhwaWebProvider,
};

export const DEFAULT_PROVIDER_ID = MangaDexProvider.id;

export function getMangaProvider(id: string): MangaProvider {
  return MANGA_PROVIDERS[id] || MANGA_PROVIDERS[DEFAULT_PROVIDER_ID];
}

export function getAllMangaProviders(): MangaProvider[] {
  return Object.values(MANGA_PROVIDERS);
}
