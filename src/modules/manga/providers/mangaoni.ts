import { proxyGet } from '../../httpProxy';
import { MangaModel, MangaChapterModel, MangaPagesModel, MangaProvider } from '../types';

// ═══════════════════════════════════════════════════════════
// MangaOni (manga-oni.com) — Scraper en español
// Soporta manga, manhwa y manhua. Lector basado en `var unicap`
// (base64) que contiene [dir, [páginas], siguiente_capítulo].
// ═══════════════════════════════════════════════════════════

const BASE_URL = 'https://manga-oni.com';

function headers(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: `${BASE_URL}/`,
  };
}

/** Convierte una URL absoluta de manga-oni en el id interno `{tipo}/{slug}`. */
function urlToMangaId(url: string): string {
  try {
    const path = new URL(url, BASE_URL).pathname; // /manga/slug/
    return path.replace(/^\/+|\/+$/g, ''); // manga/slug
  } catch {
    return url.replace(`${BASE_URL}/`, '').replace(/^\/+|\/+$/g, '');
  }
}

/** Limpia una URL de portada, descartando el gif de carga por defecto. */
function cleanCover(dataSrc: string | null, src: string | null): string {
  for (const candidate of [dataSrc, src]) {
    if (candidate && !candidate.includes('default.gif') && !candidate.includes('default.png')) {
      return candidate;
    }
  }
  return '';
}

/** Parsea las tarjetas de listado del directorio / búsqueda. */
function parseListingCards(html: string): MangaModel[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const anchors = doc.querySelectorAll('#article-div a[itemprop="url"]');

  const results: MangaModel[] = [];
  const seen = new Set<string>();

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href) return;

    const id = urlToMangaId(href);
    if (!id || seen.has(id)) return;

    const img = anchor.querySelector('img');
    const title =
      img?.getAttribute('alt')?.trim() ||
      anchor.textContent?.trim() ||
      'Sin título';
    const coverUrl = cleanCover(img?.getAttribute('data-src') ?? null, img?.getAttribute('src') ?? null);

    // <b id="in" class="c0|c1">tipo</b> → c1 = contenido +18
    const typeBadge = anchor.querySelector('b[id="in"]');
    const isAdult = typeBadge?.classList.contains('c1') ?? false;

    // El año aparece como "2024 - Autor" en el bloque inferior
    let year: number | null = null;
    const yearMatch = anchor.textContent?.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) year = parseInt(yearMatch[0], 10);

    seen.add(id);
    results.push({
      id,
      sourceId: 'mangaoni',
      title,
      description: '',
      coverUrl,
      status: 'ongoing',
      tags: [],
      year,
      lastChapter: null,
      isAdult,
    });
  });

  return results;
}

function mapStatus(raw: string): MangaModel['status'] {
  const t = raw.toLowerCase();
  if (t.includes('completo') || t.includes('finaliz')) return 'completed';
  if (t.includes('pausa') || t.includes('hiatus')) return 'hiatus';
  if (t.includes('cancel')) return 'cancelled';
  return 'ongoing';
}

export const MangaOniProvider: MangaProvider = {
  id: 'mangaoni',
  name: 'MangaOni',

  /** Búsqueda por título (HTML, sin token) */
  async searchManga(query: string): Promise<MangaModel[]> {
    const q = query.trim();
    if (!q) return [];
    const res = await proxyGet<string>(`${BASE_URL}/buscar/`, {
      params: { q },
      headers: headers(),
    });
    return parseListingCards(typeof res.data === 'string' ? res.data : '');
  },

  /** Populares — ordenados por visitas */
  async getPopularManga(): Promise<MangaModel[]> {
    const res = await proxyGet<string>(`${BASE_URL}/directorio`, {
      params: { filtro: 'visitas', orden: 'desc', adulto: 'false' },
      headers: headers(),
    });
    return parseListingCards(typeof res.data === 'string' ? res.data : '');
  },

  /** Recientes — ordenados por id (lo último añadido) */
  async getRecentlyUpdatedManga(): Promise<MangaModel[]> {
    const res = await proxyGet<string>(`${BASE_URL}/directorio`, {
      params: { filtro: 'id', orden: 'desc', adulto: 'false' },
      headers: headers(),
    });
    return parseListingCards(typeof res.data === 'string' ? res.data : '');
  },

  /** Capítulos desde la página de detalle `/{tipo}/{slug}/` */
  async getMangaChapters(mangaId: string): Promise<MangaChapterModel[]> {
    const res = await proxyGet<string>(`${BASE_URL}/${mangaId}/`, { headers: headers() });
    const html = typeof res.data === 'string' ? res.data : '';
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const links = doc.querySelectorAll('#c_list a[href*="/lector/"]');
    const chapters: MangaChapterModel[] = [];

    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;

      // /lector/{slug}/{chapterId}/ → id interno "{slug}/{chapterId}"
      const path = (() => {
        try {
          return new URL(href, BASE_URL).pathname;
        } catch {
          return href;
        }
      })();
      const id = path.replace(/^\/+lector\/+/, '').replace(/\/+$/, '');
      if (!id) return;

      const timeEl = link.querySelector('.timeago');
      const num = timeEl?.getAttribute('data-num')?.trim() || null;
      const datetime = timeEl?.getAttribute('datetime')?.trim() || '';
      const titleText = link.querySelector('.entry-title-h2')?.textContent?.trim() || null;

      // Si no hay data-num, intenta extraerlo del título ("Capítulo 12")
      const chapter = num || titleText?.match(/[\d.]+/)?.[0] || null;

      chapters.push({
        id,
        sourceId: 'mangaoni',
        chapter,
        volume: null,
        title: titleText,
        pages: 0, // se conoce al abrir el capítulo
        publishAt: datetime ? new Date(datetime.replace(' ', 'T')).toISOString() : '',
        translatedLanguage: 'es',
      });
    });

    // Orden ascendente (capítulo 1 → último) para que "siguiente" avance
    return chapters.sort(
      (a, b) => parseFloat(a.chapter || '0') - parseFloat(b.chapter || '0')
    );
  },

  /** Páginas del capítulo desde `var unicap` (base64) del lector */
  async getChapterPages(chapterId: string): Promise<MangaPagesModel> {
    const res = await proxyGet<string>(`${BASE_URL}/lector/${chapterId}/`, { headers: headers() });
    const html = typeof res.data === 'string' ? res.data : '';

    const match = html.match(/var\s+unicap\s*=\s*'([^']+)'/);
    if (!match) {
      return { baseUrl: '', hash: '', data: [], dataSaver: [] };
    }

    let decoded: string;
    try {
      decoded = atob(match[1]);
    } catch {
      return { baseUrl: '', hash: '', data: [], dataSaver: [] };
    }

    // decoded = "dir||["1.webp","2.webp",...]||siguiente_capitulo"
    const parts = decoded.split('||');
    const dir = parts[0] || '';
    const rawPages = parts[1] || '[]';

    if (!dir || rawPages === '[]') {
      return { baseUrl: '', hash: '', data: [], dataSaver: [] };
    }

    const pages = rawPages
      .replace(/&quot;/g, '"')
      .replace(/^\["?/, '')
      .replace(/"?\]$/, '')
      .split('","')
      .map((p) => p.trim())
      .filter(Boolean);

    const data = pages.map((p) => `${dir}${p}`);

    return { baseUrl: '', hash: '', data, dataSaver: [] };
  },
};
