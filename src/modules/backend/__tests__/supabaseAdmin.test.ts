import { describe, it, expect } from 'vitest';
import { SupabaseBackend, mapError } from '../supabaseBackend';
import { BackendError } from '../types';

/**
 * Cliente de Supabase simulado: registra qué operaciones se lanzan sobre cada
 * tabla y devuelve, en orden, los resultados preparados.
 */
function fakeClient(results: Array<{ data?: unknown; error?: unknown }>, session: unknown = { user: { id: 'u1' } }) {
  const log: string[] = [];
  const queue = [...results];
  const makeChain = (label: string) => {
    const ops: string[] = [];
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            log.push(`${label}:${ops.join('.')}`);
            return Promise.resolve({ data: null, error: null, ...(queue.shift() ?? {}) }).then(res, rej);
          };
        }
        return () => { ops.push(prop); return chain; };
      },
    });
    return chain;
  };
  const client = {
    auth: { getSession: async () => ({ data: { session }, error: null }) },
    from: (table: string) => makeChain(table),
    rpc: (fn: string) => makeChain(`rpc(${fn})`),
  };
  const backend = new SupabaseBackend('https://x.supabase.co', 'anon');
  (backend as unknown as { sb: unknown }).sb = client;
  return { backend, log };
}

const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return (e as BackendError).code; }
  return 'ok';
};

describe('SupabaseBackend: servicios (regresión del "sesión caducada")', () => {
  it('desactivar un servicio nuevo actualiza y, si no existe, inserta (nunca upsert)', async () => {
    const { backend, log } = fakeClient([{ data: [] }, { data: null }]);
    await backend.adminSetProviderSwitch('animeflv', 'Caído');
    expect(log).toEqual(['provider_switches:update.eq.select', 'provider_switches:insert']);
    expect(log.join()).not.toContain('upsert');
  });

  it('cambiar el motivo de uno ya desactivado solo actualiza', async () => {
    const { backend, log } = fakeClient([{ data: [{ provider_id: 'animeflv' }] }]);
    await backend.adminSetProviderSwitch('animeflv', 'Sigue caído');
    expect(log).toEqual(['provider_switches:update.eq.select']);
  });

  it('reactivar borra la fila', async () => {
    const { backend, log } = fakeClient([{ data: [{ provider_id: 'animeflv' }] }, { data: [{ provider_id: 'animeflv' }] }]);
    await backend.adminSetProviderSwitch('animeflv', null);
    expect(log).toEqual(['provider_switches:select.eq', 'provider_switches:delete.eq.select']);
  });

  it('con sesión, "permission denied" es "forbidden" (no "sesión caducada")', async () => {
    const denied = { error: { code: '42501', message: 'permission denied for table provider_switches' } };
    const { backend } = fakeClient([denied]);
    expect(await code(backend.adminSetProviderSwitch('animeflv', 'x'))).toBe('forbidden');
  });

  it('sin sesión, el mismo error sigue siendo "not_authenticated"', async () => {
    const denied = { error: { code: '42501', message: 'permission denied for table provider_switches' } };
    const { backend } = fakeClient([denied], null);
    expect(await code(backend.adminSetProviderSwitch('animeflv', 'x'))).toBe('not_authenticated');
  });

  it('las RPC de administración con permiso denegado también dan "forbidden"', async () => {
    const { backend } = fakeClient([{ error: { code: '42501', message: 'forbidden' } }]);
    expect(await code(backend.adminSetRole('11111111-1111-4111-8111-111111111111', 'admin'))).toBe('forbidden');
  });
});

describe('SupabaseBackend: esquema antiguo (sin la migración 0005)', () => {
  const row = {
    id: 1, kind: 'info', display: 'banner', title: 'T', body: 'B', link_url: null, link_label: null,
    active: true, starts_at: '2026-01-01T00:00:00Z', expires_at: null, created_at: '2026-01-01T00:00:00Z',
  };

  it('reintenta sin las columnas nuevas y sigue funcionando', async () => {
    const { backend, log } = fakeClient([
      { error: { code: '42703', message: 'column announcements.platform does not exist' } },
      { data: [row] },
      { data: [row] },
    ]);
    const list = await backend.listActiveAnnouncements();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ platform: 'all', belowVersion: null });
    expect(log).toHaveLength(2);
    await backend.listActiveAnnouncements(); // ya recuerda el esquema: una sola consulta
    expect(log).toHaveLength(3);
  });

  it('no permite segmentar si la migración falta', async () => {
    const { backend } = fakeClient([{ error: { code: '42703', message: 'x' } }, { data: [row] }]);
    await backend.listActiveAnnouncements();
    expect(
      await code(backend.adminSaveAnnouncement({ kind: 'info', display: 'banner', title: '', body: 'x', platform: 'mac' }))
    ).toBe('unknown');
  });
});

describe('mapError: suspensión', () => {
  it('distingue suspendida, sin permiso y sesión', () => {
    expect(mapError({ code: '42501', message: 'suspended' }).code).toBe('suspended');
    expect(mapError({ code: '42501', message: 'new row violates row-level security policy for table "messages"' }).code).toBe('forbidden');
    expect(mapError({ code: '42501', message: 'permission denied for table x' }).code).toBe('not_authenticated');
  });
});
