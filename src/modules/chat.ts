// ═══════════════════════════════════════════════════════════
// chat — Mensajes entre amigos
//
// Estado (zustand) + lógica de las conversaciones. Se alimenta de:
//   · Realtime (backend.subscribeMessages): mensajes nuevos, leídos, borrados
//   · Sondeo de respaldo: el resumen cada 30 s y la conversación abierta cada
//     8 s (si el canal en tiempo real falla, el chat sigue funcionando)
//
// Los mensajes se envían de forma optimista (aparecen al instante con
// `pending`); si fallan quedan marcados `failed` con opción de reintentar.
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import {
  BackendError,
  CHAT_MAX_LENGTH,
  ChatMessage,
  ChatSummaryItem,
  MangaShare,
  MediaSnapshot,
  SendMessageInput,
  getBackend,
} from './backend';
import { useAppStore } from './store';
import { useSocialStore } from './social';
import { notify } from './notify';

interface ChatState {
  /** Resumen por amigo (último mensaje + no leídos). */
  summaries: Record<string, ChatSummaryItem>;
  /** Mensajes cargados por amigo, en orden cronológico. */
  threads: Record<string, ChatMessage[]>;
  /** ¿Hay mensajes más antiguos por cargar? */
  hasMore: Record<string, boolean>;
  loadingThread: Record<string, boolean>;
  /** Conversación abierta en pantalla (null = ninguna). */
  activeFriendId: string | null;
  /** Amigo cuya conversación debe abrirse al entrar en la sección (desde otros sitios). */
  pendingOpen: string | null;
  totalUnread: number;
  /** Mensaje al que se está respondiendo, por amigo (null/ausente = ninguno). */
  replyTarget: Record<string, number | null>;
  /**
   * Mensajes citados que no están en la parte cargada de la conversación (respuestas
   * antiguas). 'gone' = ya no existe en la base de datos.
   */
  quotes: Record<number, ChatMessage | 'gone'>;
}

const INITIAL: ChatState = {
  summaries: {},
  threads: {},
  hasMore: {},
  loadingThread: {},
  activeFriendId: null,
  pendingOpen: null,
  totalUnread: 0,
  replyTarget: {},
  quotes: {},
};

export const useChatStore = create<ChatState>(() => ({ ...INITIAL }));

const st = () => useChatStore.getState();
const set = (partial: Partial<ChatState>) => useChatStore.setState(partial);
const myId = () => useAppStore.getState().account.user?.id ?? null;

const PAGE = 50;
let tempCounter = 0;

// ─── Utilidades ────────────────────────────────────────────
function totalUnread(summaries: Record<string, ChatSummaryItem>): number {
  return Object.values(summaries).reduce((n, s) => n + s.unread, 0);
}

/** Texto corto para listas y avisos. */
export function messagePreview(m: { kind: string; body: string; deleted: boolean }): string {
  if (m.deleted) return 'Mensaje eliminado';
  if (m.kind === 'anime') return '🎬 Anime compartido';
  if (m.kind === 'manga') return '📖 Manga compartido';
  return m.body.replace(/\s+/g, ' ').trim();
}

function upsertMessage(list: ChatMessage[], msg: ChatMessage): ChatMessage[] {
  const i = list.findIndex((m) => m.id === msg.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...list[i], ...msg, pending: false, failed: false };
    return next;
  }
  const next = [...list, msg];
  next.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  return next;
}

function setThread(friendId: string, updater: (list: ChatMessage[]) => ChatMessage[]) {
  const cur = st().threads[friendId] ?? [];
  set({ threads: { ...st().threads, [friendId]: updater(cur) } });
}

/**
 * Mensaje citado por una respuesta: el de la conversación cargada, o uno traído
 * aparte. `undefined` = aún se está buscando · 'gone' = ya no existe.
 */
export function findQuoted(
  thread: readonly ChatMessage[] | undefined,
  quotes: ChatState['quotes'],
  id: number
): ChatMessage | 'gone' | undefined {
  return thread?.find((m) => m.id === id) ?? quotes[id];
}

const quoteFetching = new Set<number>();

/** Trae los mensajes citados que no están cargados (respuestas a mensajes antiguos). */
async function resolveQuotes(friendId: string): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  const thread = st().threads[friendId] ?? [];
  const missing = [
    ...new Set(
      thread
        .map((m) => m.replyTo)
        .filter((id): id is number => typeof id === 'number' && id > 0)
        .filter((id) => !thread.some((m) => m.id === id) && st().quotes[id] === undefined && !quoteFetching.has(id))
    ),
  ];
  if (missing.length === 0) return;
  missing.forEach((id) => quoteFetching.add(id));
  try {
    const found = await backend.getMessagesByIds(friendId, missing);
    const next = { ...st().quotes };
    for (const id of missing) next[id] = found.find((m) => m.id === id) ?? 'gone';
    set({ quotes: next });
  } catch (err) {
    // Sin conexión o migración sin aplicar: se reintenta en la próxima carga
    console.warn('[chat] No se pudieron cargar los mensajes citados:', err);
  } finally {
    missing.forEach((id) => quoteFetching.delete(id));
  }
}

function friendName(id: string): string {
  const f = useSocialStore.getState().friends.find((x) => x.profile.id === id);
  return f ? f.profile.displayName || f.profile.username : 'Un amigo';
}

const windowFocused = () => typeof document !== 'undefined' && !document.hidden && document.hasFocus();

// ─── Resumen ───────────────────────────────────────────────
let summaryTimer: ReturnType<typeof setTimeout> | null = null;

export async function refreshSummary(): Promise<void> {
  const backend = getBackend();
  if (!backend || useAppStore.getState().account.status !== 'signedIn') return;
  try {
    const list = await backend.getChatSummary();
    const summaries: Record<string, ChatSummaryItem> = {};
    for (const s of list) summaries[s.friendId] = s;
    // La conversación abierta y visible se considera leída
    const active = st().activeFriendId;
    if (active && summaries[active] && windowFocused()) summaries[active] = { ...summaries[active], unread: 0 };
    set({ summaries, totalUnread: totalUnread(summaries) });
  } catch (err) {
    console.warn('[chat] No se pudo refrescar el resumen:', err);
  }
}

function refreshSummarySoon() {
  if (summaryTimer) return;
  summaryTimer = setTimeout(() => {
    summaryTimer = null;
    void refreshSummary();
  }, 300);
}

// ─── Conversaciones ────────────────────────────────────────
export async function loadThread(friendId: string): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  set({ loadingThread: { ...st().loadingThread, [friendId]: true } });
  try {
    const msgs = await backend.listMessages(friendId, { limit: PAGE });
    // Se conservan los mensajes locales en envío/fallidos
    const local = (st().threads[friendId] ?? []).filter((m) => m.pending || m.failed);
    let merged = msgs;
    for (const m of local) merged = [...merged, m];
    set({
      threads: { ...st().threads, [friendId]: merged },
      hasMore: { ...st().hasMore, [friendId]: msgs.length >= PAGE },
    });
    void resolveQuotes(friendId);
  } catch (err) {
    console.warn('[chat] No se pudo cargar la conversación:', err);
  } finally {
    set({ loadingThread: { ...st().loadingThread, [friendId]: false } });
  }
}

export async function loadOlder(friendId: string): Promise<void> {
  const backend = getBackend();
  const cur = (st().threads[friendId] ?? []).filter((m) => !m.pending && !m.failed);
  if (!backend || cur.length === 0 || st().loadingThread[friendId]) return;
  set({ loadingThread: { ...st().loadingThread, [friendId]: true } });
  try {
    const older = await backend.listMessages(friendId, { before: { createdAt: cur[0].createdAt, id: cur[0].id }, limit: PAGE });
    setThread(friendId, (list) => older.reduce((acc, m) => upsertMessage(acc, m), list));
    set({ hasMore: { ...st().hasMore, [friendId]: older.length >= PAGE } });
    void resolveQuotes(friendId);
  } catch (err) {
    console.warn('[chat] No se pudieron cargar mensajes anteriores:', err);
  } finally {
    set({ loadingThread: { ...st().loadingThread, [friendId]: false } });
  }
}

/** Marca como leída la conversación (si hay algo sin leer) y pone su contador a 0. */
export async function markRead(friendId: string): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  const s = st().summaries[friendId];
  const hasUnreadLocal = (st().threads[friendId] ?? []).some((m) => m.recipientId === myId() && !m.readAt && !m.deleted);
  if (!(s && s.unread > 0) && !hasUnreadLocal) return;
  // Optimista
  if (s) {
    const summaries = { ...st().summaries, [friendId]: { ...s, unread: 0 } };
    set({ summaries, totalUnread: totalUnread(summaries) });
  }
  const now = new Date().toISOString();
  setThread(friendId, (list) =>
    list.map((m) => (m.recipientId === myId() && !m.readAt ? { ...m, readAt: now } : m))
  );
  try {
    await backend.markConversationRead(friendId);
  } catch (err) {
    console.warn('[chat] No se pudo marcar como leído:', err);
  }
}

/** Abre una conversación en la sección de mensajes. */
export async function openConversation(friendId: string): Promise<void> {
  set({ activeFriendId: friendId, pendingOpen: null });
  await loadThread(friendId);
  if (st().activeFriendId === friendId && windowFocused()) await markRead(friendId);
}

export function closeConversation(): void {
  set({ activeFriendId: null });
}

/** Pide abrir el chat con un amigo desde otra pantalla (perfil, "Mensaje"…). */
export function requestOpenChat(friendId: string): void {
  set({ pendingOpen: friendId });
}

// ─── Envío ─────────────────────────────────────────────────
function sendErrorText(err: unknown): string {
  const code = err instanceof BackendError ? err.code : 'unknown';
  if (code === 'not_friends') return 'Ya no sois amigos: no puedes enviar mensajes.';
  if (code === 'too_many_messages') return 'Vas demasiado rápido. Espera unos segundos.';
  if (code === 'network') return 'Sin conexión: el mensaje no se ha enviado.';
  if (code === 'not_found') return 'El mensaje al que respondías ya no existe.';
  if (code === 'unavailable') return 'Para responder a mensajes hay que actualizar la base de datos (ver supabase/README.md).';
  return 'No se pudo enviar el mensaje.';
}

async function deliver(friendId: string, tempId: number, input: SendMessageInput): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  try {
    const sent = await backend.sendMessage(friendId, input);
    // Sustituye el mensaje provisional por el real (y evita el duplicado del eco de Realtime)
    setThread(friendId, (list) => upsertMessage(list.filter((m) => m.id !== tempId), sent));
    refreshSummarySoon();
  } catch (err) {
    setThread(friendId, (list) =>
      list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m))
    );
    notify('error', sendErrorText(err));
  }
}

function enqueue(friendId: string, input: SendMessageInput): number | null {
  const me = myId();
  if (!me) return null;
  const tempId = -(++tempCounter);
  const msg: ChatMessage = {
    id: tempId,
    senderId: me,
    recipientId: friendId,
    kind: input.kind ?? 'text',
    body: input.body ?? '',
    media: input.media ?? null,
    manga: input.manga ?? null,
    replyTo: input.replyTo ?? null,
    createdAt: new Date().toISOString(),
    readAt: null,
    deleted: false,
    pending: true,
  };
  setThread(friendId, (list) => [...list, msg]);
  void deliver(friendId, tempId, input);
  return tempId;
}

/** Mensaje al que se va a responder en esta conversación (si sigue existiendo y no está borrado). */
function currentReply(friendId: string): number | undefined {
  const id = st().replyTarget[friendId];
  if (!id || id < 0) return undefined; // los mensajes aún sin enviar (id negativo) no se pueden citar
  const m = (st().threads[friendId] ?? []).find((x) => x.id === id);
  return m && !m.deleted ? id : undefined;
}

/** Elige (o quita, con null) el mensaje al que se responderá en la próxima emisión. */
export function setReplyTarget(friendId: string, messageId: number | null): void {
  if (messageId !== null) {
    const m = (st().threads[friendId] ?? []).find((x) => x.id === messageId);
    // No se responde a mensajes borrados ni a los que todavía se están enviando
    if (!m || m.deleted || m.pending || m.failed || messageId < 0) return;
  }
  set({ replyTarget: { ...st().replyTarget, [friendId]: messageId } });
}

/** Tras enviar, la respuesta en curso se da por usada. */
function consumeReply(friendId: string): number | undefined {
  const id = currentReply(friendId);
  if (st().replyTarget[friendId] != null) set({ replyTarget: { ...st().replyTarget, [friendId]: null } });
  return id;
}

/** Envía un mensaje de texto. Devuelve false si está vacío o es demasiado largo. */
export function sendText(friendId: string, text: string): boolean {
  const body = text.replace(/\s+$/g, '').replace(/^\s+/g, '');
  if (!body || body.length > CHAT_MAX_LENGTH) return false;
  return enqueue(friendId, { kind: 'text', body, replyTo: consumeReply(friendId) }) !== null;
}

/** Comparte un anime con un amigo (desde la ficha: nunca arrastra una respuesta a medias). */
export function sendAnime(friendId: string, media: MediaSnapshot): boolean {
  return enqueue(friendId, { kind: 'anime', media }) !== null;
}

/** Comparte un manga con un amigo (tarjeta con portada que abre la ficha). */
export function sendManga(friendId: string, manga: MangaShare): boolean {
  return enqueue(friendId, { kind: 'manga', manga }) !== null;
}

export function retryMessage(friendId: string, tempId: number): void {
  const m = (st().threads[friendId] ?? []).find((x) => x.id === tempId);
  if (!m) return;
  setThread(friendId, (list) => list.map((x) => (x.id === tempId ? { ...x, pending: true, failed: false } : x)));
  void deliver(friendId, tempId, { kind: m.kind, body: m.body, media: m.media ?? undefined, manga: m.manga ?? undefined, replyTo: m.replyTo ?? undefined });
}

export function discardMessage(friendId: string, tempId: number): void {
  setThread(friendId, (list) => list.filter((m) => m.id !== tempId));
}

/** Elimina un mensaje propio (queda como "Mensaje eliminado"). */
export async function removeMessage(friendId: string, id: number): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  try {
    await backend.deleteMessage(id);
    setThread(friendId, (list) => list.map((m) => (m.id === id ? { ...m, deleted: true, body: '', media: null, manga: null } : m)));
    dropReplyIfDeleted(friendId, id);
    refreshSummarySoon();
  } catch (err) {
    console.warn('[chat] No se pudo eliminar el mensaje:', err);
    notify('error', 'No se pudo eliminar el mensaje.');
  }
}

/** Si el mensaje al que estaba respondiendo se borra, se cancela la respuesta en curso. */
function dropReplyIfDeleted(friendId: string, deletedId: number): void {
  if (st().replyTarget[friendId] === deletedId) set({ replyTarget: { ...st().replyTarget, [friendId]: null } });
  const q = st().quotes[deletedId];
  if (q && q !== 'gone') set({ quotes: { ...st().quotes, [deletedId]: { ...q, deleted: true, body: '', media: null, manga: null } } });
}

// ─── Tiempo real ───────────────────────────────────────────
const notified = new Set<number>();

function handleIncoming(msg: ChatMessage): void {
  const me = myId();
  if (!me) return;
  const friendId = msg.senderId === me ? msg.recipientId : msg.senderId;
  const known = (st().threads[friendId] ?? []).some((m) => m.id === msg.id);

  // Se refleja en la conversación si ya está cargada (o si es la abierta)
  if (st().threads[friendId] !== undefined || st().activeFriendId === friendId) {
    setThread(friendId, (list) => upsertMessage(list, msg));
    if (msg.deleted) dropReplyIfDeleted(friendId, msg.id);
    if (msg.replyTo) void resolveQuotes(friendId);
  }

  const incomingNew = msg.recipientId === me && !msg.readAt && !msg.deleted;
  if (incomingNew) {
    const viewing = st().activeFriendId === friendId && windowFocused();
    if (viewing) {
      void markRead(friendId);
    } else if (!known && !notified.has(msg.id) && Date.now() - new Date(msg.createdAt).getTime() < 60_000) {
      notified.add(msg.id);
      const name = friendName(friendId);
      const preview = messagePreview(msg);
      if (typeof document !== 'undefined' && document.hidden) {
        window.electron?.sendNotification?.({ title: name, body: preview.slice(0, 120) });
      } else {
        notify('info', preview.length > 90 ? `${preview.slice(0, 90)}…` : preview, `💬 ${name}`);
      }
    }
  }
  refreshSummarySoon();
}

let unsubscribe: (() => void) | null = null;
let pollSummary: ReturnType<typeof setInterval> | null = null;
let pollThread: ReturnType<typeof setInterval> | null = null;
let onFocus: (() => void) | null = null;

export function startChat(): void {
  const backend = getBackend();
  if (!backend || unsubscribe) return;
  void refreshSummary();
  unsubscribe = backend.subscribeMessages(handleIncoming);
  pollSummary = setInterval(() => void refreshSummary(), 30_000);
  // Red de seguridad: si Realtime no entrega, la conversación abierta se actualiza sola
  pollThread = setInterval(() => {
    const id = st().activeFriendId;
    if (id && typeof document !== 'undefined' && !document.hidden) {
      void loadThread(id).then(() => {
        if (windowFocused()) void markRead(id);
      });
    }
  }, 8_000);
  if (typeof window !== 'undefined') {
    onFocus = () => {
      const id = st().activeFriendId;
      if (id) void markRead(id);
      void refreshSummary();
    };
    window.addEventListener('focus', onFocus);
  }
}

export function stopChat(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (pollSummary) clearInterval(pollSummary);
  if (pollThread) clearInterval(pollThread);
  pollSummary = pollThread = null;
  if (onFocus && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  onFocus = null;
  notified.clear();
  set({ ...INITIAL });
}
