// ═══════════════════════════════════════════════════════════
// Backend de cuentas — tipos e interfaz
//
// La app solo conoce `AccountBackend`. Hay dos implementaciones:
//   · SupabaseBackend  (producción)
//   · MockBackend      (desarrollo/pruebas de UI, en memoria)
// ═══════════════════════════════════════════════════════════

// ─── Autenticación ─────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
}

export type AuthEvent =
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'PASSWORD_RECOVERY'
  | 'USER_UPDATED'
  | 'TOKEN_REFRESHED';

export type BackendErrorCode =
  | 'not_configured'
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_taken'
  | 'username_taken'
  | 'invalid_username'
  | 'weak_password'
  | 'invalid_email'
  | 'rate_limited'
  | 'not_authenticated'
  | 'not_found'
  | 'already_friends'
  | 'request_exists'
  | 'too_many_requests'
  | 'file_too_large'
  | 'not_friends'
  | 'forbidden'
  | 'suspended'
  | 'unavailable'
  | 'too_many_messages'
  | 'invalid_file'
  | 'network'
  | 'unknown';

/** Error normalizado: la UI decide el texto según `code`. */
export class BackendError extends Error {
  readonly code: BackendErrorCode;
  constructor(code: BackendErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'BackendError';
    this.code = code;
  }
}

// ─── Perfiles ──────────────────────────────────────────────
/** `owner` = dueño de la app (uno solo) · `admin` = equipo · `user` = resto. */
export type AppRole = 'user' | 'admin' | 'owner';

export const isStaff = (role: AppRole | undefined | null): boolean => role === 'admin' || role === 'owner';

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** Los amigos pueden ver qué estoy viendo ahora. */
  showActivity: boolean;
  /** Los amigos pueden ver mi lista. */
  showLibrary: boolean;
  role: AppRole;
  createdAt: string;
}

/** Lo que ve cualquiera que encuentre a un usuario. */
export interface PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Solo se incluye para amigos aceptados (nunca en la búsqueda). */
  bio?: string | null;
}

export interface ProfilePatch {
  username?: string;
  displayName?: string | null;
  bio?: string | null;
  showActivity?: boolean;
  showLibrary?: boolean;
}

// ─── Listas ────────────────────────────────────────────────
export type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'REPEATING';
export type MediaType = 'anime' | 'manga';

/** Instantánea mínima del título guardada junto a la entrada. */
export interface MediaSnapshot {
  id: number;
  idMal?: number | null;
  title: { romaji: string; english?: string | null; native?: string | null };
  coverImage: { extraLarge?: string | null; large: string; color?: string | null };
  bannerImage?: string | null;
  episodes?: number | null;
  genres?: string[];
  averageScore?: number | null;
  status?: string | null;
  seasonYear?: number | null;
  format?: string | null;
}

export interface LibraryEntry {
  mediaType: MediaType;
  mediaId: number;
  status: ListStatus;
  progress: number;
  score: number;
  media: MediaSnapshot;
  updatedAt: string;
}

export interface LibraryUpsert {
  mediaType: MediaType;
  mediaId: number;
  status: ListStatus;
  progress?: number;
  score?: number;
  media: MediaSnapshot;
}

// ─── Amistades ─────────────────────────────────────────────
export interface Friend {
  friendshipId: number;
  profile: PublicProfile;
  since: string;
}

export interface FriendRequest {
  id: number;
  direction: 'incoming' | 'outgoing';
  profile: PublicProfile;
  createdAt: string;
}

// ─── "Viendo ahora" ────────────────────────────────────────
export interface ActivityInput {
  mediaId: number;
  title: string;
  coverUrl: string | null;
  episode: number;
  totalEpisodes: number | null;
}

export interface Activity extends ActivityInput {
  userId: string;
  active: boolean;
  updatedAt: string;
}

export interface FriendActivity extends Activity {
  profile: PublicProfile;
}

// ─── Manga en la cuenta ────────────────────────────────────
export type MangaSyncStatus = 'reading' | 'planning' | 'completed' | 'dropped';

/** Ficha mínima de un manga tal y como viaja a la nube (y a los amigos). */
export interface MangaSnapshotWire {
  id: string;
  sourceId: string;
  title: string;
  description?: string;
  /** Solo https; vacío si no hay o no es segura. */
  coverUrl?: string;
  status?: string;
  tags?: string[];
  year?: number | null;
  lastChapter?: string | null;
  isAdult?: boolean;
}

/** Una entrada de la biblioteca / historial de lectura en la nube. */
export interface MangaSyncItem {
  source: string;
  mangaId: string;
  /** null = solo historial de lectura (no está en la biblioteca). */
  status: MangaSyncStatus | null;
  manga: MangaSnapshotWire;
  lastChapterId: string | null;
  lastChapterNumber: string | null;
  lastPage: number | null;
  lastPageCount: number | null;
  lastReadAt: string | null;
  /** Capítulos leídos como rangos de números: [[1,45],[47,47]]. */
  readRanges: Array<[number, number]>;
  readResetAt: string | null;
  deleted: boolean;
  /** Sello del cliente: en un conflicto gana el más nuevo. */
  updatedAt: string;
}

export interface MangaSyncRow extends MangaSyncItem {
  /** Sello del servidor (para pedir solo lo nuevo). */
  syncedAt: string;
}

/** Lo que se comparte por chat: lo justo para pintar la tarjeta y abrir la ficha. */
export interface MangaShare {
  id: string;
  sourceId: string;
  title: string;
  coverUrl: string;
  status: string;
  year: number | null;
  lastChapter: string | null;
  tags: string[];
}

export interface ReadingActivityInput {
  source: string;
  mangaId: string;
  title: string;
  coverUrl: string | null;
  chapter: string | null;
  page: number;
  pageCount: number;
}

export interface ReadingActivity extends ReadingActivityInput {
  userId: string;
  active: boolean;
  updatedAt: string;
}

export interface FriendReading extends ReadingActivity {
  profile: PublicProfile;
}

// ─── Chat ──────────────────────────────────────────────────
export type MessageKind = 'text' | 'anime' | 'manga';

export interface ChatMessage {
  id: number;
  senderId: string;
  recipientId: string;
  kind: MessageKind;
  body: string;
  /** Anime compartido (kind = 'anime'). */
  media: MediaSnapshot | null;
  /** Manga compartido (kind = 'manga'). */
  manga: MangaShare | null;
  /** Id del mensaje al que responde (null = mensaje normal). */
  replyTo: number | null;
  createdAt: string;
  readAt: string | null;
  /** Borrado por su autor: queda como "mensaje eliminado". */
  deleted: boolean;
  /** Solo en cliente: envío en curso / fallido. */
  pending?: boolean;
  failed?: boolean;
}

export interface SendMessageInput {
  kind?: MessageKind;
  body?: string;
  media?: MediaSnapshot;
  manga?: MangaShare;
  /** Responder a este mensaje (debe ser de la misma conversación). */
  replyTo?: number;
}

export interface ChatSummaryItem {
  friendId: string;
  last: { id: number; kind: MessageKind; body: string; senderId: string; createdAt: string; deleted: boolean };
  unread: number;
}

export interface MessageCursor {
  createdAt: string;
  id: number;
}

export const CHAT_MAX_LENGTH = 2000;

// ─── Administración ────────────────────────────────────────
export type AnnouncementKind = 'info' | 'update' | 'event' | 'warning' | 'maintenance';
export type AnnouncementDisplay = 'banner' | 'modal';

/** A quién se muestra el anuncio (según el sistema operativo de la app). */
export type AnnouncementPlatform = 'all' | 'mac' | 'windows' | 'linux';

export interface Announcement {
  id: number;
  kind: AnnouncementKind;
  display: AnnouncementDisplay;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  active: boolean;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
  /** Solo para este sistema ('all' = todos). */
  platform: AnnouncementPlatform;
  /** Solo para versiones ANTERIORES a esta ("1.4.0"); null = todas. */
  belowVersion: string | null;
}

export interface AnnouncementInput {
  kind: AnnouncementKind;
  display: AnnouncementDisplay;
  title: string;
  body: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
  active?: boolean;
  /** ISO; por defecto ahora. */
  startsAt?: string;
  /** ISO; null = no caduca. */
  expiresAt?: string | null;
  platform?: AnnouncementPlatform;
  belowVersion?: string | null;
}

export const ANNOUNCEMENT_LIMITS = { title: 80, body: 600, linkLabel: 30, linkUrl: 500 } as const;

/** Servicio desactivado para todos los usuarios (existe fila = desactivado). */
export interface ProviderSwitch {
  providerId: string;
  reason: string;
  updatedAt: string;
}

export interface StaffMember {
  profile: PublicProfile;
  role: AppRole;
}

export interface AdminStats {
  usersTotal: number;
  usersLast7Days: number;
  /** Usuarios con "viendo ahora" activo en los últimos 15 min. */
  watchingNow: number;
  announcementsLive: number;
}

/** Usuario tal y como lo ve el staff (sin correo: es un dato privado). */
export interface AdminUser {
  profile: PublicProfile;
  role: AppRole;
  createdAt: string;
  /** Último "viendo ahora" publicado (aproxima la última actividad). */
  lastActive: string | null;
  suspended: boolean;
  suspendedReason: string | null;
}

export interface AdminUserPage {
  users: AdminUser[];
  /** Coincidencias totales de la búsqueda (para paginar). */
  total: number;
}

/** Entrada del registro de auditoría del equipo. */
export interface AuditEntry {
  id: number;
  actor: string;
  /** p. ej. `announcement.create`, `service.disable`, `user.suspend`, `team.role`. */
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface SignupPoint {
  /** YYYY-MM-DD */
  day: string;
  count: number;
}

// ─── Interfaz ──────────────────────────────────────────────
export interface AccountBackend {
  readonly kind: 'supabase' | 'mock';

  // Autenticación
  getSession(): Promise<AuthUser | null>;
  onAuthChange(cb: (event: AuthEvent, user: AuthUser | null) => void): () => void;
  isUsernameAvailable(username: string): Promise<boolean>;
  /** `needsEmailConfirmation`: el proyecto exige verificar el correo antes de entrar. */
  signUp(input: { email: string; password: string; username: string }): Promise<{ needsEmailConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  /** Completa un enlace kageview://auth-callback (confirmación de correo / recuperación). */
  handleAuthCallbackUrl(url: string): Promise<void>;
  deleteAccount(): Promise<void>;

  // Perfil
  getMyProfile(): Promise<Profile | null>;
  updateMyProfile(patch: ProfilePatch): Promise<Profile>;
  /** Sube la imagen (ya recortada/redimensionada) y devuelve el perfil actualizado. */
  uploadAvatar(image: Blob): Promise<Profile>;
  removeAvatar(): Promise<Profile>;

  // Listas
  /** Sin `userId` = mis listas. Con `userId` = las de un amigo (si lo permite). */
  listLibrary(mediaType: MediaType, userId?: string): Promise<LibraryEntry[]>;
  upsertLibraryEntry(entry: LibraryUpsert): Promise<LibraryEntry>;
  removeLibraryEntry(mediaType: MediaType, mediaId: number): Promise<void>;

  // Amigos
  listFriends(): Promise<Friend[]>;
  listFriendRequests(): Promise<FriendRequest[]>;
  searchUsers(query: string): Promise<PublicProfile[]>;
  sendFriendRequest(userId: string): Promise<'sent' | 'accepted'>;
  respondToFriendRequest(requestId: number, accept: boolean): Promise<void>;
  removeFriend(friendshipId: number): Promise<void>;

  // Actividad
  setActivity(activity: ActivityInput): Promise<void>;
  clearActivity(): Promise<void>;
  listFriendsActivity(): Promise<FriendActivity[]>;
  /** Avisa cuando cambian amistades o actividad de mis amigos (para refrescar). */
  subscribeSocial(cb: () => void): () => void;

  // Manga en la cuenta
  /** Sube cambios de la biblioteca/historial (máx. 100). Gana el sello más nuevo. Devuelve cuántos se aplicaron. */
  pushMangaEntries(items: MangaSyncItem[]): Promise<number>;
  /** Mis entradas cambiadas desde `since` (sello del servidor), de más antigua a más reciente. */
  pullMangaEntries(opts?: { since?: string | null; limit?: number }): Promise<MangaSyncRow[]>;
  /** Biblioteca de un amigo (si la comparte): solo lo que tiene en su biblioteca. */
  listFriendManga(userId: string): Promise<MangaSyncRow[]>;
  /** "Leyendo ahora" para los amigos (como setActivity, pero de manga). */
  setReadingActivity(a: ReadingActivityInput): Promise<void>;
  clearReadingActivity(): Promise<void>;
  listFriendsReading(): Promise<FriendReading[]>;

  // Chat (solo entre amigos aceptados)
  /**
   * Mensajes de la conversación en orden cronológico. `before` = cursor compuesto
   * (fecha + id) del mensaje más antiguo cargado, para paginar hacia atrás sin
   * saltarse mensajes con la misma fecha.
   */
  listMessages(friendId: string, opts?: { before?: MessageCursor; limit?: number }): Promise<ChatMessage[]>;
  sendMessage(friendId: string, input: SendMessageInput): Promise<ChatMessage>;
  /** Mensajes concretos de una conversación (para mostrar la cita de una respuesta antigua). */
  getMessagesByIds(friendId: string, ids: number[]): Promise<ChatMessage[]>;
  /** Marca como leídos los mensajes recibidos de ese amigo. Devuelve cuántos. */
  markConversationRead(friendId: string): Promise<number>;
  deleteMessage(id: number): Promise<void>;
  getChatSummary(): Promise<ChatSummaryItem[]>;
  /** Mensajes nuevos o modificados (leído/borrado) en tiempo real. */
  subscribeMessages(cb: (message: ChatMessage) => void): () => void;

  // Configuración pública (funciona SIN sesión)
  /** Anuncios vigentes ahora mismo (activos y dentro de su ventana de fechas). */
  listActiveAnnouncements(): Promise<Announcement[]>;
  listProviderSwitches(): Promise<ProviderSwitch[]>;

  // Administración (la base de datos exige rol admin/owner; la UI solo lo refleja)
  adminListAnnouncements(): Promise<Announcement[]>;
  adminSaveAnnouncement(input: AnnouncementInput, id?: number): Promise<Announcement>;
  adminDeleteAnnouncement(id: number): Promise<void>;
  /** `reason` = texto → desactivar el servicio · null → volver a activarlo. */
  adminSetProviderSwitch(providerId: string, reason: string | null): Promise<void>;
  adminStats(): Promise<AdminStats>;
  adminListStaff(): Promise<StaffMember[]>;
  /** Solo el owner. Nombra o quita administradores. */
  adminSetRole(userId: string, role: 'user' | 'admin'): Promise<void>;
  adminListUsers(opts?: { query?: string; limit?: number; offset?: number }): Promise<AdminUserPage>;
  /** Suspende (sin chat, solicitudes ni actividad) o reactiva a un usuario normal. */
  adminSetSuspended(userId: string, suspended: boolean, reason?: string): Promise<void>;
  /** Más recientes primero; `before` = id de la última entrada cargada. */
  adminAuditLog(opts?: { before?: number; limit?: number }): Promise<AuditEntry[]>;
  adminSignups(days?: number): Promise<SignupPoint[]>;
}
