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

describe('MockBackend: auditoría, suspensión y usuarios', () => {
  let b: MockBackend;
  beforeEach(async () => {
    (globalThis as any).localStorage = new MemoryStorage();
    b = new MockBackend();
    await b.signIn('kage@demo.dev', 'demo1234');
  });

  it('el registro anota quién hizo qué y solo lo lee el staff', async () => {
    const a = await b.adminSaveAnnouncement(input({ title: 'Hola' }));
    await b.adminSaveAnnouncement(input({ title: 'Hola', body: 'otro' }), a.id);
    await b.adminSaveAnnouncement(input({ title: 'Hola', active: false }), a.id);
    await b.adminSetProviderSwitch('animeflv', 'Caído');
    await b.adminSetProviderSwitch('animeflv', 'Sigue caído');
    await b.adminSetProviderSwitch('animeflv', null);
    await b.adminDeleteAnnouncement(a.id);
    const log = await b.adminAuditLog();
    expect(log.map((e) => e.action).slice(0, 7).reverse()).toEqual([
      'announcement.create', 'announcement.update', 'announcement.pause',
      'service.disable', 'service.reason', 'service.enable', 'announcement.delete',
    ]);
    expect(log.every((e) => e.actor.length > 0)).toBe(true);
    // paginación por cursor
    const first = await b.adminAuditLog({ limit: 3 });
    const next = await b.adminAuditLog({ before: first[first.length - 1].id, limit: 3 });
    expect(next[0].id).toBeLessThan(first[first.length - 1].id);

    await b.signOut();
    await b.signUp({ email: 'x@test.dev', password: 'secreto123', username: 'normal' });
    expect(await code(b.adminAuditLog())).toBe('forbidden');
  });

  it('un usuario suspendido no puede escribir, pedir amistad ni publicar actividad', async () => {
    await b.signOut();
    await b.signUp({ email: 'x@test.dev', password: 'secreto123', username: 'normal' });
    const me = (await b.getSession())!;
    const friend = (await b.listFriends())[0].profile.id;
    await b.sendMessage(friend, { body: 'antes' });
    await b.signOut();

    await b.signIn('sora@demo.dev', 'demo1234'); // admin
    await b.adminSetSuspended(me.id, true, 'Spam');
    await b.signOut();

    await b.signIn('x@test.dev', 'secreto123');
    expect(await code(b.sendMessage(friend, { body: 'después' }))).toBe('suspended');
    expect(await code(b.sendFriendRequest('seed-ren'))).toBe('suspended');
    expect(await code(b.updateMyProfile({ bio: 'x' }))).toBe('suspended');
    expect(await code(b.setActivity({ mediaId: 1, title: 'x', coverUrl: null, episode: 1, totalEpisodes: null }))).toBe('suspended');
    await b.signOut();

    await b.signIn('sora@demo.dev', 'demo1234');
    await b.adminSetSuspended(me.id, false);
    await b.signOut();
    await b.signIn('x@test.dev', 'secreto123');
    expect(await code(b.sendMessage(friend, { body: 'ya puedo' }))).toBe('ok');
  });

  it('no se puede suspender al staff ni a uno mismo; solo el staff suspende', async () => {
    expect(await code(b.adminSetSuspended('seed-sora', true))).toBe('forbidden'); // admin
    expect(await code(b.adminSetSuspended('seed-kage', true))).toBe('forbidden'); // owner (uno mismo)
    expect(await code(b.adminSetSuspended('nadie', true))).toBe('not_found');
    await b.signOut();
    await b.signUp({ email: 'x@test.dev', password: 'secreto123', username: 'normal' });
    expect(await code(b.adminSetSuspended('seed-mika', true))).toBe('forbidden');
  });

  it('listado de usuarios: búsqueda, paginación y estado', async () => {
    await b.adminSetSuspended('seed-mika', true, 'Prueba');
    const all = await b.adminListUsers();
    expect(all.total).toBe(4);
    expect(all.users.find((u) => u.profile.username === 'mika')).toMatchObject({ suspended: true, suspendedReason: 'Prueba' });
    expect((await b.adminListUsers({ query: 'SOR' })).users.map((u) => u.profile.username)).toEqual(['sora']);
    expect((await b.adminListUsers({ query: 'zzz' })).total).toBe(0);
    const p1 = await b.adminListUsers({ limit: 2, offset: 0 });
    const p2 = await b.adminListUsers({ limit: 2, offset: 2 });
    expect(p1.users).toHaveLength(2);
    expect(new Set([...p1.users, ...p2.users].map((u) => u.profile.id)).size).toBe(4);
    expect(JSON.stringify(all)).not.toContain('@demo.dev'); // sin correos
  });

  it('registros por día: un punto por día con ceros', async () => {
    const s = await b.adminSignups(30);
    expect(s).toHaveLength(30);
    expect(await b.adminSignups(1)).toHaveLength(7);
    expect(await b.adminSignups(9999)).toHaveLength(90);
  });

  it('anuncios segmentados: se guardan y validan', async () => {
    const a = await b.adminSaveAnnouncement(input({ platform: 'mac', belowVersion: '1.4.0' }));
    expect(a).toMatchObject({ platform: 'mac', belowVersion: '1.4.0' });
    expect(await code(b.adminSaveAnnouncement(input({ belowVersion: '1.4' })))).toBe('unknown');
  });
});
