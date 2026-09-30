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

// ─── Chat ──────────────────────────────────────────────────
export type MessageKind = 'text' | 'anime';

export interface ChatMessage {
  id: number;
  senderId: string;
  recipientId: string;
  kind: MessageKind;
  body: string;
  /** Anime compartido (kind = 'anime'). */
  media: MediaSnapshot | null;
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

  // Chat (solo entre amigos aceptados)
  /**
   * Mensajes de la conversación en orden cronológico. `before` = cursor compuesto
   * (fecha + id) del mensaje más antiguo cargado, para paginar hacia atrás sin
   * saltarse mensajes con la misma fecha.
   */
  listMessages(friendId: string, opts?: { before?: MessageCursor; limit?: number }): Promise<ChatMessage[]>;
  sendMessage(friendId: string, input: SendMessageInput): Promise<ChatMessage>;
  /** Marca como leídos los mensajes recibidos de ese amigo. Devuelve cuántos. */
  markConversationRead(friendId: string): Promise<number>;
  deleteMessage(id: number): Promise<void>;
  getChatSummary(): Promise<ChatSummaryItem[]>;
  /** Mensajes nuevos o modificados (leído/borrado) en tiempo real. */
  subscribeMessages(cb: (message: ChatMessage) => void): () => void;
}
