// ═══════════════════════════════════════════════════════════
// MockBackend — AccountBackend en memoria (SOLO desarrollo/pruebas de UI)
//
// Se activa con KAGEVIEW_BACKEND=mock. Persiste en localStorage para que la
// sesión y los datos sobrevivan a recargas. Trae usuarios de ejemplo (mika,
// ren, sora) para poder probar amigos, solicitudes y "viendo ahora" sin un
// proyecto de Supabase. No valida nada de seguridad: no usar en producción.
// ═══════════════════════════════════════════════════════════

import {
  AccountBackend,
  AdminStats,
  Announcement,
  AnnouncementInput,
  AppRole,
  ProviderSwitch,
  StaffMember,
  isStaff,
  Activity,
  ActivityInput,
  AuthEvent,
  AuthUser,
  BackendError,
  ChatMessage,
  ChatSummaryItem,
  Friend,
  MessageCursor,
  FriendActivity,
  FriendRequest,
  LibraryEntry,
  LibraryUpsert,
  MediaType,
  Profile,
  ProfilePatch,
  PublicProfile,
  SendMessageInput,
} from './types';

const STORAGE_KEY = 'kageview-mock-db-v1';
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

interface MockUser {
  id: string;
  email: string;
  password: string;
  profile: Profile;
}
interface MockFriendship {
  id: number;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
  respondedAt: string | null;
}
interface MockDb {
  users: MockUser[];
  library: Array<LibraryEntry & { userId: string }>;
  friendships: MockFriendship[];
  activity: Activity[];
  sessionUserId: string | null;
  nextFriendshipId: number;
  messages: ChatMessage[];
  nextMessageId: number;
  announcements: Announcement[];
  nextAnnouncementId: number;
  switches: ProviderSwitch[];
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function seedProfile(id: string, username: string, displayName: string, bio: string, role: AppRole = 'user'): Profile {
  return {
    id,
    role,
    username,
    displayName,
    avatarUrl: null,
    bio,
    showActivity: true,
    showLibrary: true,
    createdAt: ago(60 * 24 * 90),
  };
}

function snapshot(id: number, romaji: string, cover: string, episodes: number) {
  return {
    id,
    title: { romaji, english: romaji },
    coverImage: { large: cover, extraLarge: cover },
    episodes,
    genres: [] as string[],
  };
}

function seed(): MockDb {
  const users: MockUser[] = [
    { id: 'seed-kage', email: 'kage@demo.dev', password: 'demo1234', profile: seedProfile('seed-kage', 'kage', 'Kage', 'Dueño de KageView 🌙', 'owner') },
    { id: 'seed-mika', email: 'mika@demo.dev', password: 'demo1234', profile: seedProfile('seed-mika', 'mika', 'Mika', 'Maratones de fin de semana 🍜') },
    { id: 'seed-ren', email: 'ren@demo.dev', password: 'demo1234', profile: seedProfile('seed-ren', 'ren_k', 'Ren', 'Shonen y café.') },
    { id: 'seed-sora', email: 'sora@demo.dev', password: 'demo1234', profile: seedProfile('seed-sora', 'sora', 'Sora', '', 'admin') },
  ];
  return {
    users,
    library: [],
    friendships: [],
    activity: [
      { userId: 'seed-mika', mediaId: 154587, title: 'Sousou no Frieren', coverUrl: null, episode: 7, totalEpisodes: 28, active: true, updatedAt: ago(0) },
      { userId: 'seed-ren', mediaId: 21, title: 'ONE PIECE', coverUrl: null, episode: 1088, totalEpisodes: null, active: false, updatedAt: ago(95) },
    ],
    sessionUserId: null,
    nextFriendshipId: 1,
    messages: [],
    nextMessageId: 1,
    announcements: [
      {
        id: 1, kind: 'update', display: 'banner', title: 'Novedades de la 1.3',
        body: 'Ya puedes crear tu cuenta, añadir amigos y chatear con ellos desde la pestaña Amigos.',
        linkUrl: null, linkLabel: null, active: true,
        startsAt: ago(60 * 24), expiresAt: null, createdAt: ago(60 * 24),
      },
    ],
    nextAnnouncementId: 2,
    switches: [],
  };
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      // datos guardados por versiones anteriores del mock
      db.messages ??= [];
      db.nextMessageId ??= 1;
      const fresh = seed();
      db.announcements ??= fresh.announcements;
      db.nextAnnouncementId ??= fresh.nextAnnouncementId;
      db.switches ??= [];
      // usuarios de ejemplo añadidos después (p. ej. el owner) y roles antiguos
      for (const su of fresh.users) if (!db.users.some((u) => u.id === su.id)) db.users.push(su);
      for (const u of db.users) u.profile.role ??= u.id === 'seed-kage' ? 'owner' : u.id === 'seed-sora' ? 'admin' : 'user';
      return db;
    }
  } catch {
    /* estado corrupto → se re-siembra */
  }
  return seed();
}

export class MockBackend implements AccountBackend {
  readonly kind = 'mock' as const;
  private db: MockDb = load();
  private authListeners = new Set<(e: AuthEvent, u: AuthUser | null) => void>();
  private socialListeners = new Set<() => void>();
  private messageListeners = new Set<(m: ChatMessage) => void>();

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      /* cuota / modo privado: seguimos en memoria */
    }
  }
  private emitAuth(e: AuthEvent) {
    const u = this.authUser();
    this.authListeners.forEach((cb) => cb(e, u));
  }
  private emitSocial() {
    this.socialListeners.forEach((cb) => cb());
  }
  private me(): MockUser {
    const u = this.db.users.find((x) => x.id === this.db.sessionUserId);
    if (!u) throw new BackendError('not_authenticated');
    return u;
  }
  private authUser(): AuthUser | null {
    const u = this.db.users.find((x) => x.id === this.db.sessionUserId);
    return u ? { id: u.id, email: u.email } : null;
  }
  private pub(id: string, withBio = false): PublicProfile {
    const p = this.db.users.find((u) => u.id === id)!.profile;
    return {
      id: p.id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl,
      ...(withBio ? { bio: p.bio } : {}),
    };
  }
  private emitMessage(m: ChatMessage) {
    const me = this.db.sessionUserId;
    if (m.senderId === me || m.recipientId === me) this.messageListeners.forEach((cb) => cb({ ...m }));
  }
  private areFriends(a: string, b: string) {
    return this.db.friendships.some(
      (f) => f.status === 'accepted' && ((f.requesterId === a && f.addresseeId === b) || (f.requesterId === b && f.addresseeId === a))
    );
  }

  // ─── Autenticación ───────────────────────────────────────
  async getSession() {
    return this.authUser();
  }
  onAuthChange(cb: (e: AuthEvent, u: AuthUser | null) => void) {
    this.authListeners.add(cb);
    return () => void this.authListeners.delete(cb);
  }
  async isUsernameAvailable(username: string) {
    const u = username.toLowerCase();
    return USERNAME_RE.test(u) && !this.db.users.some((x) => x.profile.username === u);
  }
  async signUp(input: { email: string; password: string; username: string }) {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new BackendError('invalid_email');
    if (input.password.length < 6) throw new BackendError('weak_password');
    if (!USERNAME_RE.test(username)) throw new BackendError('invalid_username');
    if (this.db.users.some((u) => u.email === email)) throw new BackendError('email_taken');
    if (this.db.users.some((u) => u.profile.username === username)) throw new BackendError('username_taken');

    const id = `mock-${Math.random().toString(36).slice(2, 10)}`;
    const profile: Profile = {
      id, username, displayName: null, avatarUrl: null, bio: null,
      showActivity: true, showLibrary: true, role: 'user', createdAt: new Date().toISOString(),
    };
    this.db.users.push({ id, email, password: input.password, profile });
    // Para poder probar el módulo social: mika ya es amiga y sora te ha escrito
    const now = new Date().toISOString();
    this.db.friendships.push(
      { id: this.db.nextFriendshipId++, requesterId: 'seed-mika', addresseeId: id, status: 'accepted', createdAt: now, respondedAt: now },
      { id: this.db.nextFriendshipId++, requesterId: 'seed-sora', addresseeId: id, status: 'pending', createdAt: now, respondedAt: null }
    );
    this.db.messages.push({
      id: this.db.nextMessageId++, senderId: 'seed-mika', recipientId: id, kind: 'text',
      body: '¡Hola! ¿Has visto Frieren? Te va a encantar 🍜', media: null,
      createdAt: now, readAt: null, deleted: false,
    });
    this.db.sessionUserId = id;
    this.save();
    this.emitAuth('SIGNED_IN');
    return { needsEmailConfirmation: false };
  }
  async signIn(email: string, password: string) {
    const u = this.db.users.find((x) => x.email === email.trim().toLowerCase());
    if (!u || u.password !== password) throw new BackendError('invalid_credentials');
    this.db.sessionUserId = u.id;
    this.save();
    this.emitAuth('SIGNED_IN');
  }
  async signOut() {
    this.db.sessionUserId = null;
    this.save();
    this.emitAuth('SIGNED_OUT');
  }
  async requestPasswordReset() {
    /* el mock no envía correos */
  }
  async updatePassword(newPassword: string) {
    if (newPassword.length < 6) throw new BackendError('weak_password');
    this.me().password = newPassword;
    this.save();
  }
  async handleAuthCallbackUrl() {
    throw new BackendError('unknown', 'El backend de prueba no usa enlaces de correo');
  }
  async deleteAccount() {
    const id = this.me().id;
    this.db.users = this.db.users.filter((u) => u.id !== id);
    this.db.library = this.db.library.filter((l) => l.userId !== id);
    this.db.friendships = this.db.friendships.filter((f) => f.requesterId !== id && f.addresseeId !== id);
    this.db.activity = this.db.activity.filter((a) => a.userId !== id);
    this.db.messages = this.db.messages.filter((m) => m.senderId !== id && m.recipientId !== id);
    this.db.sessionUserId = null;
    this.save();
    this.emitAuth('SIGNED_OUT');
  }

  // ─── Perfil ──────────────────────────────────────────────
  async getMyProfile() {
    return { ...this.me().profile };
  }
  async updateMyProfile(patch: ProfilePatch) {
    const me = this.me();
    if (patch.username !== undefined) {
      const u = patch.username.trim().toLowerCase();
      if (!USERNAME_RE.test(u)) throw new BackendError('invalid_username');
      if (this.db.users.some((x) => x.id !== me.id && x.profile.username === u)) throw new BackendError('username_taken');
      me.profile.username = u;
    }
    if (patch.displayName !== undefined) me.profile.displayName = patch.displayName?.trim().slice(0, 40) || null;
    if (patch.bio !== undefined) me.profile.bio = patch.bio?.trim().slice(0, 200) || null;
    if (patch.showActivity !== undefined) me.profile.showActivity = patch.showActivity;
    if (patch.showLibrary !== undefined) me.profile.showLibrary = patch.showLibrary;
    this.save();
    this.emitAuth('USER_UPDATED');
    return { ...me.profile };
  }
  async uploadAvatar(image: Blob) {
    const me = this.me();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) throw new BackendError('invalid_file');
    if (image.size > 512 * 1024) throw new BackendError('file_too_large');
    me.profile.avatarUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new BackendError('invalid_file'));
      r.readAsDataURL(image);
    });
    this.save();
    return { ...me.profile };
  }
  async removeAvatar() {
    const me = this.me();
    me.profile.avatarUrl = null;
    this.save();
    return { ...me.profile };
  }

  // ─── Listas ──────────────────────────────────────────────
  async listLibrary(mediaType: MediaType, userId?: string) {
    const me = this.me();
    const owner = userId ?? me.id;
    if (owner !== me.id) {
      const p = this.db.users.find((u) => u.id === owner)?.profile;
      if (!p || !p.showLibrary || !this.areFriends(me.id, owner)) return [];
    }
    return this.db.library
      .filter((l) => l.userId === owner && l.mediaType === mediaType)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ userId: _u, ...entry }) => entry);
  }
  async upsertLibraryEntry(entry: LibraryUpsert) {
    const me = this.me();
    let row = this.db.library.find(
      (l) => l.userId === me.id && l.mediaType === entry.mediaType && l.mediaId === entry.mediaId
    );
    if (!row) {
      row = {
        userId: me.id, mediaType: entry.mediaType, mediaId: entry.mediaId, status: entry.status,
        progress: 0, score: 0, media: entry.media, updatedAt: '',
      };
      this.db.library.push(row);
    }
    row.status = entry.status;
    if (entry.progress !== undefined) row.progress = entry.progress;
    if (entry.score !== undefined) row.score = entry.score;
    row.media = entry.media;
    row.updatedAt = new Date().toISOString();
    this.save();
    const { userId: _u, ...out } = row;
    return out;
  }
  async removeLibraryEntry(mediaType: MediaType, mediaId: number) {
    const me = this.me();
    this.db.library = this.db.library.filter(
      (l) => !(l.userId === me.id && l.mediaType === mediaType && l.mediaId === mediaId)
    );
    this.save();
  }

  // ─── Amigos ──────────────────────────────────────────────
  async listFriends(): Promise<Friend[]> {
    const me = this.me();
    return this.db.friendships
      .filter((f) => f.status === 'accepted' && (f.requesterId === me.id || f.addresseeId === me.id))
      .map((f) => ({
        friendshipId: f.id,
        profile: this.pub(f.requesterId === me.id ? f.addresseeId : f.requesterId, true),
        since: f.respondedAt ?? f.createdAt,
      }))
      .sort((a, b) => a.profile.username.localeCompare(b.profile.username));
  }
  async listFriendRequests(): Promise<FriendRequest[]> {
    const me = this.me();
    return this.db.friendships
      .filter((f) => f.status === 'pending' && (f.requesterId === me.id || f.addresseeId === me.id))
      .map((f) => ({
        id: f.id,
        direction: f.addresseeId === me.id ? ('incoming' as const) : ('outgoing' as const),
        profile: this.pub(f.requesterId === me.id ? f.addresseeId : f.requesterId),
        createdAt: f.createdAt,
      }));
  }
  async searchUsers(query: string) {
    const me = this.me();
    const q = query.trim().toLowerCase();
    if (q.length < 3) return [];
    return this.db.users
      .filter((u) => u.id !== me.id && u.profile.username.startsWith(q))
      .slice(0, 10)
      .map((u) => this.pub(u.id));
  }
  async sendFriendRequest(userId: string): Promise<'sent' | 'accepted'> {
    const me = this.me();
    if (userId === me.id) throw new BackendError('unknown', 'invalid target');
    if (!this.db.users.some((u) => u.id === userId)) throw new BackendError('not_found');
    const existing = this.db.friendships.find(
      (f) => (f.requesterId === me.id && f.addresseeId === userId) || (f.requesterId === userId && f.addresseeId === me.id)
    );
    if (existing) {
      if (existing.status === 'accepted') throw new BackendError('already_friends');
      if (existing.requesterId === me.id) throw new BackendError('request_exists');
      existing.status = 'accepted';
      existing.respondedAt = new Date().toISOString();
      this.save();
      this.emitSocial();
      return 'accepted';
    }
    const now = new Date().toISOString();
    this.db.friendships.push({
      id: this.db.nextFriendshipId++, requesterId: me.id, addresseeId: userId,
      status: 'pending', createdAt: now, respondedAt: null,
    });
    this.save();
    this.emitSocial();
    return 'sent';
  }
  async respondToFriendRequest(requestId: number, accept: boolean) {
    const me = this.me();
    const f = this.db.friendships.find((x) => x.id === requestId && x.addresseeId === me.id && x.status === 'pending');
    if (!f) throw new BackendError('not_found');
    if (accept) {
      f.status = 'accepted';
      f.respondedAt = new Date().toISOString();
    } else {
      this.db.friendships = this.db.friendships.filter((x) => x.id !== requestId);
    }
    this.save();
    this.emitSocial();
  }
  async removeFriend(friendshipId: number) {
    const me = this.me();
    this.db.friendships = this.db.friendships.filter(
      (f) => !(f.id === friendshipId && (f.requesterId === me.id || f.addresseeId === me.id))
    );
    this.save();
    this.emitSocial();
  }

  // ─── Chat ────────────────────────────────────────────────
  async listMessages(friendId: string, opts: { before?: MessageCursor; limit?: number } = {}): Promise<ChatMessage[]> {
    const me = this.me();
    if (!this.areFriends(me.id, friendId)) return [];
    const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
    return this.db.messages
      .filter((m) => (m.senderId === me.id && m.recipientId === friendId) || (m.senderId === friendId && m.recipientId === me.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
      .filter((m) => !opts.before || m.createdAt < opts.before.createdAt || (m.createdAt === opts.before.createdAt && m.id < opts.before.id))
      .slice(-limit)
      .map((m) => ({ ...m }));
  }
  async sendMessage(friendId: string, input: SendMessageInput): Promise<ChatMessage> {
    const me = this.me();
    if (friendId === me.id || !this.areFriends(me.id, friendId)) throw new BackendError('not_friends');
    const kind = input.kind ?? 'text';
    const body = (input.body ?? '').slice(0, 2000);
    if (kind === 'text' && !body.trim()) throw new BackendError('unknown', 'mensaje vacío');
    if (kind === 'anime' && !input.media) throw new BackendError('unknown', 'falta el anime');
    const msg: ChatMessage = {
      id: this.db.nextMessageId++, senderId: me.id, recipientId: friendId, kind, body,
      media: kind === 'anime' ? input.media ?? null : null,
      createdAt: new Date().toISOString(), readAt: null, deleted: false,
    };
    this.db.messages.push(msg);
    this.save();
    this.emitMessage(msg);
    // Los amigos de ejemplo contestan solos (para ver el tiempo real sin otra cuenta)
    if (friendId.startsWith('seed-')) {
      const replies = ['¡Genial! 😄', 'Jaja, totalmente de acuerdo', 'Apúntalo, mañana lo vemos', 'Cuéntame qué tal el episodio'];
      const reply = replies[msg.id % replies.length];
      setTimeout(() => {
        if (!this.db.users.some((u) => u.id === me.id)) return;
        const r: ChatMessage = {
          id: this.db.nextMessageId++, senderId: friendId, recipientId: me.id, kind: 'text', body: reply,
          media: null, createdAt: new Date().toISOString(), readAt: null, deleted: false,
        };
        this.db.messages.push(r);
        this.save();
        this.emitMessage(r);
      }, 1200);
    }
    return { ...msg };
  }
  async markConversationRead(friendId: string): Promise<number> {
    const me = this.me();
    if (!this.areFriends(me.id, friendId)) return 0;
    let n = 0;
    const now = new Date().toISOString();
    for (const m of this.db.messages) {
      if (m.recipientId === me.id && m.senderId === friendId && !m.readAt && !m.deleted) {
        m.readAt = now;
        n++;
        this.emitMessage(m);
      }
    }
    if (n) this.save();
    return n;
  }
  async deleteMessage(id: number): Promise<void> {
    const me = this.me();
    const m = this.db.messages.find((x) => x.id === id && x.senderId === me.id && !x.deleted);
    if (!m) throw new BackendError('not_found');
    m.deleted = true;
    m.body = '';
    m.media = null;
    this.save();
    this.emitMessage(m);
  }
  async getChatSummary(): Promise<ChatSummaryItem[]> {
    const me = this.me();
    const byFriend = new Map<string, ChatMessage[]>();
    for (const m of this.db.messages) {
      if (m.senderId !== me.id && m.recipientId !== me.id) continue;
      const other = m.senderId === me.id ? m.recipientId : m.senderId;
      if (!this.areFriends(me.id, other)) continue;
      byFriend.set(other, [...(byFriend.get(other) ?? []), m]);
    }
    return [...byFriend.entries()]
      .map(([friendId, list]) => {
        const last = list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id).at(-1)!;
        return {
          friendId,
          last: { id: last.id, kind: last.kind, body: last.body, senderId: last.senderId, createdAt: last.createdAt, deleted: last.deleted },
          unread: list.filter((m) => m.recipientId === me.id && !m.readAt && !m.deleted).length,
        };
      })
      .sort((a, b) => b.last.createdAt.localeCompare(a.last.createdAt));
  }
  subscribeMessages(cb: (message: ChatMessage) => void) {
    this.messageListeners.add(cb);
    return () => void this.messageListeners.delete(cb);
  }

  // ─── Actividad ───────────────────────────────────────────
  async setActivity(a: ActivityInput) {
    const me = this.me();
    this.db.activity = this.db.activity.filter((x) => x.userId !== me.id);
    this.db.activity.push({ ...a, userId: me.id, active: true, updatedAt: new Date().toISOString() });
    this.save();
    this.emitSocial();
  }
  async clearActivity() {
    const me = this.me();
    const a = this.db.activity.find((x) => x.userId === me.id);
    if (a) {
      a.active = false;
      a.updatedAt = new Date().toISOString();
      this.save();
      this.emitSocial();
    }
  }
  async listFriendsActivity(): Promise<FriendActivity[]> {
    const me = this.me();
    return this.db.activity
      .filter((a) => {
        if (a.userId === me.id || !this.areFriends(me.id, a.userId)) return false;
        return this.db.users.find((u) => u.id === a.userId)?.profile.showActivity === true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((a) => ({ ...a, profile: this.pub(a.userId) }));
  }
  subscribeSocial(cb: () => void) {
    this.socialListeners.add(cb);
    return () => void this.socialListeners.delete(cb);
  }

  // ─── Configuración pública ───────────────────────────────
  private isLive(a: Announcement) {
    const now = Date.now();
    return a.active && Date.parse(a.startsAt) <= now && (a.expiresAt === null || Date.parse(a.expiresAt) > now);
  }
  async listActiveAnnouncements(): Promise<Announcement[]> {
    return this.db.announcements.filter((a) => this.isLive(a)).sort((a, b) => b.id - a.id).map((a) => ({ ...a }));
  }
  async listProviderSwitches(): Promise<ProviderSwitch[]> {
    return this.db.switches.map((s) => ({ ...s }));
  }

  // ─── Administración ──────────────────────────────────────
  private staff(): MockUser {
    const me = this.me();
    if (!isStaff(me.profile.role)) throw new BackendError('forbidden');
    return me;
  }
  async adminListAnnouncements(): Promise<Announcement[]> {
    this.staff();
    return [...this.db.announcements].sort((a, b) => b.id - a.id).map((a) => ({ ...a }));
  }
  async adminSaveAnnouncement(input: AnnouncementInput, id?: number): Promise<Announcement> {
    this.staff();
    const body = input.body.trim();
    if (!body || body.length > 600 || input.title.length > 80) throw new BackendError('unknown', 'invalid announcement');
    if (input.linkUrl && !/^https:\/\//.test(input.linkUrl)) throw new BackendError('unknown', 'invalid link');
    const values = {
      kind: input.kind,
      display: input.display,
      title: input.title.trim(),
      body,
      linkUrl: input.linkUrl?.trim() || null,
      linkLabel: input.linkUrl?.trim() ? input.linkLabel?.trim() || null : null,
      active: input.active ?? true,
      startsAt: input.startsAt ?? new Date().toISOString(),
      expiresAt: input.expiresAt ?? null,
    };
    let out: Announcement;
    if (id === undefined) {
      out = { id: this.db.nextAnnouncementId++, createdAt: new Date().toISOString(), ...values };
      this.db.announcements.push(out);
    } else {
      const cur = this.db.announcements.find((a) => a.id === id);
      if (!cur) throw new BackendError('forbidden');
      Object.assign(cur, values);
      out = cur;
    }
    this.save();
    return { ...out };
  }
  async adminDeleteAnnouncement(id: number): Promise<void> {
    this.staff();
    const before = this.db.announcements.length;
    this.db.announcements = this.db.announcements.filter((a) => a.id !== id);
    if (this.db.announcements.length === before) throw new BackendError('forbidden');
    this.save();
  }
  async adminSetProviderSwitch(providerId: string, reason: string | null): Promise<void> {
    this.staff();
    this.db.switches = this.db.switches.filter((s) => s.providerId !== providerId);
    if (reason !== null) {
      this.db.switches.push({ providerId, reason: reason.trim().slice(0, 200), updatedAt: new Date().toISOString() });
    }
    this.save();
  }
  async adminStats(): Promise<AdminStats> {
    this.staff();
    const week = Date.now() - 7 * 24 * 3600_000;
    return {
      usersTotal: this.db.users.length,
      usersLast7Days: this.db.users.filter((u) => Date.parse(u.profile.createdAt) > week).length,
      watchingNow: this.db.activity.filter((a) => a.active && Date.parse(a.updatedAt) > Date.now() - 15 * 60_000).length,
      announcementsLive: this.db.announcements.filter((a) => this.isLive(a)).length,
    };
  }
  async adminListStaff(): Promise<StaffMember[]> {
    this.staff();
    return this.db.users
      .filter((u) => isStaff(u.profile.role))
      .sort((a, b) => Number(b.profile.role === 'owner') - Number(a.profile.role === 'owner') || a.profile.username.localeCompare(b.profile.username))
      .map((u) => ({ profile: this.pub(u.id), role: u.profile.role }));
  }
  async adminSetRole(userId: string, role: 'user' | 'admin'): Promise<void> {
    const me = this.me();
    if (me.profile.role !== 'owner') throw new BackendError('forbidden');
    const target = this.db.users.find((u) => u.id === userId);
    if (!target) throw new BackendError('not_found');
    if (target.profile.role === 'owner') throw new BackendError('forbidden');
    target.profile.role = role;
    this.save();
  }
}
