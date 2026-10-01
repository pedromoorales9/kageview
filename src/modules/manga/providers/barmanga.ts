import { createMadaraProvider } from './madaraBase';

// ═══════════════════════════════════════════════════════════
// BarManga (archiviumbar.com) — WordPress + Madara, en español.
// Manhua y manhwa sobre todo (~500 títulos, actualizaciones diarias).
// Los listados se cargan por admin-ajax (la página /manga/ viene vacía) y las
// imágenes se sirven desde el propio dominio sin exigir Referer.
// ═══════════════════════════════════════════════════════════

export const BarMangaProvider = createMadaraProvider({
  id: 'barmanga',
  name: 'BarManga',
  baseUrl: 'https://archiviumbar.com',
  pageSize: 16,
});
