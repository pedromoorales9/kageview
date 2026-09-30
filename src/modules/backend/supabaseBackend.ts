// ═══════════════════════════════════════════════════════════
// SupabaseBackend — implementación real de AccountBackend
//
// Solo usa la anon key + el JWT del usuario: toda la autorización la hacen
// las políticas RLS de supabase/migrations (probadas en supabase/tests).
// ═══════════════════════════════════════════════════════════

import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import {
  AccountBackend,
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
  created_at: string;
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
  createdAt: r.created_at,
});

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
}
