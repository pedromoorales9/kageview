import { describe, it, expect } from 'vitest';
import { SupabaseBackend } from '../supabaseBackend';

const ME = '11111111-1111-4111-8111-111111111111';
const FRIEND = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

/** Cliente de Supabase simulado que registra cada operación CON sus argumentos. */
function fakeClient(results: Array<{ data?: unknown; error?: unknown }>) {
  const log: Array<{ where: string; op: string; args: unknown[] }> = [];
  const queue = [...results];
  const make = (where: string) => {
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ data: null, error: null, ...(queue.shift() ?? {}) }).then(res, rej);
        }
        return (...args: unknown[]) => { log.push({ where, op: prop, args }); return chain; };
      },
    });
    return chain;
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: ME } } }, error: null }) },
    from: (t: string) => make(t),
    rpc: (fn: string, args: unknown) => make(`rpc(${fn})`),
  };
  const backend = new SupabaseBackend('https://x.supabase.co', 'anon');
  (backend as unknown as { sb: unknown }).sb = client;
  return { backend, log };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 10, sender_id: ME, recipient_id: FRIEND, kind: 'text', body: 'hola', payload: null,
  created_at: '2026-10-01T10:00:00Z', read_at: null, deleted_at: null, ...over,
});

describe('SupabaseBackend: responder a mensajes', () => {
  it('lee reply_to de la fila (y es null si falta o no es un entero)', async () => {
    const { backend } = fakeClient([{ data: [row({ id: 1 }), row({ id: 2, reply_to: 1 }), row({ id: 3, reply_to: 'x' }), row({ id: 4, reply_to: 1.5 })] }]);
    const list = await backend.listMessages(FRIEND);
    // listMessages devuelve el orden cronológico (invierte lo recibido)
    expect(Object.fromEntries(list.map((m) => [m.id, m.replyTo]))).toEqual({ 1: null, 2: 1, 3: null, 4: null });
  });

  it('solo envía reply_to cuando se responde (el chat normal no depende de la migración)', async () => {
    const plain = fakeClient([{ data: row() }]);
    await plain.backend.sendMessage(FRIEND, { body: 'hola' });
    const insertPlain = plain.log.find((l) => l.op === 'insert')!.args[0] as Record<string, unknown>;
    expect('reply_to' in insertPlain).toBe(false);

    const reply = fakeClient([{ data: row({ id: 11, reply_to: 10 }) }]);
    const sent = await reply.backend.sendMessage(FRIEND, { body: 're', replyTo: 10 });
    expect((reply.log.find((l) => l.op === 'insert')!.args[0] as Record<string, unknown>).reply_to).toBe(10);
    expect(sent.replyTo).toBe(10);

    // ids no válidos se ignoran en vez de mandarse al servidor
    for (const bad of [0, -3, 1.5, NaN]) {
      const c = fakeClient([{ data: row() }]);
      await c.backend.sendMessage(FRIEND, { body: 'x', replyTo: bad });
      expect('reply_to' in (c.log.find((l) => l.op === 'insert')!.args[0] as Record<string, unknown>)).toBe(false);
    }
  });

  it('traduce los errores de la cita: inexistente/borrada/ajena → not_found; sin migración → unavailable', async () => {
    const invalid = fakeClient([{ error: { code: '23514', message: 'invalid reply' } }]);
    await expect(invalid.backend.sendMessage(FRIEND, { body: 'x', replyTo: 5 })).rejects.toMatchObject({ code: 'not_found' });

    const noColumn = fakeClient([{ error: { code: 'PGRST204', message: "Could not find the 'reply_to' column" } }]);
    await expect(noColumn.backend.sendMessage(FRIEND, { body: 'x', replyTo: 5 })).rejects.toMatchObject({ code: 'unavailable' });

    // 23514 sin cita (p. ej. mensaje vacío) NO se confunde con "cita inválida"
    const empty = fakeClient([{ error: { code: '23514', message: 'violates check constraint' } }]);
    await expect(empty.backend.sendMessage(FRIEND, { body: 'x' })).rejects.not.toMatchObject({ code: 'not_found' });
  });

  it('getMessagesByIds: pide solo ids válidos (sin duplicados, máx. 50) y descarta lo de otras conversaciones', async () => {
    const { backend, log } = fakeClient([{
      data: [row({ id: 1 }), row({ id: 2, sender_id: FRIEND, recipient_id: ME }), row({ id: 3, sender_id: STRANGER, recipient_id: ME })],
    }]);
    const ids = [1, 2, 3, 2, 1, -4, 0, 2.5, ...Array.from({ length: 80 }, (_, i) => 100 + i)];
    const got = await backend.getMessagesByIds(FRIEND, ids);
    const asked = log.find((l) => l.op === 'in')!.args[1] as number[];
    expect(asked.length).toBeLessThanOrEqual(50);
    expect(new Set(asked).size).toBe(asked.length);
    expect(asked.every((n) => Number.isInteger(n) && n > 0)).toBe(true);
    expect(got.map((m) => m.id)).toEqual([1, 2]);                 // el 3 es de un desconocido: fuera

    const none = fakeClient([]);
    expect(await none.backend.getMessagesByIds(FRIEND, [])).toEqual([]);
    expect(none.log).toHaveLength(0);
  });
});
