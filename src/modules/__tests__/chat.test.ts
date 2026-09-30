import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const notices: Array<{ type: string; message: string }> = [];
const osNotifications: Array<{ title: string; body: string }> = [];
const doc = { hidden: false, focused: true, hasFocus() { return this.focused; } };

function installBrowserStubs() {
  const g = globalThis as any;
  g.localStorage = new MemoryStorage();
  g.document = doc;
  g.window = {
    dispatchEvent: (e: CustomEvent) => notices.push(e.detail),
    addEventListener: () => {},
    removeEventListener: () => {},
    electron: { sendNotification: (n: { title: string; body: string }) => osNotifications.push(n) },
  };
}

// Se reimporta todo en cada prueba para partir de estado limpio
async function boot() {
  vi.resetModules();
  installBrowserStubs();
  const backendMod = await import('../backend');
  const { MockBackend } = await import('../backend/mockBackend');
  backendMod.__setBackendForTests(new MockBackend());
  const chat = await import('../chat');
  const { useAppStore } = await import('../store');
  const backend = backendMod.getBackend()!;
  await backend.signUp({ email: 'yo@test.dev', password: 'secreto123', username: 'yoyo' });
  const user = (await backend.getSession())!;
  useAppStore.getState().setAccount({ status: 'signedIn', user });
  const friends = await backend.listFriends();
  return { backend, chat, user, mika: friends[0].profile.id, useChat: chat.useChatStore };
}

describe('chat', () => {
  beforeEach(() => {
    notices.length = 0;
    osNotifications.length = 0;
    doc.hidden = false;
    doc.focused = true;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('el resumen inicial cuenta el mensaje de bienvenida sin leer', async () => {
    const { chat, useChat, mika } = await boot();
    await chat.refreshSummary();
    expect(useChat.getState().summaries[mika].unread).toBe(1);
    expect(useChat.getState().totalUnread).toBe(1);
    expect(chat.messagePreview(useChat.getState().summaries[mika].last)).toContain('Frieren');
  });

  it('abrir la conversación carga los mensajes y los marca como leídos', async () => {
    const { chat, useChat, mika } = await boot();
    await chat.refreshSummary();
    await chat.openConversation(mika);
    expect(useChat.getState().threads[mika]).toHaveLength(1);
    expect(useChat.getState().summaries[mika].unread).toBe(0);
    expect(useChat.getState().totalUnread).toBe(0);
    await chat.refreshSummary();
    expect(useChat.getState().totalUnread).toBe(0);           // también en el servidor
  });

  it('enviar es optimista, se confirma y no se duplica con el eco en tiempo real', async () => {
    const { chat, useChat, mika } = await boot();
    chat.startChat();
    await chat.openConversation(mika);
    expect(chat.sendText(mika, '  hola mika  ')).toBe(true);
    // al instante: mensaje provisional con id negativo
    let t = useChat.getState().threads[mika];
    const temp = t.find((m) => m.id < 0)!;
    expect(temp).toMatchObject({ body: 'hola mika', pending: true });
    await vi.advanceTimersByTimeAsync(10);
    t = useChat.getState().threads[mika];
    const mine = t.filter((m) => m.body === 'hola mika');
    expect(mine).toHaveLength(1);                             // sin duplicados
    expect(mine[0].id).toBeGreaterThan(0);
    expect(mine[0].pending).toBeFalsy();
    chat.stopChat();
  });

  it('no envía mensajes vacíos ni demasiado largos', async () => {
    const { chat, useChat, mika } = await boot();
    await chat.openConversation(mika);
    const before = useChat.getState().threads[mika].length;
    expect(chat.sendText(mika, '   \n ')).toBe(false);
    expect(chat.sendText(mika, 'x'.repeat(2001))).toBe(false);
    expect(chat.sendText(mika, 'x'.repeat(2000))).toBe(true);
    expect(useChat.getState().threads[mika].length).toBe(before + 1);
  });

  it('llega la respuesta en tiempo real y, viendo la conversación, se lee sola', async () => {
    const { chat, useChat, mika } = await boot();
    chat.startChat();
    await chat.openConversation(mika);
    chat.sendText(mika, 'hola');
    await vi.advanceTimersByTimeAsync(1500);                  // Mika contesta a los 1,2 s
    const t = useChat.getState().threads[mika];
    expect(t.map((m) => m.senderId === mika)).toEqual([true, false, true]);
    await vi.advanceTimersByTimeAsync(500);
    expect(useChat.getState().summaries[mika]?.unread ?? 0).toBe(0);
    expect(notices.filter((n) => n.type === 'info')).toHaveLength(0); // sin aviso: la estás viendo
    chat.stopChat();
  });

  it('con otra pantalla abierta: contador + toast; con la app en segundo plano: notificación del sistema', async () => {
    const { chat, useChat, backend, mika } = await boot();
    const { useSocialStore } = await import('../social');
    useSocialStore.setState({ friends: await backend.listFriends() });   // nombres para los avisos
    chat.startChat();
    await vi.advanceTimersByTimeAsync(10);
    await backend.sendMessage(mika, { body: 'yo' });          // provoca la respuesta automática de Mika
    await vi.advanceTimersByTimeAsync(1500);
    expect(useChat.getState().totalUnread).toBeGreaterThanOrEqual(2);   // bienvenida + respuesta
    expect(notices.some((n) => n.type === 'info' && /Genial|acuerdo|Apúntalo|episodio/.test(n.message))).toBe(true);

    doc.hidden = true;                                        // ventana en segundo plano
    await backend.sendMessage(mika, { body: 'otro' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(osNotifications).toHaveLength(1);
    expect(osNotifications[0].title).toBe('Mika');
    chat.stopChat();
  });

  it('eliminar un mensaje propio lo deja como "eliminado"', async () => {
    const { chat, useChat, mika } = await boot();
    await chat.openConversation(mika);
    chat.sendText(mika, 'me arrepiento');
    await vi.advanceTimersByTimeAsync(10);
    const msg = useChat.getState().threads[mika].find((m) => m.body === 'me arrepiento')!;
    await chat.removeMessage(mika, msg.id);
    const after = useChat.getState().threads[mika].find((m) => m.id === msg.id)!;
    expect(after).toMatchObject({ deleted: true, body: '' });
    expect(chat.messagePreview(after)).toBe('Mensaje eliminado');
  });

  it('un envío que falla queda marcado, se avisa y se puede reintentar o descartar', async () => {
    const { chat, useChat, backend } = await boot();
    // Sora es solicitud pendiente: NO es amiga → el servidor rechaza
    const sora = (await backend.listFriendRequests())[0].profile.id;
    chat.sendText(sora, 'hola?');
    await vi.advanceTimersByTimeAsync(10);
    const failed = useChat.getState().threads[sora][0];
    expect(failed).toMatchObject({ failed: true, pending: false });
    expect(notices.some((n) => n.type === 'error' && /amigos/.test(n.message))).toBe(true);
    chat.retryMessage(sora, failed.id);
    expect(useChat.getState().threads[sora][0].pending).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    chat.discardMessage(sora, failed.id);
    expect(useChat.getState().threads[sora]).toHaveLength(0);
  });

  it('compartir un anime crea un mensaje con su instantánea', async () => {
    const { chat, useChat, mika } = await boot();
    await chat.openConversation(mika);
    chat.sendAnime(mika, { id: 154587, title: { romaji: 'Sousou no Frieren' }, coverImage: { large: 'https://s4.anilist.co/x.jpg' } });
    await vi.advanceTimersByTimeAsync(10);
    const m = useChat.getState().threads[mika].at(-1)!;
    expect(m).toMatchObject({ kind: 'anime', media: { id: 154587 } });
    expect(chat.messagePreview(m)).toContain('Anime compartido');
  });

  it('paginación: carga por bloques y "cargar anteriores" trae el resto sin duplicar', async () => {
    const { chat, useChat, backend, mika } = await boot();
    for (let i = 0; i < 70; i++) await backend.sendMessage(mika, { body: `m${i}` });
    await vi.advanceTimersByTimeAsync(10);
    await chat.loadThread(mika);
    expect(useChat.getState().threads[mika]).toHaveLength(50);
    expect(useChat.getState().hasMore[mika]).toBe(true);
    await chat.loadOlder(mika);
    const t = useChat.getState().threads[mika];
    expect(t.length).toBeGreaterThan(50);
    expect(new Set(t.map((m) => m.id)).size).toBe(t.length);
    // orden cronológico
    expect(t.map((m) => m.createdAt)).toEqual([...t.map((m) => m.createdAt)].sort());
  });

  it('stopChat deja el estado limpio', async () => {
    const { chat, useChat, mika } = await boot();
    chat.startChat();
    await chat.openConversation(mika);
    chat.stopChat();
    expect(useChat.getState()).toMatchObject({ summaries: {}, threads: {}, activeFriendId: null, totalUnread: 0 });
  });
});
