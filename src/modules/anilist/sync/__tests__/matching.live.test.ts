// En vivo (LIVE=1): ¿cuántos mangas REALES de nuestras fuentes se vincularían solos con AniList, y con qué acierto?
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../httpProxy', async () => {
  const h = await import('../../../manga/__tests__/liveHarness');
  return { proxyGet: h.liveProxyGet, proxyPost: h.liveProxyPost, proxyHead: vi.fn() };
});

import { installDom } from '../../../manga/__tests__/liveHarness';
installDom();

import { OlympusProvider } from '../../../manga/providers/olympus';
import { WebtoonsProvider } from '../../../manga/providers/webtoons';
import { WeebCentralProvider } from '../../../manga/providers/weebcentral';
import { MangaKatanaProvider } from '../../../manga/providers/mangakatana';
import { LeerCapituloProvider } from '../../../manga/providers/leercapitulo';
import { MantrazScanProvider } from '../../../manga/providers/mantrazscan';
import { SEARCH_MANGA_QUERY, parseMedia } from '../queries';
import { decideLink, searchTerms } from '../matching';
import type { ALMedia } from '../types';

const live = process.env.LIVE ? describe : describe.skip;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(q: string): Promise<ALMedia[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: SEARCH_MANGA_QUERY, variables: { q, perPage: 8 } }),
    });
    if (res.status === 429) { await sleep(Number(res.headers.get('retry-after') ?? 20) * 1000); continue; }
    const j: any = await res.json();
    return (j.data?.Page?.media ?? []).map((m: unknown) => parseMedia(m, 'MANGA')).filter(Boolean);
  }
  return [];
}

live('Vinculación con AniList (títulos reales)', () => {
  it('mide cuántos se vinculan solos y muestra los emparejamientos para revisarlos', async () => {
    const sources = [
      [OlympusProvider, 'es'], [WebtoonsProvider, 'es'], [LeerCapituloProvider, 'es'], [MantrazScanProvider, 'es'],
      [WeebCentralProvider, 'en'], [MangaKatanaProvider, 'en'],
    ] as const;
    const titles: Array<{ src: string; title: string }> = [];
    for (const [p, lang] of sources) {
      try {
        const list = await p.getPopularManga(1);
        list.filter((m) => !m.isAdult).slice(0, 8).forEach((m) => titles.push({ src: `${p.id}/${lang}`, title: m.title }));
      } catch { /* una fuente caída no invalida la medición */ }
    }
    expect(titles.length).toBeGreaterThan(20);

    const rows: string[] = [];
    let auto = 0, ambiguous = 0, none = 0;
    for (const { src, title } of titles) {
      // Igual que el motor: se busca por el primer término y, si no hay candidatas, por el siguiente
      let cands: ALMedia[] = [];
      for (const term of searchTerms(title).slice(0, 2)) {
        cands = await search(term);
        await sleep(750);
        if (cands.length > 0) break;
      }
      const d = decideLink(title, cands);
      if (d.kind === 'auto') { auto++; rows.push(`AUTO  [${src}] «${title}» → «${d.media.title.english ?? d.media.title.romaji}» (${d.score.toFixed(2)})`); }
      else if (d.kind === 'ambiguous') { ambiguous++; rows.push(`DUDA  [${src}] «${title}» → ${d.ranked.slice(0, 2).map((r) => `«${r.media.title.english ?? r.media.title.romaji}» ${r.score.toFixed(2)}`).join(' | ')}`); }
      else { none++; rows.push(`NADA  [${src}] «${title}»`); }
          }
    console.log(`\n${rows.join('\n')}\n\nTOTAL ${titles.length}: auto=${auto} duda=${ambiguous} nada=${none}`);
    expect(auto + ambiguous + none).toBe(titles.length);
  }, 300000);
});
