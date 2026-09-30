import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MangaChapterModel, MangaModel } from '../types';

const chapters: Record<string, MangaChapterModel[]> = {};
const failing = new Set<string>();

vi.mock('../index', () => ({
  loadMangaChapters: vi.fn(async (m: { id: string }) => {
    if (failing.has(m.id)) throw new Error('fuente caída');
    return chapters[m.id] ?? [];
  }),
}));

const ch = (n: number): MangaChapterModel => ({
  id: `c${n}`, sourceId: 'mangadex', chapter: String(n), volume: null, title: null, pages: 10, publishAt: '', translatedLanguage: 'es',
});
const list = (upTo: number) => Array.from({ length: upTo }, (_, i) => ch(i + 1));
const manga = (id: string): MangaModel => ({
  id, sourceId: 'mangadex', title: `M${id}`, description: '', coverUrl: '', status: 'ongoing', tags: [], year: null, lastChapter: null,
});

async function boot() {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllTimers();
  const disk: Record<string, unknown> = {};
  (globalThis as any).window = {
    electron: {
      getStore: async (k: string) => disk[k],
      setStore: async (k: string, v: unknown) => { disk[k] = v; },
    },
  };
  const store = await import('../mangaStore');
  await store.initMangaStore();
  const up = await import('../mangaUpdates');
  return { store, up };
}

beforeEach(() => {
  for (const k of Object.keys(chapters)) delete chapters[k];
  failing.clear();
});

describe('computeUnread', () => {
  let up: Awaited<ReturnType<typeof boot>>['up'];
  beforeEach(async () => { ({ up } = await boot()); });

  it('cuenta lo posterior a donde vas', () => {
    expect(up.computeUnread(list(10), ['c1', 'c2', 'c3'], 'c3')).toBe(7);
    expect(up.computeUnread(list(10), [], 'c8')).toBe(2);              // solo se sabe el último abierto
    expect(up.computeUnread(list(10), ['c10'], 'c10')).toBe(0);
  });

  it('no cuenta como sin leer lo que saltaste pero marcaste como leído', () => {
    expect(up.computeUnread(list(6), ['c1', 'c2', 'c4', 'c5'], 'c5')).toBe(1); // solo c6
    expect(up.computeUnread(list(6), ['c1', 'c2', 'c6'], 'c6')).toBe(0);
  });

  it('sin empezar, o con lo leído en otra lista/idioma, es desconocido (null)', () => {
    expect(up.computeUnread(list(5), [], undefined)).toBeNull();
    expect(up.computeUnread(list(5), ['otro-idioma'], 'otro-idioma')).toBeNull();
  });
});

describe('countNewSince', () => {
  it('capítulos por encima del último conocido', async () => {
    const { up } = await boot();
    expect(up.countNewSince(list(10), 8)).toBe(2);
    expect(up.countNewSince(list(10), 10)).toBe(0);
    expect(up.countNewSince(list(10), null)).toBe(0);      // primera comprobación: no es una "novedad"
    expect(up.countNewSince(list(10), undefined)).toBe(0);
    expect(up.countNewSince([{ chapter: null }, { chapter: 'Extra' }], 3)).toBe(0);
  });
});

describe('checkMangaUpdates', () => {
  it('la primera comprobación fija el punto de partida sin avisar; la siguiente avisa de lo nuevo', async () => {
    const { store, up } = await boot();
    const m = manga('1');
    store.addToLibrary(m, 'reading');
    store.recordOpen(m, { id: 'c3', chapter: '3' }, 2, 10);
    chapters['1'] = list(5);

    expect(await up.checkMangaUpdates({ force: true })).toEqual([]);
    expect(store.getRecord(m)).toMatchObject({ latestKnown: 5, unread: 2 });

    chapters['1'] = list(8);                                        // salen 3 nuevos
    const found = await up.checkMangaUpdates({ force: true });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ added: 3, unread: 5 });
    expect(store.getRecord(m)).toMatchObject({ latestKnown: 8, unread: 5 });

    expect(await up.checkMangaUpdates({ force: true })).toEqual([]); // sin cambios: no avisa otra vez
  });

  it('solo mira lo que estás leyendo', async () => {
    const { store, up } = await boot();
    const [a, b, c] = [manga('a'), manga('b'), manga('c')];
    store.addToLibrary(a, 'reading');
    store.addToLibrary(b, 'planning');
    store.addToLibrary(c, 'completed');
    chapters.a = chapters.b = chapters.c = list(3);
    await up.checkMangaUpdates({ force: true });
    expect(store.getRecord(a)?.checkedAt).toBeDefined();
    expect(store.getRecord(b)?.checkedAt).toBeUndefined();
    expect(store.getRecord(c)?.checkedAt).toBeUndefined();
  });

  it('respeta el intervalo entre comprobaciones salvo que se fuerce', async () => {
    const { store, up } = await boot();
    const m = manga('1');
    store.addToLibrary(m, 'reading');
    chapters['1'] = list(3);
    const t0 = 1_000_000;
    await up.checkMangaUpdates({ now: t0 });
    expect(store.getRecord(m)?.checkedAt).toBe(t0);
    chapters['1'] = list(6);
    await up.checkMangaUpdates({ now: t0 + 60_000 });                      // hace 1 min: no vuelve a mirar
    expect(store.getRecord(m)?.latestKnown).toBe(3);
    await up.checkMangaUpdates({ now: t0 + up.CHECK_MAX_AGE_MS + 1 });      // pasado el intervalo: sí
    expect(store.getRecord(m)?.latestKnown).toBe(6);
    chapters['1'] = list(7);
    await up.checkMangaUpdates({ now: t0 + up.CHECK_MAX_AGE_MS + 2, force: true });
    expect(store.getRecord(m)?.latestKnown).toBe(7);
  });

  it('una fuente caída no rompe el resto ni borra los datos anteriores', async () => {
    const { store, up } = await boot();
    const [a, b] = [manga('a'), manga('b')];
    store.addToLibrary(a, 'reading');
    store.addToLibrary(b, 'reading');
    chapters.a = list(4);
    chapters.b = list(4);
    await up.checkMangaUpdates({ force: true });
    failing.add('a');
    chapters.b = list(6);
    const found = await up.checkMangaUpdates({ force: true });
    expect(found.map((f) => f.manga.id)).toEqual(['b']);
    expect(store.getRecord(a)?.latestKnown).toBe(4);   // se conserva
    expect(store.getRecord(b)?.latestKnown).toBe(6);
  });

  it('una lista de capítulos vacía no pisa lo que ya se sabía', async () => {
    const { store, up } = await boot();
    const m = manga('1');
    store.addToLibrary(m, 'reading');
    chapters['1'] = list(5);
    await up.checkMangaUpdates({ force: true });
    chapters['1'] = [];
    await up.checkMangaUpdates({ force: true });
    expect(store.getRecord(m)?.latestKnown).toBe(5);
  });

  it('usa el progreso más reciente si leíste mientras se consultaba', async () => {
    const { store, up } = await boot();
    const m = manga('1');
    store.addToLibrary(m, 'reading');
    store.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 5);
    chapters['1'] = list(5);
    await up.checkMangaUpdates({ force: true });
    store.setChapterRead(m, 'c5', true);
    store.recordOpen(m, { id: 'c5', chapter: '5' }, 4, 5);
    chapters['1'] = list(5);
    await up.checkMangaUpdates({ force: true });
    expect(store.getRecord(m)?.unread).toBe(0);
  });
});

describe('startMangaUpdateChecks', () => {
  it('comprueba a los 30 s, avisa de lo nuevo y se puede detener', async () => {
    const { store, up } = await boot();
    const m = manga('1');
    store.addToLibrary(m, 'reading');
    store.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 5);
    chapters['1'] = list(3);
    // punto de partida hecho hace 4 h (si fuera reciente, la comprobación periódica lo omitiría)
    await up.checkMangaUpdates({ force: true, now: Date.now() - 4 * 60 * 60 * 1000 });

    chapters['1'] = list(5);
    const seen: number[] = [];
    const stop = up.startMangaUpdateChecks((l) => seen.push(l[0].added));
    await vi.advanceTimersByTimeAsync(29_000);
    expect(seen).toEqual([]);                             // aún no
    await vi.advanceTimersByTimeAsync(2_000);
    expect(seen).toEqual([2]);
    stop();
    chapters['1'] = list(9);
    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
    expect(seen).toEqual([2]);                            // detenido: nada más
  });
});
