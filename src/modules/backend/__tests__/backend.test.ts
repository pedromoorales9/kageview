import { describe, it, expect, beforeEach } from 'vitest';
import { mapError } from '../supabaseBackend';
import { MockBackend } from '../mockBackend';
import { BackendError } from '../types';

// localStorage mínimo para el entorno node de vitest
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe('mapError', () => {
  const code = (e: unknown) => mapError(e).code;

  it('errores de autenticación de GoTrue', () => {
    expect(code({ code: 'invalid_credentials', message: 'x' })).toBe('invalid_credentials');
    expect(code({ message: 'Invalid login credentials' })).toBe('invalid_credentials');
    expect(code({ code: 'email_not_confirmed' })).toBe('email_not_confirmed');
    expect(code({ code: 'user_already_exists' })).toBe('email_taken');
    expect(code({ message: 'User already registered' })).toBe('email_taken');
    expect(code({ code: 'weak_password' })).toBe('weak_password');
    expect(code({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
    expect(code({ code: 'email_address_invalid' })).toBe('invalid_email');
  });

  it('errores de red', () => {
    expect(code({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toBe('network');
    expect(code(new TypeError('Failed to fetch'))).toBe('network');
    expect(code({ status: 0 })).toBe('network');
  });

  it('errores de Postgres/PostgREST de las RPC de amistad', () => {
    expect(code({ code: '23505', message: 'already friends' })).toBe('already_friends');
    expect(code({ code: '23505', message: 'request already sent' })).toBe('request_exists');
    expect(code({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' })).toBe('username_taken');
    expect(code({ code: '23514', message: 'violates check constraint' })).toBe('invalid_username');
    expect(code({ code: '54000', message: 'too many pending requests' })).toBe('too_many_requests');
    expect(code({ code: 'P0002', message: 'user not found' })).toBe('not_found');
    expect(code({ code: '42501', message: 'permission denied' })).toBe('not_authenticated');
  });

  it('almacenamiento', () => {
    expect(code({ message: 'The object exceeded the maximum allowed size' })).toBe('file_too_large');
    expect(code({ message: 'mime type text/html is not supported' })).toBe('invalid_file');
  });

  it('desconocidos y BackendError existentes', () => {
    expect(code(new Error('¯\\_(ツ)_/¯'))).toBe('unknown');
    expect(code(undefined)).toBe('unknown');
    const be = new BackendError('rate_limited');
    expect(mapError(be)).toBe(be);
  });
});

describe('MockBackend', () => {
  let b: MockBackend;
  beforeEach(() => {
    (globalThis as any).localStorage = new MemoryStorage();
    b = new MockBackend();
  });

  const signup = (name = 'yoyo') => b.signUp({ email: `${name}@t.dev`, password: 'secreto1', username: name });

  it('registro: valida usuario, email y contraseña; abre sesión', async () => {
    await expect(b.signUp({ email: 'mal', password: 'secreto1', username: 'yoyo' })).rejects.toMatchObject({ code: 'invalid_email' });
    await expect(b.signUp({ email: 'a@t.dev', password: '123', username: 'yoyo' })).rejects.toMatchObject({ code: 'weak_password' });
    await expect(b.signUp({ email: 'a@t.dev', password: 'secreto1', username: 'x' })).rejects.toMatchObject({ code: 'invalid_username' });
    await expect(b.signUp({ email: 'a@t.dev', password: 'secreto1', username: 'mika' })).rejects.toMatchObject({ code: 'username_taken' });
    const r = await signup();
    expect(r.needsEmailConfirmation).toBe(false);
    expect((await b.getSession())?.email).toBe('yoyo@t.dev');
    expect((await b.getMyProfile())?.username).toBe('yoyo');
  });

  it('inicio de sesión y cierre', async () => {
    await signup();
    await b.signOut();
    expect(await b.getSession()).toBeNull();
    await expect(b.signIn('yoyo@t.dev', 'incorrecta')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await b.signIn('YOYO@t.dev', 'secreto1');
    expect((await b.getSession())?.id).toBeTruthy();
  });

  it('eventos de autenticación', async () => {
    const events: string[] = [];
    b.onAuthChange((e) => events.push(e));
    await signup();
    await b.signOut();
    expect(events).toEqual(['SIGNED_IN', 'SIGNED_OUT']);
  });

  it('sin sesión las operaciones fallan con not_authenticated', async () => {
    await expect(b.listFriends()).rejects.toMatchObject({ code: 'not_authenticated' });
    await expect(b.getMyProfile()).rejects.toMatchObject({ code: 'not_authenticated' });
  });

  it('amigos: mika ya es amiga; sora tiene una solicitud pendiente', async () => {
    await signup();
    expect((await b.listFriends()).map((f) => f.profile.username)).toEqual(['mika']);
    const reqs = await b.listFriendRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({ direction: 'incoming', profile: { username: 'sora' } });
    await b.respondToFriendRequest(reqs[0].id, true);
    expect((await b.listFriends()).map((f) => f.profile.username)).toEqual(['mika', 'sora']);
  });

  it('buscar (≥3 letras, sin uno mismo) y enviar solicitud; no duplica', async () => {
    await signup();
    expect(await b.searchUsers('re')).toEqual([]);
    const found = await b.searchUsers('ren');
    expect(found.map((p) => p.username)).toEqual(['ren_k']);
    expect(await b.sendFriendRequest(found[0].id)).toBe('sent');
    await expect(b.sendFriendRequest(found[0].id)).rejects.toMatchObject({ code: 'request_exists' });
    const mika = (await b.listFriends())[0];
    await expect(b.sendFriendRequest(mika.profile.id)).rejects.toMatchObject({ code: 'already_friends' });
    expect((await b.listFriendRequests()).some((r) => r.direction === 'outgoing')).toBe(true);
  });

  it('actividad de amigos respeta la privacidad y solo muestra amigos', async () => {
    await signup();
    // mika (amiga) sí; ren (no amigo) no
    expect((await b.listFriendsActivity()).map((a) => a.profile.username)).toEqual(['mika']);
  });

  it('mi actividad: activar y limpiar', async () => {
    await signup();
    await b.setActivity({ mediaId: 1, title: 'X', coverUrl: null, episode: 3, totalEpisodes: 12 });
    await b.clearActivity();
    // (el mock no devuelve la propia actividad en listFriendsActivity)
    expect((await b.listFriendsActivity()).some((a) => a.title === 'X')).toBe(false);
  });

  it('listas: upsert conserva el progreso previo, y se puede quitar', async () => {
    await signup();
    const media = { id: 5, title: { romaji: 'A' }, coverImage: { large: 'x' } };
    await b.upsertLibraryEntry({ mediaType: 'anime', mediaId: 5, status: 'CURRENT', progress: 4, media });
    await b.upsertLibraryEntry({ mediaType: 'anime', mediaId: 5, status: 'PAUSED', media });
    const list = await b.listLibrary('anime');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'PAUSED', progress: 4 });
    await b.removeLibraryEntry('anime', 5);
    expect(await b.listLibrary('anime')).toHaveLength(0);
  });

  it('perfil: cambiar usuario (único) y privacidad', async () => {
    await signup();
    await expect(b.updateMyProfile({ username: 'mika' })).rejects.toMatchObject({ code: 'username_taken' });
    await expect(b.updateMyProfile({ username: 'no valido!' })).rejects.toMatchObject({ code: 'invalid_username' });
    const p = await b.updateMyProfile({ username: 'Nuevo_Nombre', showActivity: false, bio: 'hola' });
    expect(p).toMatchObject({ username: 'nuevo_nombre', showActivity: false, bio: 'hola' });
  });

  it('borrar cuenta elimina datos y cierra sesión', async () => {
    await signup();
    await b.deleteAccount();
    expect(await b.getSession()).toBeNull();
    expect(await b.isUsernameAvailable('yoyo')).toBe(true);
  });
});
