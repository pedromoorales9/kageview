// ═══════════════════════════════════════════════════════════════════
// Pruebas de seguridad (RLS) del esquema de Supabase.
//
// Ejecuta las migraciones REALES sobre un Postgres (PGlite, WASM) al que se le
// añade un simulacro mínimo del entorno de Supabase: roles anon/authenticated,
// auth.users, auth.uid() y el esquema storage. Cada consulta se ejecuta con
// `SET LOCAL ROLE` + el claim `sub` del usuario, igual que hace PostgREST, de
// modo que las políticas RLS se aplican exactamente como en producción.
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
import path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../migrations');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as
    $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;

  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
`;

let db: PGlite;

const ids: Record<string, string> = {};

async function signup(key: string, username?: string, extra: Record<string, unknown> = {}) {
  const meta = JSON.stringify({ ...(username ? { username } : {}), ...extra });
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [`${key}@test.dev`, meta]
  );
  ids[key] = r.rows[0].id;
  return ids[key];
}

type Who = string | 'anon';

/** Ejecuta `fn` como ese usuario (o anónimo), en una transacción que se deshace. */
async function as<T>(who: Who, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  let out!: T;
  try {
    await db.transaction(async (tx) => {
      if (who === 'anon') {
        await tx.exec(`set local role anon`);
      } else {
        await tx.exec(`set local role authenticated`);
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids[who]]);
      }
      const q = async (sql: string, params?: unknown[]) => (await tx.query(sql, params)).rows as any[];
      out = await fn(q);
      // deshacer siempre: cada prueba parte del mismo estado
      throw new Error('__rollback__');
    });
  } catch (e) {
    if ((e as Error).message !== '__rollback__') throw e;
  }
  return out;
}

/** Como `as`, pero CONFIRMA la transacción (para flujos entre varios usuarios). */
async function asCommit<T>(who: string, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  let out!: T;
  await db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ids[who]]);
    out = await fn(async (sql, params) => (await tx.query(sql, params)).rows as any[]);
  });
  return out;
}

/** Igual que `as`, pero devuelve el mensaje de error si la consulta falla. */
async function asExpectError(who: Who, sql: string, params?: unknown[]): Promise<string> {
  try {
    await as(who, async (q) => q(sql, params));
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}

/** Ejecuta sin restricciones (como el dueño de la BD) para preparar datos. */
async function admin(sql: string, params?: unknown[]) {
  return (await db.query(sql, params)).rows as any[];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }

  await signup('alice', 'Alice_01');           // se normaliza a minúsculas
  await signup('bob', 'bob');
  await signup('carol', 'carol');
  await signup('dave', 'dave');
  await signup('eve', 'eve');                  // la "atacante"
});

// ═══════════════════════════════════════════════════════════════════
describe('alta de usuario (trigger)', () => {
  it('crea el perfil con el usuario en minúsculas', async () => {
    const r = await admin(`select username from public.profiles where id = $1`, [ids.alice]);
    expect(r[0].username).toBe('alice_01');
  });

  it('si el nombre ya existe genera uno alternativo en vez de fallar', async () => {
    const id = await signup('dup', 'alice_01');
    const r = await admin(`select username from public.profiles where id = $1`, [id]);
    expect(r[0].username).toMatch(/^user_[0-9a-f]{8}$/);
  });

  it('si el nombre es inválido genera uno alternativo', async () => {
    for (const bad of ['a', 'has space', 'ñandú', 'x'.repeat(30), '<script>']) {
      const id = await signup(`bad-${bad.length}-${Math.random()}`, bad);
      const r = await admin(`select username from public.profiles where id = $1`, [id]);
      expect(r[0].username).toMatch(/^user_[0-9a-f]{8}$/);
    }
  });

  it('username_available funciona para anónimos y distingue mayúsculas', async () => {
    expect((await as('anon', (q) => q(`select public.username_available('ALICE_01') as ok`)))[0].ok).toBe(false);
    expect((await as('anon', (q) => q(`select public.username_available('libre_123') as ok`)))[0].ok).toBe(true);
    expect((await as('anon', (q) => q(`select public.username_available('a') as ok`)))[0].ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('anónimos: no ven nada', () => {
  for (const table of ['profiles', 'friendships', 'library_entries', 'activity']) {
    it(`no puede leer ${table}`, async () => {
      const msg = await asExpectError('anon', `select * from public.${table}`);
      expect(msg).toMatch(/permission denied/i);
    });
  }
  it('no puede buscar usuarios ni enviar solicitudes', async () => {
    expect(await asExpectError('anon', `select * from public.search_profiles('ali')`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select public.send_friend_request('${ids.alice}')`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select public.delete_my_account()`)).toMatch(/permission denied/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('profiles', () => {
  it('cada usuario ve solo su propio perfil (no puede listar desconocidos)', async () => {
    const rows = await as('eve', (q) => q(`select username from public.profiles`));
    expect(rows.map((r) => r.username)).toEqual([expect.stringMatching(/^eve$/)]);
  });

  it('puede editar su perfil pero no el de otro', async () => {
    const own = await as('alice', (q) => q(`update public.profiles set bio = 'hola' where id = '${ids.alice}' returning bio`));
    expect(own[0].bio).toBe('hola');
    const other = await as('eve', (q) => q(`update public.profiles set bio = 'hackeado' where id = '${ids.alice}' returning bio`));
    expect(other).toHaveLength(0);
    expect((await admin(`select bio from public.profiles where id = $1`, [ids.alice]))[0].bio).toBeNull();
  });

  it('no puede cambiar su id ni created_at (columnas sin permiso de UPDATE)', async () => {
    expect(await asExpectError('eve', `update public.profiles set id = gen_random_uuid() where id = '${ids.eve}'`)).toMatch(/permission denied/i);
    expect(await asExpectError('eve', `update public.profiles set created_at = now() where id = '${ids.eve}'`)).toMatch(/permission denied/i);
  });

  it('valida formato del username y longitudes', async () => {
    expect(await asExpectError('eve', `update public.profiles set username = 'mal nombre' where id = '${ids.eve}'`)).toMatch(/check/i);
    expect(await asExpectError('eve', `update public.profiles set bio = '${'x'.repeat(201)}' where id = '${ids.eve}'`)).toMatch(/check/i);
    expect(await asExpectError('eve', `update public.profiles set username = 'alice_01' where id = '${ids.eve}'`)).toMatch(/unique|duplicate/i);
  });

  it('avatar_url solo admite https (nada de http:, javascript:, file:, data:)', async () => {
    for (const bad of ['http://evil.com/x.png', 'javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,AAAA', '//evil.com/x.png']) {
      expect(await asExpectError('eve', `update public.profiles set avatar_url = '${bad}' where id = '${ids.eve}'`)).toMatch(/check/i);
    }
    const ok = await as('eve', (q) => q(`update public.profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/${ids.eve}/avatar.webp?v=1' where id = '${ids.eve}' returning 1`));
    expect(ok).toHaveLength(1);
  });

  it('no puede insertar ni borrar perfiles directamente', async () => {
    expect(await asExpectError('eve', `insert into public.profiles (id, username) values (gen_random_uuid(), 'fake')`)).toMatch(/permission denied/i);
    expect(await asExpectError('eve', `delete from public.profiles where id = '${ids.eve}'`)).toMatch(/permission denied/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('search_profiles', () => {
  it('exige al menos 3 caracteres', async () => {
    expect(await as('alice', (q) => q(`select * from public.search_profiles('bo')`))).toHaveLength(0);
    expect(await as('alice', (q) => q(`select * from public.search_profiles('')`))).toHaveLength(0);
  });

  it('busca por prefijo, sin mayúsculas, y excluye al propio usuario', async () => {
    const r = await as('alice', (q) => q(`select username from public.search_profiles('BOB')`));
    expect(r.map((x) => x.username)).toEqual(['bob']);
    const self = await as('alice', (q) => q(`select username from public.search_profiles('alice')`));
    expect(self.map((x) => x.username)).not.toContain('alice_01');
  });

  it('solo devuelve campos públicos (sin flags de privacidad ni bio)', async () => {
    const r = await as('alice', (q) => q(`select * from public.search_profiles('bob')`));
    expect(Object.keys(r[0]).sort()).toEqual(['avatar_url', 'display_name', 'id', 'username']);
  });

  it('los comodines LIKE del texto del usuario no se interpretan', async () => {
    expect(await as('alice', (q) => q(`select * from public.search_profiles('%%%')`))).toHaveLength(0);
    expect(await as('alice', (q) => q(`select * from public.search_profiles('___')`))).toHaveLength(0);
  });

  it('devuelve como máximo 10 resultados', async () => {
    for (let i = 0; i < 14; i++) await signup(`many${i}`, `mass_user_${String(i).padStart(2, '0')}`);
    const r = await as('alice', (q) => q(`select * from public.search_profiles('mass')`));
    expect(r).toHaveLength(10);
    await admin(`delete from auth.users where email like 'many%@test.dev'`);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('amistades', () => {
  async function befriend(a: string, b: string) {
    await admin(
      `insert into public.friendships (requester_id, addressee_id, status, responded_at) values ($1,$2,'accepted',now())`,
      [ids[a], ids[b]]
    );
  }
  async function reset() {
    await admin(`delete from public.friendships`);
  }

  it('flujo completo: enviar → recibir → aceptar', async () => {
    await reset();
    const sent = await asCommit('alice', (q) => q(`select public.send_friend_request('${ids.bob}') as r`));
    expect(sent[0].r).toBe('sent');

    // ambos la ven; un tercero no
    expect(await as('alice', (q) => q(`select * from public.friendships`))).toHaveLength(1);
    expect(await as('bob', (q) => q(`select * from public.friendships`))).toHaveLength(1);
    expect(await as('eve', (q) => q(`select * from public.friendships`))).toHaveLength(0);

    // el destinatario ve el perfil de quien le escribió (solicitud pendiente)
    const seen = await as('bob', (q) => q(`select username from public.profiles where id = '${ids.alice}'`));
    expect(seen).toHaveLength(1);

    // todavía NO son amigos
    expect((await as('bob', (q) => q(`select public.are_friends('${ids.alice}','${ids.bob}') as f`)))[0].f).toBe(false);

    const reqId = (await admin(`select id from public.friendships`))[0].id;
    await asCommit('bob', async (q) => { await q(`select public.respond_friend_request(${reqId}, true)`); });

    expect((await as('alice', (q) => q(`select public.are_friends('${ids.alice}','${ids.bob}') as f`)))[0].f).toBe(true);
    expect((await admin(`select status, responded_at is not null as answered from public.friendships`))[0])
      .toEqual({ status: 'accepted', answered: true });
    // ahora ven el perfil el uno del otro
    expect(await as('alice', (q) => q(`select 1 from public.profiles where id = '${ids.bob}'`))).toHaveLength(1);
    await reset();
  });

  it('quien envía NO puede aceptar su propia solicitud', async () => {
    await reset();
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.alice, ids.bob]);
    const reqId = (await admin(`select id from public.friendships`))[0].id;
    expect(await asExpectError('alice', `select public.respond_friend_request(${reqId}, true)`)).toMatch(/not found/i);
    await reset();
  });

  it('un tercero no puede aceptar ni rechazar solicitudes ajenas', async () => {
    await reset();
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.alice, ids.bob]);
    const reqId = (await admin(`select id from public.friendships`))[0].id;
    expect(await asExpectError('eve', `select public.respond_friend_request(${reqId}, true)`)).toMatch(/not found/i);
    expect(await asExpectError('eve', `select public.respond_friend_request(${reqId}, false)`)).toMatch(/not found/i);
    await reset();
  });

  it('rechazar borra la solicitud', async () => {
    await reset();
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.alice, ids.bob]);
    const reqId = (await admin(`select id from public.friendships`))[0].id;
    const left = await as('bob', async (q) => {
      await q(`select public.respond_friend_request(${reqId}, false)`);
      return q(`select * from public.friendships`);
    });
    expect(left).toHaveLength(0);
    await reset();
  });

  it('no hay INSERT/UPDATE directo sobre friendships (evita auto-aceptarse)', async () => {
    await reset();
    expect(await asExpectError('eve', `insert into public.friendships (requester_id, addressee_id, status) values ('${ids.eve}','${ids.alice}','accepted')`)).toMatch(/permission denied/i);
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.alice, ids.eve]);
    // la destinataria intenta hacerse amiga de un tercero cambiando la fila
    expect(await asExpectError('eve', `update public.friendships set status='accepted' where addressee_id='${ids.eve}'`)).toMatch(/permission denied/i);
    expect(await asExpectError('eve', `update public.friendships set requester_id='${ids.bob}' where addressee_id='${ids.eve}'`)).toMatch(/permission denied/i);
    await reset();
  });

  it('valida objetivos inválidos y duplicados', async () => {
    await reset();
    expect(await asExpectError('alice', `select public.send_friend_request('${ids.alice}')`)).toMatch(/invalid target/i);
    expect(await asExpectError('alice', `select public.send_friend_request(gen_random_uuid())`)).toMatch(/not found/i);
    expect(await asExpectError('alice', `select public.send_friend_request(null)`)).toMatch(/invalid target/i);

    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.alice, ids.bob]);
    expect(await asExpectError('alice', `select public.send_friend_request('${ids.bob}')`)).toMatch(/already sent/i);
    await reset();
    await befriend('alice', 'bob');
    expect(await asExpectError('alice', `select public.send_friend_request('${ids.bob}')`)).toMatch(/already friends/i);
    expect(await asExpectError('bob', `select public.send_friend_request('${ids.alice}')`)).toMatch(/already friends/i);
    await reset();
  });

  it('si la otra persona ya me envió una solicitud, enviarla acepta directamente', async () => {
    await reset();
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.bob, ids.alice]);
    const r = await as('alice', async (q) => {
      const res = await q(`select public.send_friend_request('${ids.bob}') as r`);
      const st = await q(`select status from public.friendships`);
      return { res: res[0].r, st: st[0].status };
    });
    expect(r).toEqual({ res: 'accepted', st: 'accepted' });
    await reset();
  });

  it('cualquiera de las dos partes puede eliminar la amistad; un tercero no', async () => {
    await reset();
    await befriend('alice', 'bob');
    expect(await as('eve', (q) => q(`delete from public.friendships returning id`))).toHaveLength(0);
    expect(await as('bob', (q) => q(`delete from public.friendships returning id`))).toHaveLength(1);
    expect(await as('alice', (q) => q(`delete from public.friendships returning id`))).toHaveLength(1);
    await reset();
  });

  it('limita a 100 las solicitudes pendientes enviadas', async () => {
    await reset();
    const extra: string[] = [];
    for (let i = 0; i < 100; i++) extra.push(await signup(`f${i}`, `flood_${String(i).padStart(3, '0')}`));
    for (const id of extra) await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.eve, id]);
    expect(await asExpectError('eve', `select public.send_friend_request('${ids.alice}')`)).toMatch(/too many/i);
    await reset();
    await admin(`delete from auth.users where email like 'f%@test.dev' and email <> 'friend@test.dev'`);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('visibilidad entre amigos: perfiles, listas y actividad', () => {
  beforeAll(async () => {
    await admin(`delete from public.friendships`);
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [ids.alice, ids.bob]);
    await admin(`update public.profiles set show_activity = true, show_library = true`);
    await admin(
      `insert into public.library_entries (user_id, media_type, media_id, status, progress, media)
       values ($1,'anime',1,'CURRENT',3,'{"title":"X"}')`, [ids.alice]);
    await admin(
      `insert into public.activity (user_id, media_id, title, episode) values ($1,1,'Anime X',3)`, [ids.alice]);
  });

  it('un amigo ve el perfil, la lista y la actividad', async () => {
    expect(await as('bob', (q) => q(`select 1 from public.profiles where id = '${ids.alice}'`))).toHaveLength(1);
    expect(await as('bob', (q) => q(`select 1 from public.library_entries where user_id = '${ids.alice}'`))).toHaveLength(1);
    expect(await as('bob', (q) => q(`select 1 from public.activity where user_id = '${ids.alice}'`))).toHaveLength(1);
  });

  it('un desconocido no ve NADA de ella', async () => {
    expect(await as('eve', (q) => q(`select 1 from public.profiles where id = '${ids.alice}'`))).toHaveLength(0);
    expect(await as('eve', (q) => q(`select 1 from public.library_entries`))).toHaveLength(0);
    expect(await as('eve', (q) => q(`select 1 from public.activity`))).toHaveLength(0);
  });

  it('una solicitud PENDIENTE no da acceso a la lista ni a la actividad', async () => {
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.eve, ids.alice]);
    expect(await as('eve', (q) => q(`select 1 from public.library_entries`))).toHaveLength(0);
    expect(await as('eve', (q) => q(`select 1 from public.activity`))).toHaveLength(0);
    // (sí puede ver el perfil básico de a quien le ha escrito)
    expect(await as('eve', (q) => q(`select 1 from public.profiles where id = '${ids.alice}'`))).toHaveLength(1);
    await admin(`delete from public.friendships where requester_id = $1`, [ids.eve]);
  });

  it('show_activity=false oculta la actividad a los amigos, pero no al dueño', async () => {
    await admin(`update public.profiles set show_activity = false where id = $1`, [ids.alice]);
    expect(await as('bob', (q) => q(`select 1 from public.activity where user_id = '${ids.alice}'`))).toHaveLength(0);
    expect(await as('alice', (q) => q(`select 1 from public.activity where user_id = '${ids.alice}'`))).toHaveLength(1);
    // la lista sigue visible: son ajustes independientes
    expect(await as('bob', (q) => q(`select 1 from public.library_entries where user_id = '${ids.alice}'`))).toHaveLength(1);
    await admin(`update public.profiles set show_activity = true where id = $1`, [ids.alice]);
  });

  it('show_library=false oculta la lista a los amigos', async () => {
    await admin(`update public.profiles set show_library = false where id = $1`, [ids.alice]);
    expect(await as('bob', (q) => q(`select 1 from public.library_entries where user_id = '${ids.alice}'`))).toHaveLength(0);
    expect(await as('alice', (q) => q(`select 1 from public.library_entries`))).toHaveLength(1);
    await admin(`update public.profiles set show_library = true where id = $1`, [ids.alice]);
  });

  it('un amigo NO puede modificar ni borrar la lista ni la actividad del otro', async () => {
    const upd = await as('bob', (q) => q(`update public.library_entries set progress = 99 where user_id = '${ids.alice}' returning 1`));
    expect(upd).toHaveLength(0);
    const del = await as('bob', (q) => q(`delete from public.library_entries where user_id = '${ids.alice}' returning 1`));
    expect(del).toHaveLength(0);
    expect(await as('bob', (q) => q(`update public.activity set title='x' where user_id = '${ids.alice}' returning 1`))).toHaveLength(0);
    expect(await as('bob', (q) => q(`delete from public.activity where user_id = '${ids.alice}' returning 1`))).toHaveLength(0);
    expect((await admin(`select progress from public.library_entries where user_id = $1`, [ids.alice]))[0].progress).toBe(3);
  });

  it('al eliminar la amistad se pierde el acceso', async () => {
    await admin(`delete from public.friendships`);
    expect(await as('bob', (q) => q(`select 1 from public.library_entries`))).toHaveLength(0);
    expect(await as('bob', (q) => q(`select 1 from public.activity`))).toHaveLength(0);
    expect(await as('bob', (q) => q(`select 1 from public.profiles where id = '${ids.alice}'`))).toHaveLength(0);
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [ids.alice, ids.bob]);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('library_entries', () => {
  it('el dueño hace CRUD completo', async () => {
    const r = await as('carol', async (q) => {
      await q(`insert into public.library_entries (user_id, media_type, media_id, status, progress) values ('${ids.carol}','anime',10,'PLANNING',0)`);
      await q(`update public.library_entries set status='CURRENT', progress=2 where user_id='${ids.carol}' and media_id=10`);
      const mid = await q(`select status, progress from public.library_entries where media_id=10`);
      await q(`delete from public.library_entries where media_id=10`);
      const after = await q(`select 1 from public.library_entries where media_id=10`);
      return { mid: mid[0], after: after.length };
    });
    expect(r).toEqual({ mid: { status: 'CURRENT', progress: 2 }, after: 0 });
  });

  it('no puede insertar entradas a nombre de otro usuario', async () => {
    expect(await asExpectError('eve', `insert into public.library_entries (user_id, media_type, media_id, status) values ('${ids.alice}','anime',77,'CURRENT')`)).toMatch(/row-level security/i);
  });

  it('no puede reasignar una entrada propia a otro usuario', async () => {
    const msg = await (async () => {
      try {
        await as('carol', async (q) => {
          await q(`insert into public.library_entries (user_id, media_type, media_id, status) values ('${ids.carol}','anime',11,'CURRENT')`);
          await q(`update public.library_entries set user_id='${ids.alice}' where media_id=11`);
        });
      } catch (e) { return (e as Error).message; }
      return '';
    })();
    expect(msg).toMatch(/row-level security|violates/i);
  });

  it('valida estado, tipo, progreso, puntuación y tamaño de la instantánea', async () => {
    const ins = (cols: string, vals: string) =>
      asExpectError('carol', `insert into public.library_entries (user_id, ${cols}) values ('${ids.carol}', ${vals})`);
    expect(await ins('media_type, media_id, status', `'anime',1,'HACKED'`)).toMatch(/check/i);
    expect(await ins('media_type, media_id, status', `'game',1,'CURRENT'`)).toMatch(/check/i);
    expect(await ins('media_type, media_id, status', `'anime',-5,'CURRENT'`)).toMatch(/check/i);
    expect(await ins('media_type, media_id, status, progress', `'anime',1,'CURRENT',-1`)).toMatch(/check/i);
    expect(await ins('media_type, media_id, status, score', `'anime',1,'CURRENT',101`)).toMatch(/check/i);
    expect(await ins('media_type, media_id, status, media', `'anime',1,'CURRENT', jsonb_build_object('x', repeat('a', 25000))`)).toMatch(/check/i);
  });

  it('upsert idempotente por (usuario, tipo, media)', async () => {
    const r = await as('carol', async (q) => {
      const sql = `insert into public.library_entries (user_id, media_type, media_id, status, progress)
                   values ('${ids.carol}','anime',12,'CURRENT',1)
                   on conflict (user_id, media_type, media_id) do update set progress = excluded.progress`;
      await q(sql);
      await q(sql.replace(',1)', ',5)'));
      return q(`select progress from public.library_entries where media_id=12`);
    });
    expect(r).toEqual([{ progress: 5 }]);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('activity', () => {
  it('el dueño hace upsert y puede marcarla inactiva', async () => {
    const r = await as('dave', async (q) => {
      const upsert = (ep: number) => q(`insert into public.activity (user_id, media_id, title, episode) values ('${ids.dave}',5,'Show',${ep})
               on conflict (user_id) do update set episode = excluded.episode, active = true`);
      await upsert(1);
      await upsert(2);   // el segundo cae en el ON CONFLICT
      await q(`update public.activity set active = false where user_id='${ids.dave}'`);
      return q(`select episode, active from public.activity`);
    });
    expect(r).toEqual([{ episode: 2, active: false }]);
  });

  it('no puede escribir actividad a nombre de otro', async () => {
    expect(await asExpectError('eve', `insert into public.activity (user_id, media_id, title) values ('${ids.alice}',1,'x')`)).toMatch(/row-level security/i);
  });

  it('valida longitudes', async () => {
    expect(await asExpectError('dave', `insert into public.activity (user_id, media_id, title) values ('${ids.dave}',1,'${'x'.repeat(201)}')`)).toMatch(/check/i);
  });

  it('cover_url solo admite https', async () => {
    expect(await asExpectError('dave', `insert into public.activity (user_id, media_id, title, cover_url) values ('${ids.dave}',1,'t','http://evil.com/a.jpg')`)).toMatch(/check/i);
    expect(await asExpectError('dave', `insert into public.activity (user_id, media_id, title, cover_url) values ('${ids.dave}',1,'t','https://s4.anilist.co/a.jpg')`)).toBe('');
  });

  it('updated_at se actualiza en el servidor (no se puede falsear)', async () => {
    await admin(`insert into public.activity (user_id, media_id, title, updated_at) values ($1,1,'t','2000-01-01') on conflict (user_id) do update set updated_at='2000-01-01'`, [ids.dave]);
    const r = await as('dave', async (q) => {
      await q(`update public.activity set episode = 9, updated_at = '1999-01-01' where user_id='${ids.dave}'`);
      return q(`select extract(year from updated_at) as y from public.activity`);
    });
    expect(Number(r[0].y)).toBeGreaterThanOrEqual(2026);
    await admin(`delete from public.activity where user_id = $1`, [ids.dave]);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('delete_my_account', () => {
  it('borra perfil, lista, actividad y amistades en cascada', async () => {
    const id = await signup('leaver', 'leaver');
    await admin(`insert into public.library_entries (user_id, media_type, media_id, status) values ($1,'anime',1,'CURRENT')`, [id]);
    await admin(`insert into public.activity (user_id, media_id, title) values ($1,1,'t')`, [id]);
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [id, ids.alice]);

    await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id]);
      await tx.exec(`select public.delete_my_account()`);
    });

    for (const t of ['profiles', 'library_entries', 'activity']) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      expect(await admin(`select 1 from public.${t} where ${col} = $1`, [id])).toHaveLength(0);
    }
    expect(await admin(`select 1 from public.friendships where requester_id = $1`, [id])).toHaveLength(0);
    // …y no toca a nadie más
    expect(await admin(`select 1 from public.profiles where id = $1`, [ids.alice])).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('storage: avatares', () => {
  it('el bucket es público, limitado a 512 KB y solo imágenes', async () => {
    const b = await admin(`select public, file_size_limit, allowed_mime_types from storage.buckets where id='avatars'`);
    expect(b[0].public).toBe(true);
    expect(Number(b[0].file_size_limit)).toBe(524288);
    expect(b[0].allowed_mime_types).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('un usuario puede subir a SU carpeta pero no a la de otro', async () => {
    const own = await asExpectError('eve', `insert into storage.objects (bucket_id, name) values ('avatars','${ids.eve}/avatar.webp')`);
    expect(own).toBe('');
    const other = await asExpectError('eve', `insert into storage.objects (bucket_id, name) values ('avatars','${ids.alice}/avatar.webp')`);
    expect(other).toMatch(/row-level security/i);
    const root = await asExpectError('eve', `insert into storage.objects (bucket_id, name) values ('avatars','avatar.webp')`);
    expect(root).toMatch(/row-level security/i);
    const wrongBucket = await asExpectError('eve', `insert into storage.objects (bucket_id, name) values ('otro','${ids.eve}/x.webp')`);
    expect(wrongBucket).toMatch(/row-level security/i);
  });

  it('no puede reemplazar ni borrar el avatar de otro', async () => {
    await admin(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ids.alice}/avatar.webp`]);
    expect(await as('eve', (q) => q(`update storage.objects set name = '${ids.eve}/stolen.webp' where name = '${ids.alice}/avatar.webp' returning 1`))).toHaveLength(0);
    expect(await as('eve', (q) => q(`delete from storage.objects where name = '${ids.alice}/avatar.webp' returning 1`))).toHaveLength(0);
    // …ni "mover" el suyo a la carpeta de otro
    await admin(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${ids.eve}/mine.webp`]);
    expect(await asExpectError('eve', `update storage.objects set name = '${ids.alice}/pwn.webp' where name = '${ids.eve}/mine.webp'`)).toMatch(/row-level security/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('chat entre amigos', () => {
  const friendsAB = async () => {
    await admin(`delete from public.messages`);
    await admin(`delete from public.friendships`);
    await admin(`insert into public.friendships (requester_id, addressee_id, status, responded_at) values ($1,$2,'accepted',now())`, [ids.alice, ids.bob]);
  };
  const say = (who: string, to: string, body: string) =>
    asCommit(who, (q) => q(`insert into public.messages (recipient_id, body) values ('${ids[to]}', $1) returning id`, [body]));

  it('los amigos se leen entre sí; un tercero no ve nada', async () => {
    await friendsAB();
    await say('alice', 'bob', 'hola bob');
    await say('bob', 'alice', 'hola alice');
    const a = await as('alice', (q) => q(`select body, sender_id from public.messages order by id`));
    const b = await as('bob', (q) => q(`select body from public.messages order by id`));
    expect(a.map((m) => m.body)).toEqual(['hola bob', 'hola alice']);
    expect(b).toHaveLength(2);
    expect(await as('eve', (q) => q(`select 1 from public.messages`))).toHaveLength(0);
    expect(await as('carol', (q) => q(`select 1 from public.messages`))).toHaveLength(0);
  });

  it('el remitente es siempre quien escribe (no se puede suplantar)', async () => {
    await friendsAB();
    const m = await say('alice', 'bob', 'quién soy');
    expect((await admin(`select sender_id from public.messages where id = $1`, [m[0].id]))[0].sender_id).toBe(ids.alice);
    // intentar poner otro remitente / fechas / estado: sin privilegio sobre esas columnas
    for (const col of [`sender_id = '${ids.bob}'`, `created_at = '2000-01-01'`, `read_at = now()`, `deleted_at = now()`, `id = 1`]) {
      const [name, val] = col.split(' = ');
      expect(await asExpectError('alice', `insert into public.messages (recipient_id, body, ${name}) values ('${ids.bob}','x', ${val})`)).toMatch(/permission denied|non-DEFAULT/i);
    }
  });

  it('solo entre amigos ACEPTADOS: ni desconocidos, ni solicitud pendiente, ni uno mismo', async () => {
    await friendsAB();
    expect(await asExpectError('eve', `insert into public.messages (recipient_id, body) values ('${ids.alice}','spam')`)).toMatch(/row-level security/i);
    await admin(`insert into public.friendships (requester_id, addressee_id) values ($1,$2)`, [ids.eve, ids.carol]); // pendiente
    expect(await asExpectError('eve', `insert into public.messages (recipient_id, body) values ('${ids.carol}','hola?')`)).toMatch(/row-level security/i);
    expect(await asExpectError('alice', `insert into public.messages (recipient_id, body) values ('${ids.alice}','yo a mí')`)).toMatch(/check|row-level/i);
    await admin(`delete from public.friendships where requester_id = $1`, [ids.eve]);
  });

  it('valida el contenido: vacío, demasiado largo, tipo y payload', async () => {
    await friendsAB();
    const ins = (cols: string, vals: string) => asExpectError('alice', `insert into public.messages (recipient_id, ${cols}) values ('${ids.bob}', ${vals})`);
    expect(await ins('body', `''`)).toMatch(/check/i);
    expect(await ins('body', `'   '`)).toMatch(/check/i);
    expect(await ins('body', `'${'x'.repeat(2001)}'`)).toMatch(/check/i);
    expect(await ins('body', `'${'x'.repeat(2000)}'`)).toBe('');
    expect(await ins('kind, body', `'gif','x'`)).toMatch(/check/i);
    expect(await ins('kind', `'anime'`)).toMatch(/check/i);                                  // anime sin payload
    expect(await ins('kind, payload', `'anime', '{"id":1,"title":{"romaji":"A"}}'::jsonb`)).toBe('');
    expect(await ins('kind, payload', `'anime', jsonb_build_object('x', repeat('a', 5000))`)).toMatch(/check/i);
  });

  it('no hay UPDATE ni DELETE directos sobre los mensajes', async () => {
    await friendsAB();
    await say('alice', 'bob', 'intocable');
    expect(await asExpectError('alice', `update public.messages set body = 'editado'`)).toMatch(/permission denied/i);
    expect(await asExpectError('alice', `delete from public.messages`)).toMatch(/permission denied/i);
    expect(await asExpectError('bob', `update public.messages set read_at = null`)).toMatch(/permission denied/i);
  });

  it('mark_conversation_read: solo marca lo que ME han enviado y devuelve cuántos', async () => {
    await friendsAB();
    await say('alice', 'bob', 'uno'); await say('alice', 'bob', 'dos'); await say('bob', 'alice', 'respuesta');
    // el remitente no puede "marcar" sus propios mensajes como leídos
    const own = await asCommit('alice', (q) => q(`select public.mark_conversation_read('${ids.bob}') as n`));
    expect(own[0].n).toBe(1);                       // solo la respuesta de bob
    const bob = await asCommit('bob', (q) => q(`select public.mark_conversation_read('${ids.alice}') as n`));
    expect(bob[0].n).toBe(2);                       // uno y dos
    expect((await asCommit('bob', (q) => q(`select public.mark_conversation_read('${ids.alice}') as n`)))[0].n).toBe(0); // idempotente
    // un desconocido no marca nada
    expect((await asCommit('eve', (q) => q(`select public.mark_conversation_read('${ids.alice}') as n`)))[0].n).toBe(0);
    expect(await admin(`select 1 from public.messages where read_at is null`)).toHaveLength(0);
  });

  it('delete_message: solo el autor, "borrado suave" y ya no se puede repetir', async () => {
    await friendsAB();
    const m = await say('alice', 'bob', 'me arrepiento');
    const id = m[0].id;
    expect(await asExpectError('bob', `select public.delete_message(${id})`)).toMatch(/not found/i);   // el destinatario no puede
    expect(await asExpectError('eve', `select public.delete_message(${id})`)).toMatch(/not found/i);
    await asCommit('alice', async (q) => { await q(`select public.delete_message(${id})`); });
    const row = (await admin(`select body, payload, deleted_at is not null as deleted from public.messages where id = $1`, [id]))[0];
    expect(row).toEqual({ body: '', payload: null, deleted: true });
    expect(await asExpectError('alice', `select public.delete_message(${id})`)).toMatch(/not found/i);
    // el borrado de un mensaje de anime también respeta los checks
    const a = await asCommit('alice', (q) => q(`insert into public.messages (recipient_id, kind, payload) values ('${ids.bob}','anime','{"id":5,"title":{"romaji":"X"}}'::jsonb) returning id`));
    await asCommit('alice', async (q) => { await q(`select public.delete_message(${a[0].id})`); });
  });

  it('al eliminar la amistad la conversación deja de ser legible, y vuelve si se recupera', async () => {
    await friendsAB();
    await say('alice', 'bob', 'privado');
    await admin(`delete from public.friendships`);
    expect(await as('alice', (q) => q(`select 1 from public.messages`))).toHaveLength(0);
    expect(await as('bob', (q) => q(`select 1 from public.messages`))).toHaveLength(0);
    expect(await asExpectError('alice', `insert into public.messages (recipient_id, body) values ('${ids.bob}','¿sigues ahí?')`)).toMatch(/row-level security/i);
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [ids.bob, ids.alice]);
    expect(await as('alice', (q) => q(`select 1 from public.messages`))).toHaveLength(1);
  });

  it('anti-flood: máximo 20 mensajes cada 10 s por remitente', async () => {
    await friendsAB();
    for (let i = 0; i < 20; i++) await say('alice', 'bob', `m${i}`);
    expect(await asExpectError('alice', `insert into public.messages (recipient_id, body) values ('${ids.bob}','el 21')`)).toMatch(/too many messages/i);
    // el otro extremo no queda bloqueado por el flood de alice
    expect(await asExpectError('bob', `insert into public.messages (recipient_id, body) values ('${ids.alice}','yo sí puedo')`)).toBe('');
    await admin(`delete from public.messages`);
  });

  it('chat_summary: último mensaje y no leídos por amigo, sin filtrar conversaciones ajenas', async () => {
    await friendsAB();
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [ids.carol, ids.alice]);
    await say('bob', 'alice', 'b1'); await say('bob', 'alice', 'b2'); await say('carol', 'alice', 'c1'); await say('alice', 'carol', 'a-a-carol');
    const sum = await as('alice', (q) => q(`select friend_id, last_body, unread from public.chat_summary()`));
    const byFriend = Object.fromEntries(sum.map((r) => [r.friend_id, r]));
    expect(sum).toHaveLength(2);
    expect(byFriend[ids.bob]).toMatchObject({ last_body: 'b2', unread: 2 });
    expect(byFriend[ids.carol]).toMatchObject({ last_body: 'a-a-carol', unread: 1 });
    // bob solo ve su propia conversación con alice
    const forBob = await as('bob', (q) => q(`select friend_id from public.chat_summary()`));
    expect(forBob.map((r) => r.friend_id)).toEqual([ids.alice]);
    expect(await as('eve', (q) => q(`select * from public.chat_summary()`))).toHaveLength(0);
    await admin(`delete from public.friendships where requester_id = $1`, [ids.carol]);
  });

  it('los anónimos no pueden leer, escribir ni usar las funciones del chat', async () => {
    expect(await asExpectError('anon', `select * from public.messages`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `insert into public.messages (recipient_id, body) values ('${ids.bob}','x')`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select * from public.chat_summary()`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select public.mark_conversation_read('${ids.bob}')`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select public.delete_message(1)`)).toMatch(/permission denied/i);
  });

  it('al eliminar la cuenta se borran sus mensajes (en cascada)', async () => {
    await friendsAB();
    const id = await signup('ghost', 'ghost');
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [id, ids.alice]);
    await asCommit('ghost', (q) => q(`insert into public.messages (recipient_id, body) values ('${ids.alice}','adiós')`));
    expect(await admin(`select 1 from public.messages where sender_id = $1`, [id])).toHaveLength(1);
    await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id]);
      await tx.exec(`select public.delete_my_account()`);
    });
    expect(await admin(`select 1 from public.messages where sender_id = $1`, [id])).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('administración: roles, anuncios y servicios', () => {
  const ann = (extra = '') =>
    `insert into public.announcements (kind, display, title, body${extra ? ', ' + extra.split('|')[0] : ''}) values ('info','banner','T','Hola a todos'${extra ? ', ' + extra.split('|')[1] : ''}) returning id`;

  beforeAll(async () => {
    await admin(`update public.profiles set role = 'owner' where id = $1`, [ids.alice]);
    await admin(`update public.profiles set role = 'admin' where id = $1`, [ids.bob]);
    await admin(`delete from public.announcements`);
    await admin(`delete from public.provider_switches`);
  });

  it('por defecto todos son "user" y solo puede haber un owner', async () => {
    expect((await admin(`select role from public.profiles where id = $1`, [ids.carol]))[0].role).toBe('user');
    expect(await admin(`select count(*)::int as n from public.profiles where role = 'owner'`)).toEqual([{ n: 1 }]);
    await expect(admin(`update public.profiles set role = 'owner' where id = $1`, [ids.carol])).rejects.toThrow(/unique/i);
  });

  it('nadie puede cambiar su propio rol desde el cliente', async () => {
    for (const who of ['carol', 'bob', 'alice']) {
      expect(await asExpectError(who, `update public.profiles set role = 'owner' where id = '${ids[who]}'`)).toMatch(/permission denied/i);
      expect(await asExpectError(who, `update public.profiles set role = 'admin' where id = '${ids[who]}'`)).toMatch(/permission denied/i);
    }
    expect((await admin(`select role from public.profiles where id = $1`, [ids.carol]))[0].role).toBe('user');
  });

  it('un perfil nuevo no puede nacer con rol elevado vía metadatos del alta', async () => {
    const id = await signup('sneaky', 'sneaky', { role: 'owner' });
    expect((await admin(`select role from public.profiles where id = $1`, [id]))[0].role).toBe('user');
  });

  it('el staff publica anuncios; un usuario normal no', async () => {
    const r = await asCommit('bob', (q) => q(ann()));
    expect(r).toHaveLength(1);
    expect((await admin(`select created_by from public.announcements where id = $1`, [r[0].id]))[0].created_by).toBe(ids.bob);
    expect(await asExpectError('carol', ann())).toMatch(/row-level security/i);
    expect(await asExpectError('eve', ann())).toMatch(/row-level security/i);
    expect(await asExpectError('anon', ann())).toMatch(/permission denied/i);
  });

  it('no se puede falsear el autor ni las fechas de sistema', async () => {
    for (const col of ['created_by', 'created_at', 'updated_at', 'id']) {
      expect(
        await asExpectError('bob', `insert into public.announcements (body, ${col}) values ('x', ${col === 'id' ? '999' : col === 'created_by' ? `'${ids.alice}'` : `'2000-01-01'`})`)
      ).toMatch(/permission denied|non-DEFAULT/i);
    }
  });

  it('valida el contenido: vacío, larguísimo, tipo, enlace no https y caducidad', async () => {
    const ins = (cols: string, vals: string) => asExpectError('alice', `insert into public.announcements (${cols}) values (${vals})`);
    expect(await ins('body', `''`)).toMatch(/check/i);
    expect(await ins('body', `'   '`)).toMatch(/check/i);
    expect(await ins('body', `'${'x'.repeat(601)}'`)).toMatch(/check/i);
    expect(await ins('body', `'${'x'.repeat(600)}'`)).toBe('');
    expect(await ins('body, kind', `'x','spam'`)).toMatch(/check/i);
    expect(await ins('body, display', `'x','popup'`)).toMatch(/check/i);
    expect(await ins('body, title', `'x','${'t'.repeat(81)}'`)).toMatch(/check/i);
    expect(await ins('body, link_url', `'x','http://inseguro.dev'`)).toMatch(/check/i);
    expect(await ins('body, link_url', `'x','javascript:alert(1)'`)).toMatch(/check/i);
    expect(await ins('body, link_url', `'x','https://ok.dev/a'`)).toBe('');
    expect(await ins('body, starts_at, expires_at', `'x', now(), now() - interval '1 day'`)).toMatch(/check/i);
  });

  it('todos (incluso anónimos) ven solo los anuncios vigentes', async () => {
    await admin(`delete from public.announcements`);
    await admin(`insert into public.announcements (body, title) values ('vigente','ok')`);
    await admin(`insert into public.announcements (body, title, active) values ('pausado','off', false)`);
    await admin(`insert into public.announcements (body, title, starts_at) values ('futuro','soon', now() + interval '1 day')`);
    await admin(`insert into public.announcements (body, title, starts_at, expires_at) values ('caducado','old', now() - interval '2 days', now() - interval '1 day')`);
    for (const who of ['anon', 'carol', 'eve']) {
      const r = await as(who, (q) => q(`select title from public.announcements order by id`));
      expect(r.map((x) => x.title)).toEqual(['ok']);
    }
    // el staff ve también los pausados, programados y caducados
    for (const who of ['alice', 'bob']) {
      expect(await as(who, (q) => q(`select 1 from public.announcements`))).toHaveLength(4);
    }
  });

  it('el staff edita y borra; un usuario normal no puede (RLS filtra sin error)', async () => {
    await admin(`delete from public.announcements`);
    const [{ id }] = await admin(`insert into public.announcements (body) values ('original') returning id`);
    expect(await as('carol', (q) => q(`update public.announcements set body = 'hackeado' where id = ${id} returning id`))).toHaveLength(0);
    expect(await as('carol', (q) => q(`delete from public.announcements where id = ${id} returning id`))).toHaveLength(0);
    expect((await admin(`select body from public.announcements where id = $1`, [id]))[0].body).toBe('original');

    expect(await as('bob', (q) => q(`update public.announcements set body = 'corregido', active = false where id = ${id} returning id`))).toHaveLength(1);
    // un admin no puede reasignar el autor
    expect(await asExpectError('bob', `update public.announcements set created_by = '${ids.carol}' where id = ${id}`)).toMatch(/permission denied/i);
    expect(await as('bob', (q) => q(`delete from public.announcements where id = ${id} returning id`))).toHaveLength(1);
  });

  it('servicios desactivados: lectura pública, escritura solo del staff', async () => {
    await admin(`delete from public.provider_switches`);
    await asCommit('bob', (q) => q(`insert into public.provider_switches (provider_id, reason) values ('animeflv', 'Caído')`));
    for (const who of ['anon', 'carol']) {
      const r = await as(who, (q) => q(`select provider_id, reason from public.provider_switches`));
      expect(r).toEqual([{ provider_id: 'animeflv', reason: 'Caído' }]);
    }
    expect(await asExpectError('carol', `insert into public.provider_switches (provider_id, reason) values ('jkanime','x')`)).toMatch(/row-level security/i);
    expect(await asExpectError('anon', `insert into public.provider_switches (provider_id, reason) values ('jkanime','x')`)).toMatch(/permission denied/i);
    expect(await as('carol', (q) => q(`delete from public.provider_switches returning provider_id`))).toHaveLength(0);
    expect(await as('carol', (q) => q(`update public.provider_switches set reason = 'x' returning provider_id`))).toHaveLength(0);
    expect(await asExpectError('bob', `insert into public.provider_switches (provider_id) values ('Mal Id!')`)).toMatch(/check/i);
    expect(await as('bob', (q) => q(`update public.provider_switches set reason = 'Mantenimiento' returning provider_id`))).toHaveLength(1);
    expect((await admin(`select updated_by from public.provider_switches`))[0].updated_by).toBe(ids.bob);
    expect(await as('bob', (q) => q(`delete from public.provider_switches returning provider_id`))).toHaveLength(1);
  });

  it('regresión: el upsert de PostgREST no vale para provider_switches; actualizar-y-luego-insertar sí', async () => {
    await admin(`delete from public.provider_switches`);
    // PostgREST hace ON CONFLICT DO UPDATE de TODAS las columnas enviadas, incluida la
    // clave, sobre la que el staff no tiene UPDATE → "permission denied" (la app lo
    // mostraba como "sesión caducada"). La app usa el flujo de abajo.
    expect(
      await asExpectError('bob', `insert into public.provider_switches (provider_id, reason) values ('animeflv','x')
        on conflict (provider_id) do update set provider_id = excluded.provider_id, reason = excluded.reason`)
    ).toMatch(/permission denied/i);

    const upd = () => as('bob', (q) => q(`update public.provider_switches set reason = 'r2' where provider_id = 'animeflv' returning provider_id`));
    expect(await upd()).toHaveLength(0);                                                  // no existe: nada que actualizar
    await asCommit('bob', (q) => q(`insert into public.provider_switches (provider_id, reason) values ('animeflv','r1')`));
    expect(await asCommit('bob', (q) => q(`update public.provider_switches set reason = 'r2' where provider_id = 'animeflv' returning reason`))).toEqual([{ reason: 'r2' }]);
    await admin(`delete from public.provider_switches`);
  });

  it('solo el owner nombra o quita admins; al owner no se le puede tocar', async () => {
    // el admin (no owner) no puede
    expect(await asExpectError('bob', `select public.set_user_role('${ids.carol}', 'admin')`)).toMatch(/forbidden/i);
    expect(await asExpectError('carol', `select public.set_user_role('${ids.carol}', 'admin')`)).toMatch(/forbidden/i);
    expect(await asExpectError('anon', `select public.set_user_role('${ids.carol}', 'admin')`)).toMatch(/permission denied/i);

    // el owner sí, pero solo entre user/admin
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.carol}', 'admin')`));
    expect((await admin(`select role from public.profiles where id = $1`, [ids.carol]))[0].role).toBe('admin');
    expect(await asExpectError('alice', `select public.set_user_role('${ids.carol}', 'owner')`)).toMatch(/invalid role/i);
    expect(await asExpectError('alice', `select public.set_user_role('${ids.carol}', 'root')`)).toMatch(/invalid role/i);
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.carol}', 'user')`));
    expect((await admin(`select role from public.profiles where id = $1`, [ids.carol]))[0].role).toBe('user');

    // ni siquiera el propio owner puede degradarse (protege del "me quedé sin owner")
    expect(await asExpectError('alice', `select public.set_user_role('${ids.alice}', 'user')`)).toMatch(/forbidden/i);
    expect(await asExpectError('alice', `select public.set_user_role('00000000-0000-0000-0000-000000000000', 'admin')`)).toMatch(/not found/i);
  });

  it('un admin degradado pierde los permisos al instante', async () => {
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.dave}', 'admin')`));
    expect(await as('dave', (q) => q(ann()))).toHaveLength(1);
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.dave}', 'user')`));
    expect(await asExpectError('dave', ann())).toMatch(/row-level security/i);
  });

  it('list_staff y admin_stats: solo para el staff', async () => {
    const staff = await as('bob', (q) => q(`select username, role from public.list_staff()`));
    expect(staff).toEqual([
      { username: 'alice_01', role: 'owner' },
      { username: 'bob', role: 'admin' },
    ]);
    const stats = await as('alice', (q) => q(`select * from public.admin_stats()`));
    expect(Number(stats[0].users_total)).toBeGreaterThanOrEqual(5);
    for (const fn of ['list_staff()', 'admin_stats()']) {
      expect(await asExpectError('carol', `select * from public.${fn}`)).toMatch(/forbidden/i);
      expect(await asExpectError('anon', `select * from public.${fn}`)).toMatch(/permission denied/i);
    }
  });

  it('el rol es visible para amigos (insignia) pero no se filtra a desconocidos', async () => {
    await admin(`delete from public.friendships`);
    await admin(`insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted')`, [ids.carol, ids.alice]);
    expect((await as('carol', (q) => q(`select role from public.profiles where id = '${ids.alice}'`)))[0].role).toBe('owner');
    expect(await as('eve', (q) => q(`select role from public.profiles where id = '${ids.alice}'`))).toHaveLength(0);
    await admin(`delete from public.friendships`);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('administración v2: auditoría, suspensiones, segmentación y usuarios', () => {
  const audit = (where = '') => admin(`select actor_name, action, target, detail from public.admin_audit ${where} order by id`);
  const befriend = async (a: string, b: string) => {
    await admin(`delete from public.friendships`);
    await admin(`insert into public.friendships (requester_id, addressee_id, status, responded_at) values ($1,$2,'accepted',now())`, [ids[a], ids[b]]);
  };

  beforeAll(async () => {
    await admin(`update public.profiles set role = 'owner' where id = $1`, [ids.alice]);
    await admin(`update public.profiles set role = 'admin' where id = $1`, [ids.bob]);
    await admin(`update public.profiles set role = 'user' where id in ($1, $2, $3)`, [ids.carol, ids.dave, ids.eve]);
    await admin(`delete from public.announcements`);
    await admin(`delete from public.provider_switches`);
    await admin(`delete from public.suspensions`);
  });

  // ── Auditoría ─────────────────────────────────────────
  it('registra quién crea, edita, pausa y borra anuncios', async () => {
    await admin(`delete from public.admin_audit`);
    const [{ id }] = await asCommit('bob', (q) => q(`insert into public.announcements (title, body, kind) values ('Hola','x','update') returning id`));
    await asCommit('bob', (q) => q(`update public.announcements set body = 'y' where id = ${id}`));
    await asCommit('bob', (q) => q(`update public.announcements set active = false where id = ${id}`));
    await asCommit('bob', (q) => q(`update public.announcements set active = true where id = ${id}`));
    await asCommit('bob', (q) => q(`delete from public.announcements where id = ${id}`));
    const rows = await audit();
    expect(rows.map((r) => r.action)).toEqual([
      'announcement.create', 'announcement.update', 'announcement.pause', 'announcement.resume', 'announcement.delete',
    ]);
    expect(rows.every((r) => r.actor_name === 'bob')).toBe(true);
    expect(rows[0].detail).toMatchObject({ title: 'Hola', kind: 'update' });
  });

  it('no registra ruido: un UPDATE que no cambia nada visible (p. ej. al borrar al autor) no deja rastro', async () => {
    await admin(`delete from public.admin_audit`);
    const gone = await signup('temp_admin', 'temp_admin');
    await admin(`update public.profiles set role = 'admin' where id = $1`, [gone]);
    await admin(`delete from public.admin_audit`);
    await asCommit('temp_admin', (q) => q(`insert into public.announcements (body) values ('de alguien que se irá')`));
    await admin(`delete from public.admin_audit`);
    await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [gone]);
      await tx.exec(`select public.delete_my_account()`);
    });
    expect(await audit(`where action like 'announcement.%'`)).toHaveLength(0);
    await admin(`delete from public.announcements`);
  });

  it('registra servicios y cambios de rol', async () => {
    await admin(`delete from public.admin_audit`);
    await asCommit('bob', (q) => q(`insert into public.provider_switches (provider_id, reason) values ('jkanime','Caído')`));
    await asCommit('bob', (q) => q(`update public.provider_switches set reason = 'Sigue caído' where provider_id = 'jkanime'`));
    await asCommit('bob', (q) => q(`delete from public.provider_switches where provider_id = 'jkanime'`));
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.carol}', 'admin')`));
    await asCommit('alice', (q) => q(`select public.set_user_role('${ids.carol}', 'user')`));
    const rows = await audit();
    expect(rows.map((r) => `${r.actor_name}:${r.action}:${r.target}`)).toEqual([
      'bob:service.disable:jkanime', 'bob:service.reason:jkanime', 'bob:service.enable:jkanime',
      'alice_01:team.role:carol', 'alice_01:team.role:carol',
    ]);
    expect(rows[3].detail).toEqual({ from: 'user', to: 'admin' });
  });

  it('un cambio de rol hecho desde el SQL Editor queda como "sistema"', async () => {
    await admin(`delete from public.admin_audit`);
    await admin(`update public.profiles set role = 'admin' where id = $1`, [ids.dave]);
    await admin(`update public.profiles set role = 'user' where id = $1`, [ids.dave]);
    expect((await audit()).map((r) => r.actor_name)).toEqual(['sistema', 'sistema']);
  });

  it('el registro solo lo lee el staff y NADIE puede manipularlo', async () => {
    await asCommit('bob', (q) => q(`insert into public.announcements (body) values ('para el registro')`));
    expect((await as('alice', (q) => q(`select 1 from public.admin_audit`))).length).toBeGreaterThan(0);
    expect((await as('bob', (q) => q(`select 1 from public.admin_audit`))).length).toBeGreaterThan(0);
    expect(await as('carol', (q) => q(`select 1 from public.admin_audit`))).toHaveLength(0);
    expect(await asExpectError('anon', `select 1 from public.admin_audit`)).toMatch(/permission denied/i);
    for (const who of ['alice', 'bob', 'carol']) {
      expect(await asExpectError(who, `insert into public.admin_audit (action) values ('falso')`)).toMatch(/permission denied/i);
      expect(await asExpectError(who, `update public.admin_audit set action = 'x'`)).toMatch(/permission denied/i);
      expect(await asExpectError(who, `delete from public.admin_audit`)).toMatch(/permission denied/i);
      expect(await asExpectError(who, `select public.audit('falso', 'x')`)).toMatch(/permission denied/i);
    }
    await admin(`delete from public.announcements`);
  });

  // ── Segmentación ──────────────────────────────────────
  it('segmentación: plataforma y versión validadas', async () => {
    const ins = (cols: string, vals: string) => asExpectError('bob', `insert into public.announcements (body, ${cols}) values ('x', ${vals})`);
    expect(await ins('platform', `'mac'`)).toBe('');
    expect(await ins('platform', `'windows'`)).toBe('');
    expect(await ins('platform', `'android'`)).toMatch(/check/i);
    expect(await ins('below_version', `'1.4.0'`)).toBe('');
    for (const bad of ['1.4', 'v1.4.0', '1.4.0-beta', '1.4.0; drop table x', '']) {
      expect(await ins('below_version', `'${bad}'`)).toMatch(/check/i);
    }
    expect(await asExpectError('carol', `insert into public.announcements (body, platform) values ('x','mac')`)).toMatch(/row-level security/i);
    await admin(`delete from public.announcements`);
  });

  // ── Suspensiones ──────────────────────────────────────
  it('un usuario suspendido no puede escribir, pedir amistad, publicar actividad ni editar su perfil', async () => {
    await befriend('carol', 'alice');
    await asCommit('carol', (q) => q(`insert into public.messages (recipient_id, body) values ('${ids.alice}','antes')`));
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.carol}', true, 'Spam')`));

    expect(await asExpectError('carol', `insert into public.messages (recipient_id, body) values ('${ids.alice}','después')`)).toMatch(/row-level security/i);
    expect(await asExpectError('carol', `select public.send_friend_request('${ids.eve}')`)).toMatch(/suspended/i);
    expect(await asExpectError('carol', `insert into public.activity (user_id, media_id, title) values ('${ids.carol}', 1, 'x')`)).toMatch(/row-level security/i);
    expect(await as('carol', (q) => q(`update public.profiles set bio = 'sigo aquí' where id = '${ids.carol}' returning id`))).toHaveLength(0);

    // sigue pudiendo LEER lo suyo y borrar su cuenta
    expect((await as('carol', (q) => q(`select body from public.messages`))).map((m) => m.body)).toEqual(['antes']);
    expect(await as('carol', (q) => q(`select 1 from public.profiles where id = '${ids.carol}'`))).toHaveLength(1);
  });

  it('reactivar devuelve los permisos', async () => {
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.carol}', false)`));
    expect(await as('carol', (q) => q(`insert into public.messages (recipient_id, body) values ('${ids.alice}','ya puedo') returning id`))).toHaveLength(1);
    expect(await as('carol', (q) => q(`update public.profiles set bio = 'de vuelta' where id = '${ids.carol}' returning id`))).toHaveLength(1);
  });

  it('solo el staff suspende, y nunca a otro staff; queda registrado', async () => {
    await admin(`delete from public.admin_audit`);
    for (const who of ['carol', 'eve']) {
      expect(await asExpectError(who, `select public.admin_set_suspended('${ids.dave}', true)`)).toMatch(/forbidden/i);
    }
    expect(await asExpectError('anon', `select public.admin_set_suspended('${ids.dave}', true)`)).toMatch(/permission denied/i);
    expect(await asExpectError('bob', `select public.admin_set_suspended('${ids.alice}', true)`)).toMatch(/forbidden/i);   // owner
    expect(await asExpectError('alice', `select public.admin_set_suspended('${ids.bob}', true)`)).toMatch(/forbidden/i);   // admin
    expect(await asExpectError('bob', `select public.admin_set_suspended('00000000-0000-0000-0000-000000000000', true)`)).toMatch(/not found/i);

    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', true, '${'x'.repeat(300)}')`));
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', false)`));
    const rows = await audit(`where action like 'user.%'`);
    expect(rows.map((r) => `${r.action}:${r.target}`)).toEqual(['user.suspend:eve', 'user.unsuspend:eve']);
    expect(rows[0].detail.reason).toHaveLength(200);                                       // el motivo se recorta
  });

  it('cada persona ve su propia suspensión, el staff todas, el resto ninguna', async () => {
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', true, 'Motivo X')`));
    expect(await as('eve', (q) => q(`select reason from public.suspensions`))).toEqual([{ reason: 'Motivo X' }]);
    expect(await as('carol', (q) => q(`select 1 from public.suspensions`))).toHaveLength(0);
    expect(await as('alice', (q) => q(`select 1 from public.suspensions`))).toHaveLength(1);
    expect(await asExpectError('eve', `delete from public.suspensions`)).toMatch(/permission denied/i);
    expect(await asExpectError('eve', `insert into public.suspensions (user_id) values ('${ids.carol}')`)).toMatch(/permission denied/i);
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', false)`));
  });

  // ── Usuarios y registros ──────────────────────────────
  it('admin_list_users: búsqueda, paginación, total y sin correos', async () => {
    const all = await as('bob', (q) => q(`select * from public.admin_list_users()`));
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(Number(all[0].total)).toBe(all.length);
    expect(Object.keys(all[0])).not.toContain('email');

    const hit = await as('bob', (q) => q(`select username from public.admin_list_users('alice')`));
    expect(hit.map((r) => r.username)).toEqual(['alice_01']);
    expect(await as('bob', (q) => q(`select 1 from public.admin_list_users('zzzz_no_existe')`))).toHaveLength(0);
    // comodines LIKE escapados: "%" no devuelve todo
    expect(await as('bob', (q) => q(`select 1 from public.admin_list_users('%')`))).toHaveLength(0);

    const page1 = await as('bob', (q) => q(`select username from public.admin_list_users('', 2, 0)`));
    const page2 = await as('bob', (q) => q(`select username from public.admin_list_users('', 2, 2)`));
    expect(page1).toHaveLength(2);
    expect(page2.map((r) => r.username)).not.toEqual(page1.map((r) => r.username));
    expect(await as('bob', (q) => q(`select 1 from public.admin_list_users('', 100000, 0)`))).not.toHaveLength(0); // límite acotado a 100

    for (const who of ['carol', 'anon']) {
      expect(await asExpectError(who, `select * from public.admin_list_users()`)).toMatch(who === 'anon' ? /permission denied/i : /forbidden/i);
    }
  });

  it('admin_list_users refleja roles y suspensión', async () => {
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', true, 'Prueba')`));
    const rows = await as('alice', (q) => q(`select username, role, suspended, suspended_reason from public.admin_list_users('eve')`));
    expect(rows).toEqual([{ username: 'eve', role: 'user', suspended: true, suspended_reason: 'Prueba' }]);
    expect((await as('alice', (q) => q(`select role from public.admin_list_users('alice')`)))[0].role).toBe('owner');
    await asCommit('bob', (q) => q(`select public.admin_set_suspended('${ids.eve}', false)`));
  });

  it('admin_signups: un punto por día, con ceros, y suma = usuarios', async () => {
    const rows = await as('alice', (q) => q(`select day, n from public.admin_signups(30)`));
    expect(rows).toHaveLength(30);
    const total = (await admin(`select count(*)::int as n from public.profiles where created_at::date >= current_date - 29`))[0].n;
    expect(rows.reduce((t, r) => t + Number(r.n), 0)).toBe(total);
    expect(await as('alice', (q) => q(`select 1 from public.admin_signups(1)`))).toHaveLength(7);     // mínimo 7
    expect(await as('alice', (q) => q(`select 1 from public.admin_signups(9999)`))).toHaveLength(90);  // máximo 90
    expect(await asExpectError('carol', `select * from public.admin_signups()`)).toMatch(/forbidden/i);
    expect(await asExpectError('anon', `select * from public.admin_signups()`)).toMatch(/permission denied/i);
  });
});

// ═══════════════════════════════════════════════════════════════════
describe('manga en la cuenta: sincronización, amigos y chat', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    source: 'mangadex',
    manga_id: 'uuid-1',
    status: 'reading',
    manga: { id: 'uuid-1', sourceId: 'mangadex', title: 'Frieren', coverUrl: 'https://uploads.example/c.jpg', status: 'ongoing', tags: [] },
    last_chapter_id: 'ch-9',
    last_chapter_number: '9',
    last_page: 4,
    last_page_count: 20,
    last_read_at: '2026-09-20T10:00:00Z',
    read_ranges: [[1, 9]],
    read_reset_at: null,
    deleted: false,
    updated_at: '2026-09-20T10:00:00Z',
    ...over,
  });
  const push = (who: string, items: unknown[]) =>
    asCommit(who, (q) => q(`select public.manga_sync_push($1::jsonb) as n`, [JSON.stringify(items)]));
  const pushErr = (who: string, items: unknown) =>
    asExpectError(who, `select public.manga_sync_push($1::jsonb)`, [JSON.stringify(items)]);
  const rowsOf = (who: string, where = '') => as(who, (q) => q(`select source, manga_id, status, deleted, updated_at, last_page, read_ranges from public.manga_entries ${where} order by manga_id`));

  const befriend = async (a: string, b: string) => {
    await admin(`delete from public.friendships`);
    await admin(`insert into public.friendships (requester_id, addressee_id, status, responded_at) values ($1,$2,'accepted',now())`, [ids[a], ids[b]]);
  };

  beforeAll(async () => {
    await admin(`delete from public.manga_entries`);
    await admin(`delete from public.reading_activity`);
    await admin(`delete from public.friendships`);
    await admin(`update public.profiles set show_library = true, show_activity = true`);
    await admin(`delete from public.suspensions`);
  });

  // ── Escritura: solo por la función ───────────────────
  it('sincroniza una entrada y solo su dueño la ve', async () => {
    expect((await push('carol', [entry()]))[0].n).toBe(1);
    expect(await rowsOf('carol')).toMatchObject([{ source: 'mangadex', manga_id: 'uuid-1', status: 'reading', last_page: 4 }]);
    expect(await rowsOf('eve')).toHaveLength(0);
    expect(await as('anon', (q) => q(`select 1`)).catch(() => 1)).toBeTruthy();
    expect(await asExpectError('anon', `select * from public.manga_entries`)).toMatch(/permission denied/i);
    expect(await asExpectError('anon', `select public.manga_sync_push('[]'::jsonb)`)).toMatch(/permission denied/i);
  });

  it('no se puede escribir directamente en la tabla (ni insertar, ni editar, ni borrar)', async () => {
    const e = entry();
    expect(await asExpectError('carol', `insert into public.manga_entries (user_id, source, manga_id, manga, updated_at) values ('${ids.carol}', 'x1', 'a', '{"title":"x"}', now())`)).toMatch(/permission denied/i);
    expect(await asExpectError('carol', `update public.manga_entries set status = 'completed'`)).toMatch(/permission denied/i);
    expect(await asExpectError('carol', `delete from public.manga_entries`)).toMatch(/permission denied/i);
    expect(e.source).toBe('mangadex');
  });

  it('nadie puede escribir en la biblioteca de otro (la función usa siempre auth.uid())', async () => {
    await push('eve', [entry({ manga_id: 'de-eve', manga: { id: 'de-eve', sourceId: 'mangadex', title: 'Mío' } })]);
    expect((await rowsOf('eve')).map((r) => r.manga_id)).toEqual(['de-eve']);
    expect((await rowsOf('carol')).map((r) => r.manga_id)).toEqual(['uuid-1']);
    await admin(`delete from public.manga_entries where user_id = $1`, [ids.eve]);
  });

  // ── Conflictos ───────────────────────────────────────
  it('gana el sello más nuevo; uno más viejo no pisa', async () => {
    await push('carol', [entry({ status: 'completed', last_page: 19, updated_at: '2026-09-20T12:00:00Z' })]);
    expect((await rowsOf('carol'))[0]).toMatchObject({ status: 'completed', last_page: 19 });
    const n = (await push('carol', [entry({ status: 'dropped', last_page: 0, updated_at: '2026-09-20T11:00:00Z' })]))[0].n;
    expect(n).toBe(0);
    expect((await rowsOf('carol'))[0]).toMatchObject({ status: 'completed', last_page: 19 });
    // sello igual tampoco pisa
    expect((await push('carol', [entry({ status: 'dropped', updated_at: '2026-09-20T12:00:00Z' })]))[0].n).toBe(0);
  });

  it('un sello en el futuro se recorta (no bloquea la fila)', async () => {
    await push('dave', [entry({ manga_id: 'fut', manga: { id: 'fut', sourceId: 'mangadex', title: 'F' }, updated_at: '2999-01-01T00:00:00Z' })]);
    const r = await admin(`select updated_at <= now() + interval '11 minutes' as ok from public.manga_entries where user_id = $1 and manga_id = 'fut'`, [ids.dave]);
    expect(r[0].ok).toBe(true);
    await admin(`delete from public.manga_entries where user_id = $1`, [ids.dave]);
  });

  it('las entradas borradas conservan la marca para que otros dispositivos se enteren', async () => {
    await push('carol', [entry({ deleted: true, status: null, updated_at: '2026-09-21T00:00:00Z' })]);
    expect((await rowsOf('carol'))[0]).toMatchObject({ deleted: true, status: null });
  });

  // ── Validación ───────────────────────────────────────
  it('rechaza datos inválidos', async () => {
    const bad: Array<[string, Record<string, unknown>]> = [
      ['fuente inválida', { source: 'Mala Fuente!' }],
      ['fuente vacía', { source: '' }],
      ['id vacío', { manga_id: '' }],
      ['id larguísimo', { manga_id: 'x'.repeat(201) }],
      ['estado desconocido', { status: 'leyendo' }],
      ['ficha no objeto', { manga: 'texto' }],
      ['título vacío', { manga: { title: '' } }],
      ['título enorme', { manga: { title: 'x'.repeat(301) } }],
      ['portada http', { manga: { title: 'T', coverUrl: 'http://inseguro.dev/c.jpg' } }],
      ['portada javascript', { manga: { title: 'T', coverUrl: 'javascript:alert(1)' } }],
      ['ficha gigante', { manga: { title: 'T', descripcion: 'x'.repeat(9000) } }],
      ['página negativa', { last_page: -1 }],
      ['página absurda', { last_page: 999999 }],
      ['capítulo larguísimo', { last_chapter_number: 'x'.repeat(21) }],
      ['rangos no array', { read_ranges: { a: 1 } }],
      ['rango invertido', { read_ranges: [[5, 1]] }],
      ['rango de 3', { read_ranges: [[1, 2, 3]] }],
      ['rango con texto', { read_ranges: [['a', 2]] }],
      ['rango negativo', { read_ranges: [[-1, 2]] }],
      ['rango enorme', { read_ranges: [[1, 999999]] }],
      ['demasiados rangos', { read_ranges: Array.from({ length: 2001 }, (_, i) => [i, i]) }],
    ];
    for (const [why, over] of bad) {
      const msg = await pushErr('eve', [entry({ manga_id: `v-${why}`.slice(0, 40), ...over })]);
      expect(msg, why).not.toBe('');
    }
    expect(await rowsOf('eve')).toHaveLength(0); // nada se coló
    expect(await pushErr('eve', { no: 'array' })).toMatch(/invalid payload/i);
    expect(await pushErr('eve', 'texto')).toMatch(/invalid payload/i);
    expect(await pushErr('eve', Array.from({ length: 101 }, (_, i) => entry({ manga_id: `m${i}` })))).toMatch(/invalid payload/i);
    expect(await pushErr('eve', [{ source: 'mangadex' }])).toMatch(/invalid entry/i);
    expect(await pushErr('eve', [entry(), 'no-objeto'])).toMatch(/invalid entry/i);
    expect(await rowsOf('eve')).toHaveLength(0);
  });

  it('acepta rangos válidos (enteros, decimales y vacíos) y hasta 100 entradas por llamada', async () => {
    expect((await push('eve', [entry({ manga_id: 'ok1', manga: { title: 'a' }, read_ranges: [[1, 45], [47, 47], [12.5, 12.5]] })]))[0].n).toBe(1);
    expect((await push('eve', [entry({ manga_id: 'ok2', manga: { title: 'b' }, read_ranges: [] })]))[0].n).toBe(1);
    const hundred = Array.from({ length: 100 }, (_, i) => entry({ manga_id: `lote${i}`, manga: { title: `L${i}` }, updated_at: '2026-09-22T00:00:00Z' }));
    expect((await push('eve', hundred))[0].n).toBe(100);
    await admin(`delete from public.manga_entries where user_id = $1`, [ids.eve]);
  });

  it('una llamada con un error no aplica NADA (todo o nada)', async () => {
    expect(await pushErr('eve', [entry({ manga_id: 'bueno', manga: { title: 'B' } }), entry({ manga_id: 'malo', status: 'roto' })])).not.toBe('');
    expect(await rowsOf('eve')).toHaveLength(0);
  });

  it('tope de entradas por usuario', async () => {
    await admin(
      `insert into public.manga_entries (user_id, source, manga_id, manga, updated_at)
       select $1, 'mangadex', 'bulk' || g, '{"title":"x"}'::jsonb, now() from generate_series(1, 3000) g`,
      [ids.dave]
    );
    expect(await pushErr('dave', [entry({ manga_id: 'uno-mas', manga: { title: 'M' } })])).toMatch(/too many entries/i);
    await admin(`delete from public.manga_entries where user_id = $1`, [ids.dave]);
  });

  // ── Amigos ───────────────────────────────────────────
  it('los amigos ven la biblioteca (no el historial suelto ni lo borrado) si el dueño la comparte', async () => {
    await admin(`delete from public.manga_entries where user_id = $1`, [ids.carol]);
    await push('carol', [
      entry({ manga_id: 'en-biblioteca', manga: { title: 'A' } }),
      entry({ manga_id: 'solo-historial', manga: { title: 'B' }, status: null }),
      entry({ manga_id: 'borrado', manga: { title: 'C' }, deleted: true }),
    ]);
    await befriend('carol', 'alice');

    expect((await rowsOf('alice', `where user_id = '${ids.carol}'`)).map((r) => r.manga_id)).toEqual(['en-biblioteca']);
    expect((await rowsOf('carol')).map((r) => r.manga_id)).toEqual(['borrado', 'en-biblioteca', 'solo-historial']); // el dueño lo ve todo
    expect(await rowsOf('eve', `where user_id = '${ids.carol}'`)).toHaveLength(0);                                 // un desconocido, nada
  });

  it('si el dueño oculta su lista, los amigos dejan de verla (y él sigue viéndola)', async () => {
    await admin(`update public.profiles set show_library = false where id = $1`, [ids.carol]);
    expect(await rowsOf('alice', `where user_id = '${ids.carol}'`)).toHaveLength(0);
    expect((await rowsOf('carol')).length).toBe(3);
    await admin(`update public.profiles set show_library = true where id = $1`, [ids.carol]);
    expect(await rowsOf('alice', `where user_id = '${ids.carol}'`)).toHaveLength(1);
  });

  it('dejar de ser amigos corta el acceso', async () => {
    await admin(`delete from public.friendships`);
    expect(await rowsOf('alice', `where user_id = '${ids.carol}'`)).toHaveLength(0);
  });

  // ── Actividad de lectura ─────────────────────────────
  const reading = (who: string, extra = '') =>
    asCommit(who, (q) => q(`insert into public.reading_activity (user_id, source, manga_id, title, cover_url, chapter, page, page_count) values ('${ids[who]}', 'mangadex', 'u1', 'Frieren', 'https://x.dev/c.jpg', '9', 3, 20) ${extra}`));

  it('"leyendo ahora": solo los amigos, y respetando show_activity', async () => {
    await admin(`delete from public.reading_activity`);
    await befriend('carol', 'alice');
    await reading('carol');
    expect(await as('alice', (q) => q(`select title, chapter from public.reading_activity`))).toEqual([{ title: 'Frieren', chapter: '9' }]);
    expect(await as('eve', (q) => q(`select 1 from public.reading_activity`))).toHaveLength(0);
    await admin(`update public.profiles set show_activity = false where id = $1`, [ids.carol]);
    expect(await as('alice', (q) => q(`select 1 from public.reading_activity`))).toHaveLength(0);
    expect(await as('carol', (q) => q(`select 1 from public.reading_activity`))).toHaveLength(1);
    await admin(`update public.profiles set show_activity = true where id = $1`, [ids.carol]);
    expect(await asExpectError('anon', `select * from public.reading_activity`)).toMatch(/permission denied/i);
  });

  it('solo se puede escribir la propia actividad, con datos válidos', async () => {
    expect(await asExpectError('eve', `update public.reading_activity set title = 'hackeada' where user_id = '${ids.carol}'`)).toBe('');
    expect((await admin(`select title from public.reading_activity where user_id = $1`, [ids.carol]))[0].title).toBe('Frieren'); // 0 filas afectadas
    expect(await asExpectError('eve', `insert into public.reading_activity (user_id, source, manga_id, title) values ('${ids.carol}', 'mangadex', 'x', 'suplanto')`)).toMatch(/row-level security/i);
    expect(await as('eve', (q) => q(`delete from public.reading_activity where user_id = '${ids.carol}' returning 1`))).toHaveLength(0);
    for (const bad of [`cover_url = 'http://x.dev/c.jpg'`, `page = -1`, `title = ''`, `source = 'MAL FUENTE'`]) {
      expect(await asExpectError('carol', `update public.reading_activity set ${bad}`)).toMatch(/check|violates/i);
    }
  });

  it('un usuario suspendido no publica su lectura', async () => {
    await admin(`delete from public.reading_activity where user_id = $1`, [ids.eve]);
    await admin(`insert into public.suspensions (user_id, reason) values ($1, 'x')`, [ids.eve]);
    expect(await asExpectError('eve', `insert into public.reading_activity (user_id, source, manga_id, title) values ('${ids.eve}', 'mangadex', 'x', 'T')`)).toMatch(/row-level security/i);
    await admin(`delete from public.suspensions`);
  });

  // ── Chat: compartir manga ────────────────────────────
  it('se puede compartir un manga con un amigo; con ficha completa', async () => {
    await admin(`delete from public.messages`);
    await befriend('carol', 'alice');
    const share = (who: string, to: string, payload: unknown, extra = 'manga') =>
      asExpectError(who, `insert into public.messages (recipient_id, kind, payload) values ('${ids[to]}', '${extra}', $1::jsonb)`, [JSON.stringify(payload)]);
    const ok = { id: 'u1', sourceId: 'mangadex', title: 'Frieren', coverUrl: 'https://x.dev/c.jpg' };
    expect(await share('carol', 'alice', ok)).toBe('');
    expect(await share('carol', 'alice', { id: 'u1', title: 'sin fuente' })).toMatch(/check/i);
    expect(await share('carol', 'alice', { sourceId: 'mangadex', title: 'sin id' })).toMatch(/check/i);
    expect(await share('carol', 'alice', 'texto')).toMatch(/check/i);
    expect(await share('carol', 'alice', null)).toMatch(/check/i);
    expect(await share('carol', 'alice', { ...ok, extra: 'x'.repeat(5000) })).toMatch(/check/i);   // < 4 KB
    expect(await share('carol', 'alice', ok, 'gif')).toMatch(/check/i);                            // tipos desconocidos siguen prohibidos
    expect(await share('eve', 'alice', ok)).toMatch(/row-level security/i);                        // no son amigos
  });

  it('el anime compartido sigue funcionando igual', async () => {
    expect(await asExpectError('carol', `insert into public.messages (recipient_id, kind, payload) values ('${ids.alice}', 'anime', '{"id":1,"title":{"romaji":"A"}}'::jsonb)`)).toBe('');
    expect(await asExpectError('carol', `insert into public.messages (recipient_id, kind) values ('${ids.alice}', 'anime')`)).toMatch(/check/i);
    expect(await asExpectError('carol', `insert into public.messages (recipient_id, kind) values ('${ids.alice}', 'manga')`)).toMatch(/check/i);
  });

  it('borrar un mensaje de manga (borrado suave) vacía la ficha', async () => {
    await admin(`delete from public.messages`);
    const [{ id }] = await asCommit('carol', (q) =>
      q(`insert into public.messages (recipient_id, kind, payload) values ('${ids.alice}', 'manga', '{"id":"u1","sourceId":"mangadex","title":"T"}'::jsonb) returning id`)
    );
    await asCommit('carol', (q) => q(`select public.delete_message(${id})`));
    const m = await admin(`select kind, payload, deleted_at is not null as gone from public.messages where id = $1`, [id]);
    expect(m[0]).toMatchObject({ kind: 'manga', payload: null, gone: true });
  });

  // ── Cuenta ───────────────────────────────────────────
  it('al eliminar la cuenta se borra todo su manga (en cascada)', async () => {
    const id = await signup('mangaghost', 'mangaghost');
    await asCommit('mangaghost', (q) => q(`select public.manga_sync_push($1::jsonb)`, [JSON.stringify([entry({ manga_id: 'g1', manga: { title: 'G' } })])]));
    await asCommit('mangaghost', (q) => q(`insert into public.reading_activity (user_id, source, manga_id, title) values ('${id}', 'mangadex', 'g1', 'G')`));
    expect(await admin(`select 1 from public.manga_entries where user_id = $1`, [id])).toHaveLength(1);
    await db.transaction(async (tx) => {
      await tx.exec(`set local role authenticated`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [id]);
      await tx.exec(`select public.delete_my_account()`);
    });
    expect(await admin(`select 1 from public.manga_entries where user_id = $1`, [id])).toHaveLength(0);
    expect(await admin(`select 1 from public.reading_activity where user_id = $1`, [id])).toHaveLength(0);
  });
});

