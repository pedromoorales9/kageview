import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mapError } from '../supabaseBackend';
import { MockBackend } from '../mockBackend';
import { BackendError, isStaff } from '../types';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const input = (over = {}) => ({ kind: 'info' as const, display: 'banner' as const, title: 'T', body: 'Hola', ...over });
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as BackendError).code; }
  return 'ok';
};

describe('errores de permisos', () => {
  it('RLS y funciones de administración se distinguen de "sin sesión"', () => {
    expect(mapError({ code: '42501', message: 'new row violates row-level security policy for table "announcements"' }).code).toBe('forbidden');
    expect(mapError({ code: '42501', message: 'forbidden' }).code).toBe('forbidden');
    expect(mapError({ code: '42501', message: 'permission denied for table announcements' }).code).toBe('not_authenticated');
  });

  it('isStaff', () => {
    expect(isStaff('owner')).toBe(true);
    expect(isStaff('admin')).toBe(true);
    expect(isStaff('user')).toBe(false);
    expect(isStaff(undefined)).toBe(false);
  });
});

describe('MockBackend: administración', () => {
  let b: MockBackend;
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    b = new MockBackend();
  });

  it('un usuario normal no puede administrar nada', async () => {
    await b.signUp({ email: 'x@test.dev', password: 'secreto123', username: 'normal' });
    expect((await b.getMyProfile())!.role).toBe('user');
    expect(await code(b.adminSaveAnnouncement(input()))).toBe('forbidden');
    expect(await code(b.adminListAnnouncements())).toBe('forbidden');
    expect(await code(b.adminSetProviderSwitch('animeflv', 'x'))).toBe('forbidden');
    expect(await code(b.adminStats())).toBe('forbidden');
    expect(await code(b.adminListStaff())).toBe('forbidden');
    expect(await code(b.adminSetRole('seed-mika', 'admin'))).toBe('forbidden');
  });

  it('el público solo ve los anuncios vigentes', async () => {
    await b.signIn('kage@demo.dev', 'demo1234');
    await b.adminSaveAnnouncement(input({ title: 'vigente' }));
    await b.adminSaveAnnouncement(input({ title: 'borrador', active: false }));
    await b.adminSaveAnnouncement(input({ title: 'futuro', startsAt: new Date(Date.now() + 86_400_000).toISOString() }));
    await b.signOut();
    const titles = (await b.listActiveAnnouncements()).map((a) => a.title);
    expect(titles).toContain('vigente');
    expect(titles).not.toContain('borrador');
    expect(titles).not.toContain('futuro');
  });

  it('el owner publica, edita, pausa y borra', async () => {
    await b.signIn('kage@demo.dev', 'demo1234');
    const a = await b.adminSaveAnnouncement(input({ display: 'modal', linkUrl: 'https://kageview.dev', linkLabel: 'Ver' }));
    expect(a).toMatchObject({ display: 'modal', linkUrl: 'https://kageview.dev', active: true });

    const edited = await b.adminSaveAnnouncement(input({ body: 'Corregido', active: false }), a.id);
    expect(edited.body).toBe('Corregido');
    expect((await b.listActiveAnnouncements()).some((x) => x.id === a.id)).toBe(false);

    await b.adminDeleteAnnouncement(a.id);
    expect(await code(b.adminDeleteAnnouncement(a.id))).toBe('forbidden');
  });

  it('valida el contenido', async () => {
    await b.signIn('kage@demo.dev', 'demo1234');
    expect(await code(b.adminSaveAnnouncement(input({ body: '   ' })))).toBe('unknown');
    expect(await code(b.adminSaveAnnouncement(input({ body: 'x'.repeat(601) })))).toBe('unknown');
    expect(await code(b.adminSaveAnnouncement(input({ linkUrl: 'http://inseguro.dev' })))).toBe('unknown');
    expect(await code(b.adminSaveAnnouncement(input({ linkUrl: 'javascript:alert(1)' })))).toBe('unknown');
  });

  it('desactivar y reactivar un servicio', async () => {
    await b.signIn('sora@demo.dev', 'demo1234'); // admin
    await b.adminSetProviderSwitch('animeflv', 'Caído');
    expect(await b.listProviderSwitches()).toMatchObject([{ providerId: 'animeflv', reason: 'Caído' }]);
    await b.adminSetProviderSwitch('animeflv', null);
    expect(await b.listProviderSwitches()).toEqual([]);
  });

  it('solo el owner gestiona el equipo y nunca puede tocarse al owner', async () => {
    await b.signIn('sora@demo.dev', 'demo1234'); // admin, no owner
    expect((await b.adminListStaff()).map((m) => m.profile.username)).toEqual(['kage', 'sora']);
    expect(await code(b.adminSetRole('seed-mika', 'admin'))).toBe('forbidden');
    await b.signOut();

    await b.signIn('kage@demo.dev', 'demo1234');
    await b.adminSetRole('seed-mika', 'admin');
    expect((await b.adminListStaff()).map((m) => m.profile.username)).toContain('mika');
    await b.adminSetRole('seed-mika', 'user');
    expect((await b.adminListStaff()).map((m) => m.profile.username)).not.toContain('mika');
    expect(await code(b.adminSetRole('seed-kage', 'user'))).toBe('forbidden');
    expect(await code(b.adminSetRole('nadie', 'admin'))).toBe('not_found');
  });

  it('las estadísticas cuentan usuarios y avisos vigentes', async () => {
    await b.signIn('kage@demo.dev', 'demo1234');
    const s = await b.adminStats();
    expect(s.usersTotal).toBe(4);
    expect(s.announcementsLive).toBeGreaterThanOrEqual(1);
    expect(s.watchingNow).toBeGreaterThanOrEqual(1);
  });
});
