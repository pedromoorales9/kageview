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

  describe('responder a mensajes', () => {
    it('elegir un mensaje y enviar crea una respuesta; la cita se consume y no se repite', async () => {
      const { chat, useChat, mika } = await boot();
      await chat.openConversation(mika);
      const welcome = useChat.getState().threads[mika][0];
      chat.setReplyTarget(mika, welcome.id);
      expect(useChat.getState().replyTarget[mika]).toBe(welcome.id);
      chat.sendText(mika, 'sí, me encanta');
      expect(useChat.getState().threads[mika].at(-1)!.replyTo).toBe(welcome.id);   // ya en la burbuja provisional
      expect(useChat.getState().replyTarget[mika]).toBeNull();
      await vi.advanceTimersByTimeAsync(10);
      expect(useChat.getState().threads[mika].find((m) => m.body === 'sí, me encanta')!.replyTo).toBe(welcome.id); // y en el servidor
      chat.sendText(mika, 'otra cosa');
      expect(useChat.getState().threads[mika].at(-1)!.replyTo).toBeNull();
    });

    it('no se puede responder a un mensaje borrado, a uno aún sin enviar ni a uno inexistente', async () => {
      const { chat, useChat, mika } = await boot();
      await chat.openConversation(mika);
      chat.sendText(mika, 'borrar');
      const provisional = useChat.getState().threads[mika].at(-1)!;
      chat.setReplyTarget(mika, provisional.id);                    // id negativo: todavía enviándose
      expect(useChat.getState().replyTarget[mika] ?? null).toBeNull();
      await vi.advanceTimersByTimeAsync(10);
      const real = useChat.getState().threads[mika].find((m) => m.body === 'borrar')!;
      await chat.removeMessage(mika, real.id);
      chat.setReplyTarget(mika, real.id);
      expect(useChat.getState().replyTarget[mika] ?? null).toBeNull();
      chat.setReplyTarget(mika, 424242);
      expect(useChat.getState().replyTarget[mika] ?? null).toBeNull();
    });

    it('si el mensaje al que respondías se borra mientras escribes, la respuesta se cancela y se envía normal', async () => {
      const { chat, useChat, mika } = await boot();
      await chat.openConversation(mika);
      chat.sendText(mika, 'va a desaparecer');
      await vi.advanceTimersByTimeAsync(10);
      const target = useChat.getState().threads[mika].find((m) => m.body === 'va a desaparecer')!;
      chat.setReplyTarget(mika, target.id);
      await chat.removeMessage(mika, target.id);
      expect(useChat.getState().replyTarget[mika]).toBeNull();
      chat.sendText(mika, 'sigo');
      expect(useChat.getState().threads[mika].at(-1)!.replyTo).toBeNull();
    });

    it('una respuesta que falla conserva su cita al reintentar', async () => {
      const { chat, useChat, backend, mika } = await boot();
      await chat.openConversation(mika);
      const welcome = useChat.getState().threads[mika][0];
      const real = backend.sendMessage.bind(backend);
      let fail = true;
      backend.sendMessage = async (id: string, input: any) => {
        if (fail) { fail = false; throw new Error('boom'); }
        return real(id, input);
      };
      chat.setReplyTarget(mika, welcome.id);
      chat.sendText(mika, 'con cita');
      await vi.advanceTimersByTimeAsync(10);
      const failed = useChat.getState().threads[mika].at(-1)!;
      expect(failed).toMatchObject({ failed: true, replyTo: welcome.id });
      chat.retryMessage(mika, failed.id);
      await vi.advanceTimersByTimeAsync(10);
      const ok = useChat.getState().threads[mika].find((m) => m.body === 'con cita')!;
      expect(ok.replyTo).toBe(welcome.id);
      expect(ok.failed).toBeFalsy();
    });

    it('compartir un anime desde una ficha NO arrastra una respuesta a medias', async () => {
      const { chat, useChat, mika } = await boot();
      await chat.openConversation(mika);
      chat.setReplyTarget(mika, useChat.getState().threads[mika][0].id);
      chat.sendAnime(mika, { id: 1, title: { romaji: 'X' }, coverImage: { large: 'https://s4.anilist.co/x.jpg' } });
      expect(useChat.getState().threads[mika].at(-1)!.replyTo).toBeNull();
      expect(useChat.getState().replyTarget[mika]).toBe(useChat.getState().threads[mika][0].id); // sigue pendiente
    });

    it('la cita de una respuesta ANTIGUA (fuera de la página cargada) se trae aparte', async () => {
      const { chat, useChat, backend, mika } = await boot();
      const old = await backend.sendMessage(mika, { body: 'mensaje muy antiguo' });
      await backend.sendMessage(mika, { body: 'respuesta lejana', replyTo: old.id });
      for (let i = 0; i < 55; i++) await backend.sendMessage(mika, { body: `relleno ${i}` }); // empuja al original fuera de la página
      await chat.loadThread(mika);
      expect(useChat.getState().threads[mika].some((m) => m.id === old.id)).toBe(false);
      await chat.loadOlder(mika);                                // trae la respuesta lejana (el original sigue fuera o dentro)
      await vi.advanceTimersByTimeAsync(10);
      const reply = useChat.getState().threads[mika].find((m) => m.body === 'respuesta lejana')!;
      expect(reply.replyTo).toBe(old.id);
      const quoted = chat.findQuoted(useChat.getState().threads[mika], useChat.getState().quotes, old.id);
      expect(quoted).toMatchObject({ id: old.id, body: 'mensaje muy antiguo' });
    });

    it('el servidor rechaza citar mensajes de otra conversación o borrados; el error se explica', async () => {
      const { chat, useChat, backend, mika } = await boot();
      await expect(backend.sendMessage(mika, { body: 'x', replyTo: 987654 })).rejects.toMatchObject({ code: 'not_found' });
      const m = await backend.sendMessage(mika, { body: 'ya no' });
      await backend.deleteMessage(m.id);
      await expect(backend.sendMessage(mika, { body: 'x', replyTo: m.id })).rejects.toMatchObject({ code: 'not_found' });
      // en la UI: queda como fallido con aviso claro
      await chat.openConversation(mika);
      const live = (await backend.sendMessage(mika, { body: 'vivo' }));
      await chat.loadThread(mika);
      chat.setReplyTarget(mika, live.id);
      await backend.deleteMessage(live.id);                      // se borra "por detrás" (otro dispositivo)
      chat.sendText(mika, 'respondo tarde');
      await vi.advanceTimersByTimeAsync(10);
      const sent = useChat.getState().threads[mika].find((x) => x.body === 'respondo tarde')!;
      expect(sent).toMatchObject({ failed: true, pending: false });
      expect(notices.some((n) => n.type === 'error' && /ya no existe/.test(n.message))).toBe(true);
    });
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
