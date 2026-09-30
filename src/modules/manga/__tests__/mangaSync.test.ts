import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MangaRecord } from '../mangaStore';
import type { MangaModel } from '../types';
import type { MangaSyncItem, MangaSyncRow } from '../../backend';

const T0 = Date.parse('2026-09-20T10:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

const manga = (id = 'm1', over: Partial<MangaModel> = {}): MangaModel => ({
  id, sourceId: 'mangadex', title: `Manga ${id}`, description: 'desc', coverUrl: 'https://cdn.example/c.jpg',
  status: 'ongoing', tags: ['Fantasy'], year: 2020, lastChapter: '100', ...over,
});

const row = (over: Partial<MangaSyncRow> = {}): MangaSyncRow => ({
  source: 'mangadex', mangaId: 'm1', status: 'reading',
  manga: { id: 'm1', sourceId: 'mangadex', title: 'Manga m1', coverUrl: 'https://cdn.example/c.jpg', status: 'ongoing', tags: [] },
  lastChapterId: 'c5', lastChapterNumber: '5', lastPage: 3, lastPageCount: 20, lastReadAt: at(0),
  readRanges: [[1, 5]], readResetAt: null, deleted: false, updatedAt: at(0), syncedAt: at(0), ...over,
});

const rec = (over: Partial<MangaRecord> = {}): MangaRecord => ({
  manga: manga(), status: 'reading', updatedAt: T0, read: ['c1'], readRanges: [[1, 3]], ...over,
});

async function load() {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllTimers();
  const disk: Record<string, unknown> = {};
  (globalThis as any).window = {
    electron: {
      getStore: async (k: string) => (k in disk ? JSON.parse(JSON.stringify(disk[k])) : undefined),
      setStore: async (k: string, v: unknown) => { if (v === undefined) delete disk[k]; else disk[k] = JSON.parse(JSON.stringify(v)); },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const sync = await import('../mangaSync');
  const store = await import('../mangaStore');
  const backendMod = await import('../../backend');
  return { sync, store, backendMod, disk };
}

// ─── Fusión pura ───────────────────────────────────────────
describe('mergeRemote', () => {
  let m: Awaited<ReturnType<typeof load>>['sync'];
  beforeEach(async () => { ({ sync: m } = await load()); });
  const NOW = T0 + 999 * 60_000;

  it('solo en la nube: se adopta tal cual', () => {
    const r = m.mergeRemote(undefined, row(), NOW);
    expect(r.action).toBe('set');
    if (r.action !== 'set') return;
    expect(r.record).toMatchObject({ status: 'reading', readRanges: [[1, 5]], syncedAt: NOW });
    expect(r.record.last).toMatchObject({ chapterId: 'c5', chapterNumber: '5', page: 3, pageCount: 20 });
    expect(r.record.manga).toMatchObject({ id: 'm1', sourceId: 'mangadex', title: 'Manga m1' });
  });

  it('solo en local: nada que hacer con un borrado que no conocemos', () => {
    expect(m.mergeRemote(undefined, row({ deleted: true }), NOW).action).toBe('keep');
  });

  it('gana el cambio más reciente (estado, ficha y dónde vas)', () => {
    const local = rec({ status: 'planning', updatedAt: T0 });
    const newer = m.mergeRemote(local, row({ status: 'completed', updatedAt: at(10), lastPage: 19 }), NOW);
    expect(newer).toMatchObject({ action: 'set', record: { status: 'completed', updatedAt: T0 + 10 * 60_000 } });

    const older = m.mergeRemote(rec({ status: 'planning', updatedAt: T0 + 20 * 60_000 }), row({ status: 'completed', updatedAt: at(10) }), NOW);
    expect(older.action).toBe('set'); // por la unión de lo leído…
    if (older.action === 'set') expect(older.record.status).toBe('planning'); // …pero el estado local NO se pisa
  });

  it('un estado de solo historial en la nube quita la biblioteca local si es más nuevo', () => {
    const r = m.mergeRemote(rec({ updatedAt: T0 }), row({ status: null, updatedAt: at(5) }), NOW);
    expect(r).toMatchObject({ action: 'set', record: { status: undefined } });
  });

  it('lo leído SIEMPRE se une (no se pierde un capítulo leído en otro dispositivo)', () => {
    const local = rec({ readRanges: [[1, 3]], updatedAt: T0 + 60 * 60_000 });          // local más nuevo
    const r = m.mergeRemote(local, row({ readRanges: [[4, 9], [12.5, 12.5]], updatedAt: at(0) }), NOW);
    expect(r.action).toBe('set');
    if (r.action !== 'set') return;
    expect(r.record.readRanges).toEqual([[1, 9], [12.5, 12.5]]);
    expect(r.record.updatedAt).toBeGreaterThanOrEqual(NOW);                             // pendiente de subir con la unión
  });

  it('si no cambia nada al unir, se conserva sin marcar nada como pendiente', () => {
    const local = rec({ readRanges: [[1, 5]], updatedAt: T0 + 60 * 60_000 });
    expect(m.mergeRemote(local, row({ readRanges: [[2, 4]], updatedAt: at(0) }), NOW).action).toBe('keep');
  });

  it('«olvidar lo leído» más nuevo en la nube descarta lo leído local', () => {
    const local = rec({ readRanges: [[1, 50]], read: ['c1', 'c2'], updatedAt: T0 });
    const r = m.mergeRemote(local, row({ readRanges: [[1, 2]], readResetAt: at(30), updatedAt: at(30) }), NOW);
    expect(r).toMatchObject({ action: 'set', record: { readRanges: [[1, 2]], read: [], readResetAt: T0 + 30 * 60_000 } });
  });

  it('«olvidar lo leído» local más nuevo ignora lo leído antiguo de la nube', () => {
    const local = rec({ readRanges: [[1, 2]], readResetAt: T0 + 30 * 60_000, updatedAt: T0 + 30 * 60_000 });
    const r = m.mergeRemote(local, row({ readRanges: [[1, 200]], updatedAt: at(0) }), NOW);
    expect(r.action).toBe('keep');
  });

  it('borrado en la nube: solo se borra si es más nuevo que lo local', () => {
    expect(m.mergeRemote(rec({ updatedAt: T0 }), row({ deleted: true, updatedAt: at(5) }), NOW).action).toBe('delete');
    expect(m.mergeRemote(rec({ updatedAt: T0 + 60 * 60_000 }), row({ deleted: true, updatedAt: at(5) }), NOW).action).toBe('keep');
  });

  it('datos hostiles de la nube quedan saneados', () => {
    const r = m.mergeRemote(
      undefined,
      row({
        status: 'hackeado' as any,
        manga: { id: 'x', sourceId: 'x', title: 'T'.repeat(5000), coverUrl: 'javascript:alert(1)', tags: 'no-array' as any, status: 'raro', year: 'x' as any, lastChapter: 5 as any } as any,
        readRanges: [[5, 1], ['a', 2], [1, 1e9], null, [7, 8]] as any,
        lastPage: -5,
      }),
      NOW
    );
    expect(r.action).toBe('set');
    if (r.action !== 'set') return;
    expect(r.record.status).toBeUndefined();
    expect(r.record.manga.title.length).toBeLessThanOrEqual(300);
    expect(r.record.manga.coverUrl).toBe('');
    expect(r.record.manga.tags).toEqual([]);
    expect(r.record.manga.status).toBe('ongoing');
    expect(r.record.manga.year).toBeNull();
    expect(r.record.manga.lastChapter).toBeNull();
    expect(r.record.readRanges).toEqual([[7, 8]]);
    expect(r.record.last?.page).toBe(0);
    // la identidad la fijan las columnas, no la ficha
    expect(r.record.manga.id).toBe('m1');
    expect(r.record.manga.sourceId).toBe('mangadex');
  });
});

describe('ficha en la nube', () => {
  it('solo https, recorta y limita las etiquetas', async () => {
    const { sync } = await load();
    const w = sync.toWireManga(manga('a', { title: 'x'.repeat(400), description: 'd'.repeat(900), coverUrl: 'http://inseguro.dev/c.jpg', tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }));
    expect(w.title).toHaveLength(300);
    expect(w.description).toHaveLength(300);
    expect(w.coverUrl).toBe('');
    expect(w.tags).toHaveLength(8);
    expect(sync.toWireManga(manga('b', { coverUrl: 'https://ok.dev/a.jpg' })).coverUrl).toBe('https://ok.dev/a.jpg');
    expect(sync.toWireManga(manga('c', { title: '' })).title).toBe('Sin título');
  });

  it('un registro local se convierte en entrada y vuelve igual', async () => {
    const { sync } = await load();
    const local = rec({ last: { chapterId: 'c3', chapterNumber: '3', chapterIndex: 2, page: 7, pageCount: 30, at: T0 + 5 * 60_000 }, readRanges: [[1, 3]], readResetAt: T0 + 60_000 });
    const item = sync.toSyncItem(local);
    expect(item).toMatchObject({
      source: 'mangadex', mangaId: 'm1', status: 'reading', lastChapterId: 'c3', lastPage: 7, lastPageCount: 30,
      readRanges: [[1, 3]], deleted: false, updatedAt: at(5),
    });
    expect(item.readResetAt).toBe(at(1));
    const back = sync.recordFromRow({ ...item, syncedAt: at(6) }, T0);
    expect(back.last).toMatchObject({ chapterId: 'c3', page: 7, pageCount: 30 });
    expect(back.readRanges).toEqual([[1, 3]]);
    expect(back.readResetAt).toBe(T0 + 60_000);
  });

  it('un borrado se comunica con una entrada mínima válida', async () => {
    const { sync } = await load();
    const t = sync.tombstoneItem('mangadex::uuid::con-dos-puntos', T0);
    expect(t).toMatchObject({ source: 'mangadex', mangaId: 'uuid::con-dos-puntos', deleted: true, status: null, readRanges: [] });
    expect(t.manga.title).toBeTruthy();
  });
});

// ─── Motor: servidor simulado ──────────────────────────────
function fakeServer() {
  const rows = new Map<string, MangaSyncRow & { user: string }>();
  let clock = T0 + 100 * 60_000;
  const calls = { push: 0, pull: 0, pushed: [] as MangaSyncItem[][] };
  let failWith: Error | null = null;
  const api = (user: string) => ({
    async pushMangaEntries(items: MangaSyncItem[]) {
      calls.push++;
      calls.pushed.push(items);
      if (failWith) throw failWith;
      let n = 0;
      for (const it of items) {
        const key = `${user}|${it.source}|${it.mangaId}`;
        const cur = rows.get(key);
        if (cur && !(Date.parse(it.updatedAt) > Date.parse(cur.updatedAt))) continue;
        rows.set(key, { ...it, user, syncedAt: new Date((clock += 1000)).toISOString() });
        n++;
      }
      return n;
    },
    async pullMangaEntries(opts: { since?: string | null; limit?: number } = {}) {
      calls.pull++;
      if (failWith) throw failWith;
      const since = opts.since ? Date.parse(opts.since) : -1;
      return [...rows.values()]
        .filter((r) => r.user === user && Date.parse(r.syncedAt) > since)
        .sort((a, b) => Date.parse(a.syncedAt) - Date.parse(b.syncedAt))
        .slice(0, opts.limit ?? 200)
        .map(({ user: _u, ...r }) => r);
    },
  });
  return {
    rows, calls, api,
    fail: (e: Error | null) => { failWith = e; },
    /** Simula otro dispositivo de esa cuenta escribiendo. */
    seed: (user: string, r: MangaSyncRow) => rows.set(`${user}|${r.source}|${r.mangaId}`, { ...r, user, syncedAt: new Date((clock += 1000)).toISOString() }),
  };
}

async function boot(user = 'user-a') {
  const env = await load();
  const server = fakeServer();
  env.backendMod.__setBackendForTests(server.api(user) as any);
  await env.store.initMangaStore();
  return { ...env, server, user };
}

describe('sincronización (motor)', () => {
  it('sube lo que hay en local la primera vez y lo deja marcado como al día', async () => {
    const { sync, store, server, user } = await boot();
    const a = manga('a');
    store.addToLibrary(a, 'reading');
    store.recordOpen(a, { id: 'c1', chapter: '1' }, 0, 20);
    store.setChapterRead(a, { id: 'c1', chapter: '1' }, true);

    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();

    const pushed = [...server.rows.values()];
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ mangaId: 'a', status: 'reading', lastChapterId: 'c1', readRanges: [[1, 1]] });
    expect(store.dirtyRecords()).toHaveLength(0);
    expect(store.useMangaData.getState().meta.owner).toBe(user);
    expect(sync.useMangaSync.getState().state).toBe('idle');
    sync.stopMangaSync();
  });

  it('trae lo de otro dispositivo y NO lo vuelve a subir', async () => {
    const { sync, store, server, user } = await boot();
    server.seed(user, row({ mangaId: 'b', manga: { id: 'b', sourceId: 'mangadex', title: 'Bleach', coverUrl: 'https://x.dev/b.jpg' } as any, updatedAt: at(5) }));
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();

    expect(store.getRecord({ id: 'b', sourceId: 'mangadex' })).toMatchObject({ status: 'reading', manga: { title: 'Bleach' } });
    expect(server.calls.pushed.flat().filter((i) => i.mangaId === 'b')).toHaveLength(0);
    expect(store.useMangaData.getState().meta.pulledAt).toBeTruthy();
    sync.stopMangaSync();
  });

  it('mezcla: lo leído de los dos lados se une y se sube el resultado', async () => {
    const { sync, store, server, user } = await boot();
    const a = manga('a');
    store.addToLibrary(a, 'reading');
    store.setChapterRead(a, { id: 'c1', chapter: '1' }, true);
    store.setChapterRead(a, { id: 'c2', chapter: '2' }, true);
    server.seed(user, row({ mangaId: 'a', readRanges: [[3, 10]], updatedAt: at(-500), manga: { id: 'a', sourceId: 'mangadex', title: 'Manga a' } as any }));

    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();

    expect(store.getRecord(a)?.readRanges).toEqual([[1, 10]]);
    expect([...server.rows.values()].find((r) => r.mangaId === 'a')?.readRanges).toEqual([[1, 10]]);
    sync.stopMangaSync();
  });

  it('un borrado local llega a la nube como marca y se olvida al confirmarse', async () => {
    const { sync, store, server, user } = await boot();
    const a = manga('a');
    store.addToLibrary(a, 'reading');
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect([...server.rows.values()][0].deleted).toBe(false);

    vi.advanceTimersByTime(60_000);
    store.removeFromLibrary(a);                                   // sin lectura: se borra del todo
    expect(store.useMangaData.getState().tombstones['mangadex::a']).toBeTruthy();
    await sync.syncMangaNow();
    expect([...server.rows.values()][0]).toMatchObject({ deleted: true, status: null });
    expect(store.useMangaData.getState().tombstones).toEqual({});
    sync.stopMangaSync();
  });

  it('un borrado hecho en otro dispositivo se aplica aquí', async () => {
    const { sync, store, server, user } = await boot();
    const a = manga('a');
    store.addToLibrary(a, 'reading');
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();

    server.seed(user, row({ mangaId: 'a', deleted: true, status: null, updatedAt: new Date(Date.now() + 60_000).toISOString() }));
    await sync.syncMangaNow();
    expect(store.getRecord(a)).toBeUndefined();
    sync.stopMangaSync();
  });

  it('otra cuenta en el mismo equipo: se guarda copia y NADA se sube a la cuenta nueva', async () => {
    const { sync, store, server, backendMod, disk } = await boot('user-a');
    store.addToLibrary(manga('secreto'), 'reading');
    sync.startMangaSync('user-a');
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    sync.stopMangaSync();
    store.addToLibrary(manga('pendiente-de-a'), 'planning'); // cambio sin subir de la cuenta A

    // entra B
    backendMod.__setBackendForTests(server.api('user-b') as any);
    server.seed('user-b', row({ mangaId: 'de-b', manga: { id: 'de-b', sourceId: 'mangadex', title: 'De B' } as any }));
    sync.startMangaSync('user-b');
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();

    expect(store.getRecord({ id: 'secreto', sourceId: 'mangadex' })).toBeUndefined();
    expect(store.getRecord({ id: 'pendiente-de-a', sourceId: 'mangadex' })).toBeUndefined();
    expect(store.getRecord({ id: 'de-b', sourceId: 'mangadex' })).toBeDefined();
    expect(store.useMangaData.getState().meta.owner).toBe('user-b');
    expect([...server.rows.values()].filter((r) => r.user === 'user-b').map((r) => r.mangaId)).toEqual(['de-b']);
    expect((disk.mangaDataPrev as any).records['mangadex::secreto']).toBeDefined(); // copia de seguridad
    sync.stopMangaSync();
  });

  it('pagina la descarga cuando hay muchas entradas', async () => {
    const { sync, store, server, user } = await boot();
    for (let i = 0; i < 450; i++) server.seed(user, row({ mangaId: `m${i}`, manga: { id: `m${i}`, sourceId: 'mangadex', title: `M${i}` } as any }));
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect(Object.keys(store.useMangaData.getState().records)).toHaveLength(450);
    expect(server.calls.pull).toBeGreaterThanOrEqual(3);
    sync.stopMangaSync();
  });

  it('sube en lotes de 100', async () => {
    const { sync, store, server, user } = await boot();
    for (let i = 0; i < 250; i++) store.addToLibrary(manga(`m${i}`), 'reading');
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect(server.calls.pushed.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(store.dirtyRecords()).toHaveLength(0);
    sync.stopMangaSync();
  });

  it('un cambio hecho MIENTRAS se sube no se marca como sincronizado', async () => {
    const { sync, store, server, user } = await boot();
    const a = manga('a');
    store.addToLibrary(a, 'reading');
    const api = server.api(user);
    const origPush = api.pushMangaEntries;
    api.pushMangaEntries = async (items: MangaSyncItem[]) => {
      vi.advanceTimersByTime(5000);
      store.setLibraryStatus(a, 'completed');                    // el usuario cambia durante el envío
      return origPush(items);
    };
    (await import('../../backend')).__setBackendForTests(api as any);
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect(store.dirtyRecords().map(([k]) => k)).toEqual(['mangadex::a']); // sigue pendiente
    sync.stopMangaSync();
  });

  it('un fallo de red deja lo pendiente para reintentar y avisa', async () => {
    const { sync, store, server, backendMod, user } = await boot();
    store.addToLibrary(manga('a'), 'reading');
    const { BackendError } = backendMod;
    server.fail(new BackendError('network'));
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect(sync.useMangaSync.getState()).toMatchObject({ state: 'error', error: 'Sin conexión' });
    expect(store.dirtyRecords()).toHaveLength(1);

    server.fail(null);
    await sync.syncMangaNow();
    expect(sync.useMangaSync.getState().state).toBe('idle');
    expect(store.dirtyRecords()).toHaveLength(0);
    sync.stopMangaSync();
  });

  it('sin la migración en la base de datos se desactiva sin ruido', async () => {
    const { sync, store, server, backendMod, user } = await boot();
    store.addToLibrary(manga('a'), 'reading');
    server.fail(new backendMod.BackendError('unavailable'));
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    expect(sync.useMangaSync.getState().state).toBe('unavailable');
    const calls = server.calls.push + server.calls.pull;
    store.addToLibrary(manga('b'), 'reading');                    // cambios posteriores no insisten
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.calls.push + server.calls.pull).toBe(calls);
    expect(store.getRecord({ id: 'a', sourceId: 'mangadex' })).toBeDefined(); // lo local sigue intacto
  });

  it('cambios seguidos se agrupan en una sola subida', async () => {
    const { sync, store, server, user } = await boot();
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    const before = server.calls.push;
    for (let i = 0; i < 20; i++) store.addToLibrary(manga(`x${i}`), 'reading');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.calls.push - before).toBe(1);
    sync.stopMangaSync();
  });

  it('al cerrar sesión deja de sincronizar pero conserva los datos', async () => {
    const { sync, store, server, user } = await boot();
    store.addToLibrary(manga('a'), 'reading');
    sync.startMangaSync(user);
    await vi.runOnlyPendingTimersAsync();
    await sync.syncMangaNow();
    sync.stopMangaSync();
    const calls = server.calls.push + server.calls.pull;
    store.addToLibrary(manga('b'), 'reading');
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(server.calls.push + server.calls.pull).toBe(calls);
    expect(sync.useMangaSync.getState().state).toBe('off');
    expect(store.getRecord({ id: 'b', sourceId: 'mangadex' })).toBeDefined();
  });
});
