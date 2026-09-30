-- ═══════════════════════════════════════════════════════════════════
-- Chat entre amigos
--
--   messages   mensajes 1 a 1 (texto o "anime compartido")
--
-- Seguridad:
--   · Solo se puede leer/escribir entre AMIGOS ACEPTADOS (are_friends). Si la
--     amistad se elimina, la conversación deja de ser legible (y reaparece si
--     vuelven a ser amigos).
--   · El remitente no se envía desde el cliente: es siempre auth.uid()
--     (default de la columna + privilegios por columna), así que nadie puede
--     escribir "como" otra persona ni falsear fechas/estado de lectura.
--   · No hay UPDATE/DELETE directos: marcar leído y borrar un mensaje propio
--     van por funciones RPC. Borrar es un "borrado suave" (deleted_at) para
--     que Realtime propague el cambio (no emite DELETE bajo RLS).
--   · Límites: 2000 caracteres, payload de anime < 4 KB, máx. 20 mensajes
--     cada 10 s por remitente (anti-flood).
--   · El contenido se guarda en texto plano (NO es cifrado de extremo a extremo).
-- ═══════════════════════════════════════════════════════════════════

create table public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null default 'text' check (kind in ('text', 'anime')),
  body         text not null default '' check (char_length(body) <= 2000),
  -- instantánea del anime compartido (kind = 'anime')
  payload      jsonb check (payload is null or pg_column_size(payload) < 4000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  deleted_at   timestamptz,
  check (sender_id <> recipient_id),
  -- un mensaje de texto no puede estar vacío; uno de anime necesita su payload
  -- (salvo que esté borrado, que se vacía)
  check (kind <> 'text'  or deleted_at is not null or char_length(btrim(body)) > 0),
  check (kind <> 'anime' or deleted_at is not null or payload is not null)
);

-- Lectura de una conversación (par no ordenado) por fecha
create index messages_pair_idx
  on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
-- Contador de no leídos
create index messages_unread_idx
  on public.messages (recipient_id, sender_id)
  where read_at is null and deleted_at is null;
-- Anti-flood
create index messages_sender_recent_idx on public.messages (sender_id, created_at desc);

-- ─── Anti-flood ────────────────────────────────────────────────────
create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.messages m
       where m.sender_id = new.sender_id
         and m.created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'too many messages' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit_trg
  before insert on public.messages
  for each row execute function public.messages_rate_limit();

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

-- Leer: mis mensajes, mientras sigamos siendo amigos
grant select on public.messages to authenticated;
create policy messages_select on public.messages
  for select to authenticated
  using (
    auth.uid() in (sender_id, recipient_id)
    and public.are_friends(sender_id, recipient_id)
  );

-- Escribir: solo columnas de contenido; el remitente es siempre yo y debe ser mi amigo
grant insert (recipient_id, kind, body, payload) on public.messages to authenticated;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and read_at is null
    and deleted_at is null
    and public.are_friends(sender_id, recipient_id)
  );

-- ─── RPC ───────────────────────────────────────────────────────────

-- Marca como leídos los mensajes que un amigo me ha enviado. Devuelve cuántos.
create or replace function public.mark_conversation_read(friend uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n integer;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.are_friends(me, friend) then
    return 0;
  end if;
  update public.messages
     set read_at = now()
   where recipient_id = me and sender_id = friend and read_at is null and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Borra (suavemente) un mensaje PROPIO: se vacía y queda como "mensaje eliminado".
create or replace function public.delete_message(message_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.messages
     set deleted_at = now(), body = '', payload = null
   where id = message_id and sender_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Resumen por conversación: último mensaje y nº de no leídos (respeta RLS)
create or replace function public.chat_summary()
returns table (
  friend_id       uuid,
  last_message_id bigint,
  last_kind       text,
  last_body       text,
  last_sender     uuid,
  last_at         timestamptz,
  last_deleted    boolean,
  unread          bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select m.*,
           case when m.sender_id = auth.uid() then m.recipient_id else m.sender_id end as other
      from public.messages m
     where auth.uid() in (m.sender_id, m.recipient_id)
  ),
  last_msg as (
    select distinct on (other) other, id, kind, body, sender_id, created_at, (deleted_at is not null) as deleted
      from mine
     order by other, created_at desc, id desc
  ),
  unread_ct as (
    select sender_id as other, count(*) as n
      from mine
     where recipient_id = auth.uid() and read_at is null and deleted_at is null
     group by sender_id
  )
  select l.other, l.id, l.kind, l.body, l.sender_id, l.created_at, l.deleted, coalesce(u.n, 0)
    from last_msg l
    left join unread_ct u on u.other = l.other
   order by l.created_at desc;
$$;

revoke all on function
  public.messages_rate_limit(),
  public.mark_conversation_read(uuid),
  public.delete_message(bigint),
  public.chat_summary()
from public, anon, authenticated;
grant execute on function
  public.mark_conversation_read(uuid),
  public.delete_message(bigint),
  public.chat_summary()
to authenticated;

-- ─── Realtime ──────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
