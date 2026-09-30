import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MangaModel } from '../types';

/** Simula el almacén persistente de Electron (getStore/setStore). */
function installElectronStore(initial: Record<string, unknown> = {}) {
  const disk: Record<string, unknown> = JSON.parse(JSON.stringify(initial));
  const writes: string[] = [];
  (globalThis as any).window = {
    electron: {
      getStore: async (k: string) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : undefined),
      setStore: async (k: string, v: unknown) => {
        writes.push(k);
        if (v === undefined) delete disk[k];
        else disk[k] = JSON.parse(JSON.stringify(v));
      },
    },
  };
  return { disk, writes };
}

const manga = (id: string, over: Partial<MangaModel> = {}): MangaModel => ({
  id, sourceId: 'mangadex', title: `Manga ${id}`, description: '', coverUrl: '',
  status: 'ongoing', tags: [], year: null, lastChapter: null, ...over,
});

async function boot(initial: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllTimers(); // guardados pendientes de pruebas anteriores (otro módulo, otro disco)
  const env = installElectronStore(initial);
  const s = await import('../mangaStore');
  await s.initMangaStore();
  return { s, ...env };
}

describe('migración de datos antiguos', () => {
  it('une biblioteca y último capítulo en un registro por manga', async () => {
    const { s, disk } = await boot({
      mangaLibrary: [
        { manga: manga('1'), status: 'reading', addedAt: 10, updatedAt: 20 },
        { manga: manga('2', { sourceId: 'inmanga' }), status: 'planning', addedAt: 11, updatedAt: 21 },
      ],
      mangaProgress: {
        'mangadex::1': { mangaId: '1', sourceId: 'mangadex', lastChapterId: 'c5', lastChapterNumber: '5', lastChapterIndex: 4, updatedAt: 99 },
        'huerfano::x': { mangaId: 'x', sourceId: 'huerfano', lastChapterId: 'c1', lastChapterNumber: '1', lastChapterIndex: 0, updatedAt: 1 },
      },
    });
    const r = s.getRecord({ id: '1', sourceId: 'mangadex' })!;
    expect(r.status).toBe('reading');
    expect(r.addedAt).toBe(10);
    expect(r.read).toEqual(['c5']);
    expect(r.last).toMatchObject({ chapterId: 'c5', chapterNumber: '5', chapterIndex: 4, page: 0, at: 99 });
    expect(s.getRecord({ id: '2', sourceId: 'inmanga' })!.status).toBe('planning');
    expect(s.getRecord({ id: 'x', sourceId: 'huerfano' })).toBeUndefined(); // sin ficha no hay qué mostrar
    // deja guardado el formato nuevo y conserva las claves antiguas
    expect((disk.mangaData as any).v).toBe(2);
    expect(disk.mangaLibrary).toBeDefined();
  });

  it('con datos nuevos ya guardados no vuelve a migrar', async () => {
    const rec = { manga: manga('9'), status: 'reading', updatedAt: 5, read: ['a'] };
    const { s } = await boot({
      mangaData: { v: 2, records: { 'mangadex::9': rec } },
      mangaLibrary: [{ manga: manga('1'), status: 'reading', addedAt: 1, updatedAt: 1 }],
    });
    expect(s.getRecord({ id: '9', sourceId: 'mangadex' })?.read).toEqual(['a']);
    expect(s.getRecord({ id: '1', sourceId: 'mangadex' })).toBeUndefined();
  });

  it('no falla sin datos previos', async () => {
    const { s } = await boot();
    expect(s.libraryRecords()).toEqual([]);
    expect(s.historyRecords()).toEqual([]);
  });
});

describe('biblioteca', () => {
  let s: Awaited<ReturnType<typeof boot>>['s'];
  beforeEach(async () => { ({ s } = await boot()); });

  it('añadir, cambiar de estado y quitar', () => {
    const m = manga('1');
    s.addToLibrary(m, 'reading');
    expect(s.libraryRecords().map((r) => r.manga.id)).toEqual(['1']);
    s.setLibraryStatus(m, 'completed');
    expect(s.getRecord(m)?.status).toBe('completed');
    s.removeFromLibrary(m);
    expect(s.getRecord(m)).toBeUndefined(); // sin lectura, desaparece del todo
  });

  it('quitar de la biblioteca conserva el historial si ya habías leído', () => {
    const m = manga('1');
    s.addToLibrary(m);
    s.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 20);
    s.removeFromLibrary(m);
    const r = s.getRecord(m)!;
    expect(r.status).toBeUndefined();
    expect(r.last?.chapterId).toBe('c1');
    expect(s.libraryRecords()).toHaveLength(0);
    expect(s.historyRecords()).toHaveLength(1);
  });

  it('añadir dos veces no duplica ni pierde lo leído', () => {
    const m = manga('1');
    s.addToLibrary(m);
    s.setChapterRead(m, 'c1', true);
    s.addToLibrary(m, 'planning');
    expect(s.libraryRecords()).toHaveLength(1);
    expect(s.getRecord(m)?.read).toEqual(['c1']);
  });
});

describe('lectura: capítulo y página', () => {
  let s: Awaited<ReturnType<typeof boot>>['s'];
  beforeEach(async () => { ({ s } = await boot()); });

  it('recuerda la página y la conserva al reabrir el mismo capítulo', () => {
    const m = manga('1');
    s.recordOpen(m, { id: 'c7', chapter: '7' }, 6, 30);
    s.recordPage(m, 'c7', 12, 30);
    expect(s.getRecord(m)?.last).toMatchObject({ chapterId: 'c7', page: 12, pageCount: 30 });
    s.recordOpen(m, { id: 'c7', chapter: '7' }, 6, 30);      // reabrir el mismo
    expect(s.getRecord(m)?.last?.page).toBe(12);
    s.recordOpen(m, { id: 'c8', chapter: '8' }, 7, 25);      // otro capítulo: vuelve al principio
    expect(s.getRecord(m)?.last).toMatchObject({ chapterId: 'c8', page: 0, pageCount: 25 });
  });

  it('ignora páginas de un capítulo que ya no es el actual', () => {
    const m = manga('1');
    s.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 10);
    s.recordPage(m, 'otro', 5, 10);
    s.recordPage({ id: 'no-existe', sourceId: 'mangadex' }, 'c1', 5, 10);
    expect(s.getRecord(m)?.last?.page).toBe(0);
  });

  it('el historial ordena por lo último abierto', () => {
    const [a, b, c] = [manga('a'), manga('b'), manga('c')];
    s.recordOpen(a, { id: 'a1', chapter: '1' }, 0);
    vi.advanceTimersByTime(10);
    s.recordOpen(b, { id: 'b1', chapter: '1' }, 0);
    vi.advanceTimersByTime(10);
    s.recordOpen(c, { id: 'c1', chapter: '1' }, 0);
    vi.advanceTimersByTime(10);
    s.recordOpen(a, { id: 'a2', chapter: '2' }, 1);
    expect(s.historyRecords().map((r) => r.manga.id)).toEqual(['a', 'c', 'b']);
    expect(s.historyRecords(undefined, 2)).toHaveLength(2);
  });
});

describe('capítulos leídos y contador de nuevos', () => {
  let s: Awaited<ReturnType<typeof boot>>['s'];
  beforeEach(async () => { ({ s } = await boot()); });
  const chapters = ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id }));

  it('marcar y desmarcar', () => {
    const m = manga('1');
    s.setChapterRead(m, 'c1', true);
    s.setChapterRead(m, 'c1', true);
    expect(s.getRecord(m)?.read).toEqual(['c1']);
    expect(s.readSet(m).has('c1')).toBe(true);
    s.setChapterRead(m, 'c1', false);
    expect(s.getRecord(m)?.read).toEqual([]);
  });

  it('el contador de sin leer baja y sube con cada marca, sin pasar de 0', () => {
    const m = manga('1');
    s.addToLibrary(m);
    s.applyUpdateCheck(m, { latest: 4, unread: 3 });
    s.setChapterRead(m, 'c1', true);
    expect(s.getRecord(m)?.unread).toBe(2);
    s.setChapterRead(m, 'c1', true);                 // repetir no cuenta dos veces
    expect(s.getRecord(m)?.unread).toBe(2);
    s.setChapterRead(m, 'c1', false);
    expect(s.getRecord(m)?.unread).toBe(3);
    s.setChapterRead(m, 'c1', false);                // desmarcar lo no leído tampoco
    expect(s.getRecord(m)?.unread).toBe(3);
    s.applyUpdateCheck(m, { latest: 4, unread: 0 });
    s.setChapterRead(m, 'c9', true);
    expect(s.getRecord(m)?.unread).toBe(0);
  });

  it('marcar como leído hasta aquí', () => {
    const m = manga('1');
    s.addToLibrary(m);
    s.applyUpdateCheck(m, { latest: 4, unread: 4 });
    s.markReadUpTo(m, chapters, 2);
    expect(s.getRecord(m)?.read).toEqual(['c1', 'c2', 'c3']);
    expect(s.getRecord(m)?.unread).toBe(1);
    s.markReadUpTo(m, chapters, 1);                  // no desmarca lo posterior
    expect(s.getRecord(m)?.read).toHaveLength(3);
  });

  it('olvidar lo leído: en biblioteca conserva la ficha; fuera de ella borra todo', () => {
    const inLib = manga('1');
    const loose = manga('2');
    s.addToLibrary(inLib);
    s.setChapterRead(inLib, 'c1', true);
    s.recordOpen(inLib, { id: 'c1', chapter: '1' }, 0);
    s.setChapterRead(loose, 'c1', true);
    s.clearReading(inLib);
    s.clearReading(loose);
    expect(s.getRecord(inLib)).toMatchObject({ status: 'reading', read: [] });
    expect(s.getRecord(inLib)?.last).toBeUndefined();
    expect(s.getRecord(loose)).toBeUndefined();
  });

  it('acota lo guardado en series larguísimas', () => {
    const m = manga('1');
    const ids = Array.from({ length: 6500 }, (_, i) => ({ id: `c${i}` }));
    s.markReadUpTo(m, ids, 6499);
    expect(s.getRecord(m)!.read.length).toBeLessThanOrEqual(6000);
    expect(s.getRecord(m)!.read).toContain('c6499'); // se quedan los más recientes
  });
});

describe('guardado diferido', () => {
  it('agrupa cambios seguidos en una sola escritura y guarda al salir', async () => {
    const { s, writes, disk } = await boot();
    writes.length = 0;
    const m = manga('1');
    s.addToLibrary(m);
    for (let p = 0; p < 40; p++) s.recordPage(m, 'c1', p, 40); // sin capítulo abierto: no hace nada
    s.recordOpen(m, { id: 'c1', chapter: '1' }, 0, 40);
    for (let p = 1; p <= 40; p++) s.recordPage(m, 'c1', p, 40);
    expect(writes.filter((k) => k === 'mangaData')).toHaveLength(0);   // aún nada en disco
    vi.advanceTimersByTime(800);
    await vi.runAllTimersAsync();
    expect(writes.filter((k) => k === 'mangaData')).toHaveLength(1);
    expect((disk.mangaData as any).records['mangadex::1'].last.page).toBe(40);

    s.recordPage(m, 'c1', 3, 40);
    await s.flushMangaData();                                          // al salir del lector: inmediato
    expect((disk.mangaData as any).records['mangadex::1'].last.page).toBe(3);
  });

  it('nunca guarda antes de cargar (no pisa datos existentes)', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { writes } = installElectronStore({ mangaData: { v: 2, records: { 'mangadex::1': { manga: manga('1'), status: 'reading', updatedAt: 1, read: [] } } } });
    const s = await import('../mangaStore');
    s.addToLibrary(manga('2'));           // antes de initMangaStore()
    await vi.runAllTimersAsync();
    expect(writes).toEqual([]);
  });
});
