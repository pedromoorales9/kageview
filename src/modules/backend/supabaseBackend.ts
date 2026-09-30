// ═══════════════════════════════════════════════════════════
// SupabaseBackend — implementación real de AccountBackend
//
// Solo usa la anon key + el JWT del usuario: toda la autorización la hacen
// las políticas RLS de supabase/migrations (probadas en supabase/tests).
// ═══════════════════════════════════════════════════════════

import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import {
  AccountBackend,
  AdminStats,
  AdminUser,
  AdminUserPage,
  AuditEntry,
  SignupPoint,
  Announcement,
  AnnouncementInput,
  AppRole,
  ProviderSwitch,
  StaffMember,
  Activity,
  ActivityInput,
  ChatMessage,
  ChatSummaryItem,
  MessageCursor,
  MessageKind,
  SendMessageInput,
  AuthEvent,
  AuthUser,
  BackendError,
  BackendErrorCode,
  Friend,
  FriendActivity,
  FriendRequest,
  LibraryEntry,
  LibraryUpsert,
  MediaSnapshot,
  MediaType,
  Profile,
  ProfilePatch,
  PublicProfile,
} from './types';

const MAX_AVATAR_BYTES = 512 * 1024;
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** URL a la que Supabase redirige tras confirmar el correo / recuperar clave. */
export const AUTH_CALLBACK_URL = 'kageview://auth-callback';

// ─── Filas de la BD (snake_case) ───────────────────────────
interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  show_activity: boolean;
  show_library: boolean;
  role: AppRole;
  created_at: string;
}
interface AnnouncementRow {
  id: number;
  kind: Announcement['kind'];
  display: Announcement['display'];
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  active: boolean;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  // Añadidas en la migración 0005: ausentes si aún no se ha aplicado
  platform?: Announcement['platform'];
  below_version?: string | null;
}
interface LibraryRow {
  media_type: MediaType;
  media_id: number;
  status: LibraryEntry['status'];
  progress: number;
  score: number;
  media: MediaSnapshot;
  updated_at: string;
}
interface FriendshipRow {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  responded_at: string | null;
}
interface ActivityRow {
  user_id: string;
  media_id: number;
  title: string;
  cover_url: string | null;
  episode: number;
  total_episodes: number | null;
  active: boolean;
  updated_at: string;
}

interface MessageRow {
  id: number;
  sender_id: string;
  recipient_id: string;
  kind: MessageKind;
  body: string;
  payload: MediaSnapshot | null;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
}
interface ChatSummaryRow {
  friend_id: string;
  last_message_id: number;
  last_kind: MessageKind;
  last_body: string;
  last_sender: string;
  last_at: string;
  last_deleted: boolean;
  unread: number | string;
}

const toMessage = (r: MessageRow): ChatMessage => ({
  id: r.id,
  senderId: r.sender_id,
  recipientId: r.recipient_id,
  kind: r.kind,
  body: r.body ?? '',
  media: r.payload ?? null,
  createdAt: r.created_at,
  readAt: r.read_at ?? null,
  deleted: r.deleted_at != null,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  bio: r.bio,
  showActivity: r.show_activity,
  showLibrary: r.show_library,
  role: r.role ?? 'user',
  createdAt: r.created_at,
});

const toAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: r.id,
  kind: r.kind,
  display: r.display,
  title: r.title ?? '',
  body: r.body,
  linkUrl: r.link_url,
  linkLabel: r.link_label,
  active: r.active,
  startsAt: r.starts_at,
  expiresAt: r.expires_at,
  createdAt: r.created_at,
  platform: r.platform ?? 'all',
  belowVersion: r.below_version ?? null,
});

const ANNOUNCEMENT_BASE_COLUMNS = 'id, kind, display, title, body, link_url, link_label, active, starts_at, expires_at, created_at';
const ANNOUNCEMENT_COLUMNS = `${ANNOUNCEMENT_BASE_COLUMNS}, platform, below_version`;

const toPublic = (
  r: Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url'> & { bio?: string | null }
): PublicProfile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_url,
  ...(r.bio !== undefined ? { bio: r.bio } : {}),
});

const toEntry = (r: LibraryRow): LibraryEntry => ({
  mediaType: r.media_type,
  mediaId: r.media_id,
  status: r.status,
  progress: r.progress,
  score: r.score,
  media: r.media,
  updatedAt: r.updated_at,
});

const toActivity = (r: ActivityRow): Activity => ({
  userId: r.user_id,
  mediaId: r.media_id,
  title: r.title,
  coverUrl: r.cover_url,
  episode: r.episode,
  totalEpisodes: r.total_episodes,
  active: r.active,
  updatedAt: r.updated_at,
});

// ─── Errores ───────────────────────────────────────────────
interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

/** Traduce errores de GoTrue / PostgREST / Storage a códigos estables. */
export function mapError(err: unknown): BackendError {
  if (err instanceof BackendError) return err;
  const e = (err ?? {}) as ErrorLike;
  const msg = (e.message ?? '').toLowerCase();
  const code = e.code ?? '';

  const make = (c: BackendErrorCode) => new BackendError(c, e.message);

  // Red
  if (
    e.name === 'AuthRetryableFetchError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    e.status === 0
  ) {
    return make('network');
  }

  // GoTrue (auth)
  switch (code) {
    case 'invalid_credentials':
      return make('invalid_credentials');
    case 'email_not_confirmed':
      return make('email_not_confirmed');
    case 'user_already_exists':
    case 'email_exists':
      return make('email_taken');
    case 'weak_password':
      return make('weak_password');
    case 'email_address_invalid':
    case 'validation_failed':
      return make('invalid_email');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return make('rate_limited');
  }
  if (msg.includes('invalid login credentials')) return make('invalid_credentials');
  if (msg.includes('email not confirmed')) return make('email_not_confirmed');
  if (msg.includes('already registered')) return make('email_taken');
  if (msg.includes('password should be')) return make('weak_password');
  if (msg.includes('rate limit')) return make('rate_limited');
  if (msg.includes('jwt') || msg.includes('not authenticated') || code === '28000') {
    return make('not_authenticated');
  }

  // PostgREST / Postgres
  if (code === '23505') {
    if (msg.includes('already friends')) return make('already_friends');
    if (msg.includes('request already sent')) return make('request_exists');
    if (msg.includes('username')) return make('username_taken');
    return make('request_exists');
  }
  if (code === '23514') return make('invalid_username');
  if (code === '54000') return make(msg.includes('too many messages') ? 'too_many_messages' : 'too_many_requests');
  if (code === 'P0002') return make('not_found');
  // RLS / funciones de administración: hay sesión, pero sin permiso
  if (msg.includes('suspended')) return make('suspended');
  if (msg.includes('forbidden') || msg.includes('row-level security')) return make('forbidden');
  if (code === '42501') return make('not_authenticated');

  // Storage
  if (msg.includes('exceeded the maximum allowed size') || msg.includes('payload too large')) {
    return make('file_too_large');
  }
  if (msg.includes('mime type') && msg.includes('not supported')) return make('invalid_file');

  return make('unknown');
}

/** Lanza un BackendError si la respuesta de supabase trae `error`. */
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw mapError(res.error);
  return res.data;
}

export class SupabaseBackend implements AccountBackend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Los enlaces llegan por el protocolo kageview://, no por la URL de la ventana
        detectSessionInUrl: false,
        // PKCE: los tokens nunca viajan en la URL del enlace del correo
        flowType: 'pkce',
        storageKey: 'kageview-auth',
      },
    });
  }

  // ─── Utilidades ──────────────────────────────────────────
  private async requireUserId(): Promise<string> {
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw mapError(error);
    const id = data.session?.user.id;
    if (!id) throw new BackendError('not_authenticated');
    return id;
  }

  private static toAuthUser(session: Session | null): AuthUser | null {
    return session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
  }

  private async profilesById(ids: string[], withBio = false): Promise<Map<string, PublicProfile>> {
    const map = new Map<string, PublicProfile>();
    if (ids.length === 0) return map;
    const rows = check(
      await this.sb
        .from('profiles')
        .select(withBio ? 'id, username, display_name, avatar_url, bio' : 'id, username, display_name, avatar_url')
        .in('id', ids)
    ) as unknown as ProfileRow[];
    for (const r of rows) map.set(r.id, toPublic(r));
    return map;
  }

  // ─── Autenticación ───────────────────────────────────────
  async getSession(): Promise<AuthUser | null> {
    const { data, error } = await this.sb.auth.getSession();
    if (error) throw mapError(error);
    return SupabaseBackend.toAuthUser(data.session);
  }

  onAuthChange(cb: (event: AuthEvent, user: AuthUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      const user = SupabaseBackend.toAuthUser(session);
      switch (event) {
        case 'SIGNED_IN':
        case 'SIGNED_OUT':
        case 'PASSWORD_RECOVERY':
        case 'USER_UPDATED':
        case 'TOKEN_REFRESHED':
          cb(event, user);
          break;
        default:
          break; // INITIAL_SESSION lo cubre getSession()
      }
    });
    return () => data.subscription.unsubscribe();
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await this.sb.rpc('username_available', { candidate: username });
    if (error) throw mapError(error);
    return data === true;
  }

  async signUp(input: { email: string; password: string; username: string }) {
    const { data, error } = await this.sb.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        data: { username: input.username.trim().toLowerCase() },
        emailRedirectTo: AUTH_CALLBACK_URL,
      },
    });
    if (error) throw mapError(error);
    // Con "Confirm email" activado Supabase devuelve usuario SIN sesión.
    // Si el correo ya existe, devuelve un usuario "ofuscado" con identities vacío.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new BackendError('email_taken');
    }
    return { needsEmailConfirmation: !data.session };
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw mapError(error);
  }

  async signOut(): Promise<void> {
    const { error } = await this.sb.auth.signOut();
    if (error) throw mapError(error);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: AUTH_CALLBACK_URL,
    });
    if (error) throw mapError(error);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) throw mapError(error);
  }

  async handleAuthCallbackUrl(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BackendError('unknown', 'Enlace inválido');
    }
    const query = parsed.searchParams;
    const hash = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);

    // Supabase devuelve los errores (p. ej. enlace caducado) en query o fragmento
    const errDesc = query.get('error_description') ?? hash.get('error_description');
    if (errDesc) throw mapError({ message: errDesc, code: query.get('error_code') ?? hash.get('error_code') ?? '' });

    // PKCE: ?code=…
    const code = query.get('code');
    if (code) {
      const { error } = await this.sb.auth.exchangeCodeForSession(code);
      if (error) throw mapError(error);
      return;
    }
    // Solo se acepta PKCE (?code=…), que solo canjea el código si coincide con el
    // verificador guardado por ESTA app. NO se admiten tokens en el fragmento
    // (#access_token=…): un enlace malicioso podría abrir la sesión de otra
    // cuenta (la del atacante) dentro de la app de la víctima.
    throw new BackendError('unknown', 'El enlace no contiene una sesión válida');
  }

  async deleteAccount(): Promise<void> {
    check(await this.sb.rpc('delete_my_account'));
    // La sesión local ya no es válida: limpiarla sin llamar al servidor
    await this.sb.auth.signOut({ scope: 'local' });
  }

  // ─── Perfil ──────────────────────────────────────────────
  async getMyProfile(): Promise<Profile | null> {
    const uid = await this.requireUserId();
    const row = check(
      await this.sb.from('profiles').select('*').eq('id', uid).maybeSingle()
    ) as ProfileRow | null;
    return row ? toProfile(row) : null;
  }

  async updateMyProfile(patch: ProfilePatch): Promise<Profile> {
    const uid = await this.requireUserId();
    const update: Record<string, unknown> = {};
    if (patch.username !== undefined) update.username = patch.username.trim().toLowerCase();
    if (patch.displayName !== undefined) update.display_name = patch.displayName?.trim() || null;
    if (patch.bio !== undefined) update.bio = patch.bio?.trim() || null;
    if (patch.showActivity !== undefined) update.show_activity = patch.showActivity;
    if (patch.showLibrary !== undefined) update.show_library = patch.showLibrary;

    const row = check(
      await this.sb.from('profiles').update(update).eq('id', uid).select('*').single()
    ) as ProfileRow;
    return toProfile(row);
  }

  async uploadAvatar(image: Blob): Promise<Profile> {
    const uid = await this.requireUserId();
    if (!AVATAR_TYPES.includes(image.type)) throw new BackendError('invalid_file');
    if (image.size > MAX_AVATAR_BYTES) throw new BackendError('file_too_large');

    const path = `${uid}/avatar.webp`;
    const up = await this.sb.storage.from('avatars').upload(path, image, {
      upsert: true,
      contentType: image.type,
      cacheControl: '3600',
    });
    if (up.error) throw mapError(up.error);

    // ?v= evita que el navegador enseñe la foto anterior (misma ruta)
    const url = `${this.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const row = check(
      await this.sb.from('profiles').update({ avatar_url: url }).eq('id', uid).select('*').single()
    ) as ProfileRow;
    return toProfile(row);
  }

  async removeAvatar(): Promise<Profile> {
    const uid = await this.requireUserId();
    // Best-effort: si el fichero ya no existe no es un error
    await this.sb.storage.from('avatars').remove([`${uid}/avatar.webp`]);
    const row = check(
      await this.sb.from('profiles').update({ avatar_url: null }).eq('id', uid).select('*').single()
    ) as ProfileRow;
    return toProfile(row);
  }

  // ─── Listas ──────────────────────────────────────────────
  async listLibrary(mediaType: MediaType, userId?: string): Promise<LibraryEntry[]> {
    // IMPORTANTE: filtrar SIEMPRE por user_id. RLS también deja pasar las filas
    // de mis amigos, así que sin este filtro "mi lista" mezclaría las suyas.
    const uid = userId ?? (await this.requireUserId());
    const rows = check(
      await this.sb
        .from('library_entries')
        .select('*')
        .eq('user_id', uid)
        .eq('media_type', mediaType)
        .order('updated_at', { ascending: false })
    ) as LibraryRow[];
    return rows.map(toEntry);
  }

  async upsertLibraryEntry(entry: LibraryUpsert): Promise<LibraryEntry> {
    const uid = await this.requireUserId();
    const row = check(
      await this.sb
        .from('library_entries')
        .upsert(
          {
            user_id: uid,
            media_type: entry.mediaType,
            media_id: entry.mediaId,
            status: entry.status,
            ...(entry.progress !== undefined ? { progress: entry.progress } : {}),
            ...(entry.score !== undefined ? { score: entry.score } : {}),
            media: entry.media,
          },
          { onConflict: 'user_id,media_type,media_id' }
        )
        .select('*')
        .single()
    ) as LibraryRow;
    return toEntry(row);
  }

  async removeLibraryEntry(mediaType: MediaType, mediaId: number): Promise<void> {
    const uid = await this.requireUserId();
    check(
      await this.sb
        .from('library_entries')
        .delete()
        .eq('user_id', uid)
        .eq('media_type', mediaType)
        .eq('media_id', mediaId)
    );
  }

  // ─── Amigos ──────────────────────────────────────────────
  async listFriends(): Promise<Friend[]> {
    const uid = await this.requireUserId();
    const rows = check(
      await this.sb.from('friendships').select('*').eq('status', 'accepted')
    ) as FriendshipRow[];
    const otherIds = rows.map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
    const profiles = await this.profilesById(otherIds, true); // amigos: con bio
    return rows
      .map((r, i): Friend | null => {
        const profile = profiles.get(otherIds[i]);
        return profile
          ? { friendshipId: r.id, profile, since: r.responded_at ?? r.created_at }
          : null;
      })
      .filter((f): f is Friend => f !== null)
      .sort((a, b) => a.profile.username.localeCompare(b.profile.username));
  }

  async listFriendRequests(): Promise<FriendRequest[]> {
    const uid = await this.requireUserId();
    const rows = check(
      await this.sb
        .from('friendships')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ) as FriendshipRow[];
    const otherIds = rows.map((r) => (r.requester_id === uid ? r.addressee_id : r.requester_id));
    const profiles = await this.profilesById(otherIds);
    return rows
      .map((r, i): FriendRequest | null => {
        const profile = profiles.get(otherIds[i]);
        return profile
          ? {
              id: r.id,
              direction: r.addressee_id === uid ? 'incoming' : 'outgoing',
              profile,
              createdAt: r.created_at,
            }
          : null;
      })
      .filter((r): r is FriendRequest => r !== null);
  }

  async searchUsers(query: string): Promise<PublicProfile[]> {
    const q = query.trim();
    if (q.length < 3) return [];
    const rows = check(await this.sb.rpc('search_profiles', { q })) as ProfileRow[];
    return rows.map(toPublic);
  }

  async sendFriendRequest(userId: string): Promise<'sent' | 'accepted'> {
    const res = check(await this.sb.rpc('send_friend_request', { target: userId }));
    return res === 'accepted' ? 'accepted' : 'sent';
  }

  async respondToFriendRequest(requestId: number, accept: boolean): Promise<void> {
    check(await this.sb.rpc('respond_friend_request', { request_id: requestId, accept }));
  }

  async removeFriend(friendshipId: number): Promise<void> {
    // Sirve tanto para eliminar un amigo como para cancelar una solicitud enviada
    check(await this.sb.from('friendships').delete().eq('id', friendshipId));
  }

  // ─── Actividad ───────────────────────────────────────────
  async setActivity(a: ActivityInput): Promise<void> {
    const uid = await this.requireUserId();
    check(
      await this.sb.from('activity').upsert(
        {
          user_id: uid,
          media_id: a.mediaId,
          title: a.title.slice(0, 200),
          cover_url: a.coverUrl ? a.coverUrl.slice(0, 500) : null,
          episode: Math.max(0, Math.floor(a.episode)),
          total_episodes: a.totalEpisodes,
          active: true,
        },
        { onConflict: 'user_id' }
      )
    );
  }

  async clearActivity(): Promise<void> {
    const uid = await this.requireUserId();
    // Se marca como inactiva en vez de borrar: Realtime no emite DELETE bajo RLS
    check(await this.sb.from('activity').update({ active: false }).eq('user_id', uid));
  }

  async listFriendsActivity(): Promise<FriendActivity[]> {
    const uid = await this.requireUserId();
    const rows = check(
      await this.sb
        .from('activity')
        .select('*')
        .neq('user_id', uid) // RLS ya limita a amigos con actividad visible
        .order('updated_at', { ascending: false })
    ) as ActivityRow[];
    const profiles = await this.profilesById(rows.map((r) => r.user_id));
    return rows
      .map((r): FriendActivity | null => {
        const profile = profiles.get(r.user_id);
        return profile ? { ...toActivity(r), profile } : null;
      })
      .filter((a): a is FriendActivity => a !== null);
  }

  // ─── Chat ────────────────────────────────────────────────
  async listMessages(friendId: string, opts: { before?: MessageCursor; limit?: number } = {}): Promise<ChatMessage[]> {
    const me = await this.requireUserId();
    // El id va dentro de un filtro de PostgREST: se valida para que no pueda colar sintaxis
    if (!UUID_RE.test(friendId)) throw new BackendError('not_found');
    const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
    // Los dos sentidos de la conversación. Con cursor, cada sentido se combina con
    // (created_at < X) OR (created_at = X AND id < ID) en un único filtro `or`
    // (evita depender de cómo combine PostgREST varios `or`).
    const pairs: Array<[string, string]> = [[me, friendId], [friendId, me]];
    const c = opts.before;
    if (c && (!Number.isInteger(c.id) || Number.isNaN(Date.parse(c.createdAt)))) throw new BackendError('unknown');
    const conditions = pairs.flatMap(([from, to]) => {
      const base = `sender_id.eq.${from},recipient_id.eq.${to}`;
      return c
        ? [`and(${base},created_at.lt."${c.createdAt}")`, `and(${base},created_at.eq."${c.createdAt}",id.lt.${c.id})`]
        : [`and(${base})`];
    });
    const q = this.sb
      .from('messages')
      .select('*')
      .or(conditions.join(','))
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    const rows = check(await q) as MessageRow[];
    return rows.map(toMessage).reverse(); // cronológico
  }

  async sendMessage(friendId: string, input: SendMessageInput): Promise<ChatMessage> {
    await this.requireUserId();
    const kind: MessageKind = input.kind ?? 'text';
    const body = (input.body ?? '').slice(0, 2000);
    const res = await this.sb
      .from('messages')
      .insert({ recipient_id: friendId, kind, body, payload: input.media ?? null })
      .select('*')
      .single();
    if (res.error) {
      // 42501 al insertar = la política exige amistad aceptada
      if ((res.error as ErrorLike).code === '42501') throw new BackendError('not_friends');
      throw mapError(res.error);
    }
    return toMessage(res.data as MessageRow);
  }

  async markConversationRead(friendId: string): Promise<number> {
    const n = check(await this.sb.rpc('mark_conversation_read', { friend: friendId }));
    return typeof n === 'number' ? n : 0;
  }

  async deleteMessage(id: number): Promise<void> {
    check(await this.sb.rpc('delete_message', { message_id: id }));
  }

  async getChatSummary(): Promise<ChatSummaryItem[]> {
    const rows = check(await this.sb.rpc('chat_summary')) as ChatSummaryRow[] | null;
    return (rows ?? []).map((r) => ({
      friendId: r.friend_id,
      last: {
        id: r.last_message_id,
        kind: r.last_kind,
        body: r.last_body ?? '',
        senderId: r.last_sender,
        createdAt: r.last_at,
        deleted: r.last_deleted,
      },
      unread: Number(r.unread) || 0,
    }));
  }

  subscribeMessages(cb: (message: ChatMessage) => void): () => void {
    const channel = this.sb
      .channel(`kageview-chat-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as Partial<MessageRow> | undefined;
        // DELETE no llega bajo RLS (el borrado es suave = UPDATE); ignorar payloads incompletos
        if (row && typeof row.id === 'number' && row.sender_id && row.recipient_id) {
          cb(toMessage(row as MessageRow));
        }
      })
      .subscribe();
    return () => {
      void this.sb.removeChannel(channel);
    };
  }

  subscribeSocial(cb: () => void): () => void {
    // Varios eventos seguidos (p. ej. latidos) se agrupan en un solo refresco
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        cb();
      }, 400);
    };
    const channel = this.sb
      .channel(`kageview-social-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, fire)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, fire)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void this.sb.removeChannel(channel);
    };
  }

  // ─── Configuración pública ───────────────────────────────
  /** Base de datos sin la migración 0005 (columnas `platform`/`below_version` ausentes). */
  private legacyAnnouncements = false;

  private get announcementColumns(): string {
    return this.legacyAnnouncements ? ANNOUNCEMENT_BASE_COLUMNS : ANNOUNCEMENT_COLUMNS;
  }

  /** Ejecuta la consulta con las columnas nuevas y, si el esquema es antiguo, reintenta sin ellas. */
  private async queryAnnouncements(
    build: (columns: string) => PromiseLike<{ data: unknown; error: unknown }>
  ): Promise<Announcement[]> {
    let res = await build(this.announcementColumns);
    if (res.error && (res.error as { code?: string }).code === '42703' && !this.legacyAnnouncements) {
      this.legacyAnnouncements = true;
      res = await build(this.announcementColumns);
    }
    return (check(res as { data: unknown; error: unknown }) as AnnouncementRow[]).map(toAnnouncement);
  }

  async listActiveAnnouncements(): Promise<Announcement[]> {
    // Para el público RLS ya solo deja ver los vigentes, pero el staff ve TODOS
    // (borradores, programados…): se filtra también aquí para que a ellos no se
    // les muestren como si estuvieran publicados.
    const now = new Date().toISOString();
    return this.queryAnnouncements((cols) =>
      this.sb
        .from('announcements')
        .select(cols)
        .eq('active', true)
        .lte('starts_at', now)
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false })
        .limit(20)
    );
  }

  async listProviderSwitches(): Promise<ProviderSwitch[]> {
    const rows = check(
      await this.sb.from('provider_switches').select('provider_id, reason, updated_at')
    ) as unknown as Array<{ provider_id: string; reason: string; updated_at: string }>;
    return rows.map((r) => ({ providerId: r.provider_id, reason: r.reason, updatedAt: r.updated_at }));
  }

  // ─── Administración ──────────────────────────────────────
  /**
   * Las operaciones de administración devuelven "permission denied" (42501) cuando
   * falta un permiso, y mapError lo traduce a `not_authenticated` (correcto para
   * un usuario anónimo). Con sesión iniciada eso sería engañoso ("sesión
   * caducada"), así que aquí se convierte en `forbidden`.
   */
  private async admin<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BackendError && err.code === 'not_authenticated') {
        const { data } = await this.sb.auth.getSession();
        if (data.session) throw new BackendError('forbidden', err.message);
      }
      throw err;
    }
  }

  async adminListAnnouncements(): Promise<Announcement[]> {
    return this.admin(() =>
      this.queryAnnouncements((cols) =>
        this.sb.from('announcements').select(cols).order('created_at', { ascending: false }).limit(100)
      )
    );
  }

  async adminSaveAnnouncement(input: AnnouncementInput, id?: number): Promise<Announcement> {
    const values: Record<string, unknown> = {
      kind: input.kind,
      display: input.display,
      title: input.title.trim(),
      body: input.body.trim(),
      link_url: input.linkUrl?.trim() || null,
      link_label: input.linkUrl?.trim() ? input.linkLabel?.trim() || null : null,
      active: input.active ?? true,
      starts_at: input.startsAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
    };
    // Con esquema antiguo estas columnas no existen: no enviarlas (y avisar si se pedían)
    const wantsTargeting = (input.platform && input.platform !== 'all') || !!input.belowVersion;
    if (!this.legacyAnnouncements) {
      values.platform = input.platform ?? 'all';
      values.below_version = input.belowVersion ?? null;
    } else if (wantsTargeting) {
      throw new BackendError('unknown', 'La base de datos no tiene aplicada la migración 0005.');
    }

    return this.admin(async () => {
      const run = async (cols: string) =>
        id === undefined
          ? this.sb.from('announcements').insert(values).select(cols).single()
          : // Sin permiso, RLS no da error: simplemente no actualiza ninguna fila
            this.sb.from('announcements').update(values).eq('id', id).select(cols).maybeSingle();

      const res = await run(this.announcementColumns);
      const row = check(res as { data: unknown; error: unknown }) as AnnouncementRow | null;
      if (!row) throw new BackendError('forbidden');
      return toAnnouncement(row);
    });
  }

  async adminDeleteAnnouncement(id: number): Promise<void> {
    await this.admin(async () => {
      const rows = check(await this.sb.from('announcements').delete().eq('id', id).select('id')) as unknown as unknown[];
      if (rows.length === 0) throw new BackendError('forbidden');
    });
  }

  async adminSetProviderSwitch(providerId: string, reason: string | null): Promise<void> {
    await this.admin(async () => {
      if (reason === null) {
        // Reactivar: borrar la fila (idempotente; sin permiso RLS tampoco borra nada)
        const existing = check(
          await this.sb.from('provider_switches').select('provider_id').eq('provider_id', providerId)
        ) as unknown as unknown[];
        const rows = check(
          await this.sb.from('provider_switches').delete().eq('provider_id', providerId).select('provider_id')
        ) as unknown as unknown[];
        if (rows.length === 0 && existing.length > 0) throw new BackendError('forbidden');
        return;
      }
      const clean = reason.trim().slice(0, 200);
      // NO usar upsert: PostgREST hace ON CONFLICT DO UPDATE de todas las columnas
      // enviadas, incluida la clave, y el staff solo tiene UPDATE sobre `reason`.
      const updated = check(
        await this.sb.from('provider_switches').update({ reason: clean }).eq('provider_id', providerId).select('provider_id')
      ) as unknown as unknown[];
      if (updated.length === 0) {
        check(await this.sb.from('provider_switches').insert({ provider_id: providerId, reason: clean }));
      }
    });
  }

  async adminStats(): Promise<AdminStats> {
    return this.admin(async () => {
      const rows = check(await this.sb.rpc('admin_stats')) as unknown as Array<{
        users_total: number | string;
        users_7d: number | string;
        watching_now: number | string;
        announcements_live: number | string;
      }>;
      const r = rows[0];
      return {
        usersTotal: Number(r?.users_total) || 0,
        usersLast7Days: Number(r?.users_7d) || 0,
        watchingNow: Number(r?.watching_now) || 0,
        announcementsLive: Number(r?.announcements_live) || 0,
      };
    });
  }

  async adminListStaff(): Promise<StaffMember[]> {
    return this.admin(async () => {
      const rows = check(await this.sb.rpc('list_staff')) as unknown as Array<
        Pick<ProfileRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'role'>
      >;
      return rows.map((r) => ({ profile: toPublic(r), role: r.role }));
    });
  }

  async adminSetRole(userId: string, role: 'user' | 'admin'): Promise<void> {
    if (!UUID_RE.test(userId)) throw new BackendError('not_found');
    await this.admin(async () => {
      check(await this.sb.rpc('set_user_role', { target: userId, new_role: role }));
    });
  }

  async adminListUsers(opts: { query?: string; limit?: number; offset?: number } = {}): Promise<AdminUserPage> {
    return this.admin(async () => {
      const rows = check(
        await this.sb.rpc('admin_list_users', {
          q: (opts.query ?? '').slice(0, 40),
          lim: opts.limit ?? 25,
          off: opts.offset ?? 0,
        })
      ) as unknown as Array<{
        id: string; username: string; display_name: string | null; avatar_url: string | null;
        role: AppRole; created_at: string; last_active: string | null;
        suspended: boolean; suspended_reason: string | null; total: number | string;
      }>;
      const users: AdminUser[] = rows.map((r) => ({
        profile: toPublic(r),
        role: r.role,
        createdAt: r.created_at,
        lastActive: r.last_active,
        suspended: r.suspended,
        suspendedReason: r.suspended_reason,
      }));
      return { users, total: rows.length ? Number(rows[0].total) || 0 : 0 };
    });
  }

  async adminSetSuspended(userId: string, suspended: boolean, reason = ''): Promise<void> {
    if (!UUID_RE.test(userId)) throw new BackendError('not_found');
    await this.admin(async () => {
      check(await this.sb.rpc('admin_set_suspended', { target: userId, suspend: suspended, why: reason }));
    });
  }

  async adminAuditLog(opts: { before?: number; limit?: number } = {}): Promise<AuditEntry[]> {
    return this.admin(async () => {
      let q = this.sb
        .from('admin_audit')
        .select('id, actor_name, action, target, detail, created_at')
        .order('id', { ascending: false })
        .limit(Math.min(opts.limit ?? 30, 100));
      if (opts.before !== undefined) q = q.lt('id', opts.before);
      const rows = check(await q) as unknown as Array<{
        id: number; actor_name: string; action: string; target: string | null;
        detail: Record<string, unknown> | null; created_at: string;
      }>;
      return rows.map((r) => ({
        id: r.id, actor: r.actor_name, action: r.action, target: r.target,
        detail: r.detail ?? {}, createdAt: r.created_at,
      }));
    });
  }

  async adminSignups(days = 30): Promise<SignupPoint[]> {
    return this.admin(async () => {
      const rows = check(await this.sb.rpc('admin_signups', { days })) as unknown as Array<{ day: string; n: number | string }>;
      return rows.map((r) => ({ day: r.day, count: Number(r.n) || 0 }));
    });
  }
}
