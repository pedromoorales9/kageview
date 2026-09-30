import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Announcement } from '../backend';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const H = 3600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const ann = (over: Partial<Announcement> = {}): Announcement => ({
  id: 1, kind: 'info', display: 'banner', title: '', body: 'x', linkUrl: null, linkLabel: null,
  active: true, startsAt: iso(-H), expiresAt: null, createdAt: iso(-H), platform: 'all', belowVersion: null, ...over,
});

async function load() {
  vi.resetModules();
  (globalThis as any).localStorage = new MemoryStorage();
  return import('../announcements');
}

describe('announcements', () => {
  let m: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => { m = await load(); });

  it('estado según activo, programación y caducidad', () => {
    expect(m.announcementState(ann())).toBe('live');
    expect(m.announcementState(ann({ active: false }))).toBe('paused');
    expect(m.announcementState(ann({ startsAt: iso(H) }))).toBe('scheduled');
    expect(m.announcementState(ann({ expiresAt: iso(-1000) }))).toBe('expired');
    expect(m.announcementState(ann({ expiresAt: iso(H) }))).toBe('live');
  });

  it('solo enlaces https son seguros', () => {
    expect(m.isSafeLink('https://a.dev/x')).toBe(true);
    for (const bad of ['http://a.dev', 'javascript:alert(1)', 'file:///etc/passwd', 'kageview://x', '', null, undefined, 'no url']) {
      expect(m.isSafeLink(bad as string)).toBe(false);
    }
  });

  it('la cola separa banner/ventana, oculta descartados y no vigentes, y prioriza lo urgente', () => {
    const all = [
      ann({ id: 1, kind: 'info' }),
      ann({ id: 2, kind: 'maintenance' }),
      ann({ id: 3, kind: 'update' }),
      ann({ id: 4, kind: 'warning', display: 'modal' }),
      ann({ id: 5, kind: 'info', active: false }),
      ann({ id: 6, kind: 'info', startsAt: iso(H) }),
      ann({ id: 7, kind: 'info' }),
    ];
    const banners = m.pendingAnnouncements(all, new Set([7]), 'banner').map((a) => a.id);
    expect(banners).toEqual([2, 3, 1]); // mantenimiento > novedad > info; 7 descartado; 5 y 6 no vigentes
    expect(m.pendingAnnouncements(all, new Set(), 'modal').map((a) => a.id)).toEqual([4]);
    expect(m.pendingAnnouncements(undefined, new Set(), 'banner')).toEqual([]);
  });

  it('los descartados se recuerdan y toleran datos corruptos', () => {
    expect(m.loadDismissed().size).toBe(0);
    m.saveDismissed(new Set([3, 9]));
    expect([...m.loadDismissed()]).toEqual([3, 9]);
    localStorage.setItem('kageview.dismissedAnnouncements', '{"no":"array"}');
    expect(m.loadDismissed().size).toBe(0);
    localStorage.setItem('kageview.dismissedAnnouncements', 'no es json');
    expect(m.loadDismissed().size).toBe(0);
    localStorage.setItem('kageview.dismissedAnnouncements', JSON.stringify([1, 'x', null, 2]));
    expect([...m.loadDismissed()]).toEqual([1, 2]);
  });

  it('acota lo recordado', () => {
    m.saveDismissed(new Set(Array.from({ length: 500 }, (_, i) => i)));
    const back = m.loadDismissed();
    expect(back.size).toBe(200);
    expect(back.has(499)).toBe(true);
    expect(back.has(0)).toBe(false);
  });
});

describe('segmentación', () => {
  it('compara versiones numéricamente', async () => {
    const m = await load();
    expect(m.compareVersions('1.4.0', '1.10.0')).toBe(-1);
    expect(m.compareVersions('1.10.0', '1.4.0')).toBe(1);
    expect(m.compareVersions('1.4.0', '1.4.0')).toBe(0);
    expect(m.compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(m.compareVersions('1.4', '1.4.0')).toBeNull();
    expect(m.compareVersions('v1.4.0', '1.4.0')).toBeNull();
    expect(m.isValidVersion('1.4.0')).toBe(true);
    expect(m.isValidVersion('1.4.0-beta')).toBe(false);
  });

  it('plataforma de Electron → plataforma de anuncios', async () => {
    const m = await load();
    expect(m.toAppPlatform('darwin')).toBe('mac');
    expect(m.toAppPlatform('win32')).toBe('windows');
    expect(m.toAppPlatform('linux')).toBe('linux');
    expect(m.toAppPlatform(undefined)).toBe('unknown');
  });

  it('quién ve qué', async () => {
    const m = await load();
    const mac140 = { platform: 'mac' as const, version: '1.4.0' };
    const win130 = { platform: 'windows' as const, version: '1.3.0' };
    expect(m.matchesAudience({ platform: 'all', belowVersion: null }, mac140)).toBe(true);
    expect(m.matchesAudience({ platform: 'mac', belowVersion: null }, mac140)).toBe(true);
    expect(m.matchesAudience({ platform: 'mac', belowVersion: null }, win130)).toBe(false);
    // "solo versiones anteriores a 1.4.0"
    expect(m.matchesAudience({ platform: 'all', belowVersion: '1.4.0' }, win130)).toBe(true);
    expect(m.matchesAudience({ platform: 'all', belowVersion: '1.4.0' }, mac140)).toBe(false);
    expect(m.matchesAudience({ platform: 'all', belowVersion: '1.4.0' }, { platform: 'mac', version: '1.5.2' })).toBe(false);
    // combinado
    expect(m.matchesAudience({ platform: 'windows', belowVersion: '1.4.0' }, win130)).toBe(true);
    expect(m.matchesAudience({ platform: 'mac', belowVersion: '1.4.0' }, win130)).toBe(false);
    // contexto desconocido: ante la duda, se muestra
    expect(m.matchesAudience({ platform: 'mac', belowVersion: '1.4.0' }, { platform: 'unknown', version: null })).toBe(true);
  });

  it('remoteConfig filtra por sistema y versión de ESTA instalación', async () => {
    vi.resetModules();
    (globalThis as any).localStorage = new MemoryStorage();
    (globalThis as any).window = { electron: { platform: 'win32', getVersion: async () => '1.4.0' } };
    const backendMod = await import('../backend');
    const { MockBackend } = await import('../backend/mockBackend');
    const b = new MockBackend();
    backendMod.__setBackendForTests(b);
    await b.signIn('kage@demo.dev', 'demo1234');
    const base = { kind: 'info' as const, display: 'banner' as const, body: 'x' };
    await b.adminSaveAnnouncement({ ...base, title: 'solo mac', platform: 'mac' });
    await b.adminSaveAnnouncement({ ...base, title: 'viejas', belowVersion: '1.4.0' });
    await b.adminSaveAnnouncement({ ...base, title: 'windows', platform: 'windows' });
    await b.adminSaveAnnouncement({ ...base, title: 'futuras', belowVersion: '1.5.0' });
    const rc = await import('../remoteConfig');
    const titles = (await rc.fetchRemoteConfig())!.announcements.map((a) => a.title);
    expect(titles).toContain('windows');
    expect(titles).toContain('futuras'); // 1.4.0 < 1.5.0
    expect(titles).not.toContain('solo mac');
    expect(titles).not.toContain('viejas'); // ya tiene la 1.4.0
    delete (globalThis as any).window;
  });
});

describe('remoteConfig', () => {
  it('lee anuncios y servicios del backend y falla en abierto', async () => {
    vi.resetModules();
    (globalThis as any).localStorage = new MemoryStorage();
    const backendMod = await import('../backend');
    const { MockBackend } = await import('../backend/mockBackend');
    const b = new MockBackend();
    backendMod.__setBackendForTests(b);
    const rc = await import('../remoteConfig');
    const { useAppStore } = await import('../store');

    await b.signIn('kage@demo.dev', 'demo1234');
    await b.adminSetProviderSwitch('jkanime', 'Caído');
    await rc.refreshRemoteConfig();
    const cfg = useAppStore.getState().remoteConfig!;
    expect(cfg.providersDisabled).toEqual({ jkanime: 'Caído' });
    expect(cfg.announcements.length).toBeGreaterThanOrEqual(1);
    expect(rc.remoteDisableReason('jkanime')).toBe('Caído');
    expect(rc.remoteDisableReason('animeflv')).toBeNull();

    // si TODO falla → null y el store conserva lo último
    b.listActiveAnnouncements = () => Promise.reject(new Error('red'));
    b.listProviderSwitches = () => Promise.reject(new Error('red'));
    expect(await rc.fetchRemoteConfig()).toBeNull();
    await rc.refreshRemoteConfig();
    expect(useAppStore.getState().remoteConfig!.providersDisabled).toEqual({ jkanime: 'Caído' });

    // si solo falla una parte, se conserva el valor anterior de esa parte
    b.listProviderSwitches = () => Promise.reject(new Error('red'));
    b.listActiveAnnouncements = () => Promise.resolve([]);
    const partial = (await rc.fetchRemoteConfig())!;
    expect(partial.announcements).toEqual([]);
    expect(partial.providersDisabled).toEqual({ jkanime: 'Caído' });

    // sin backend configurado → null
    backendMod.__setBackendForTests(null);
    expect(await rc.fetchRemoteConfig()).toBeNull();
  });
});
