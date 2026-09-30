-- ═══════════════════════════════════════════════════════════════════
-- KageView — esquema inicial
--
--   profiles         perfil público básico (usuario, foto, bio, privacidad)
--   library_entries  listas de anime/manga (viendo, completado, …)
--   friendships      amistades (pendiente / aceptada)
--   activity         "viendo ahora" (una fila por usuario)
--
-- Principios de seguridad:
--   · TODAS las tablas tienen RLS activado y NO hay política por defecto:
--     lo que no se concede explícitamente queda denegado.
--   · Las operaciones sensibles (buscar usuarios, enviar/responder
--     solicitudes, borrar cuenta) solo son posibles vía funciones RPC
--     SECURITY DEFINER con search_path fijo; no hay INSERT/UPDATE directo
--     sobre `friendships` (evita auto-aceptarse o cambiar de destinatario).
--   · Un usuario nunca puede listar perfiles de desconocidos: solo el suyo,
--     los de sus amigos y los de solicitudes pendientes que le afectan.
--   · La `anon key` del cliente es pública por diseño; la clave
--     `service_role` NO debe incluirse jamás en la app.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Utilidades ────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── profiles ──────────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  -- minúsculas, 3–20 caracteres: letras, números y guion bajo
  username      text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text check (char_length(display_name) <= 40),
  -- solo https (el cliente además limita el origen al Storage del proyecto)
  avatar_url    text check (char_length(avatar_url) <= 500 and avatar_url ~ '^https://'),
  bio           text check (char_length(bio) <= 200),
  -- Privacidad: qué pueden ver los AMIGOS (nadie más ve nada de esto)
  show_activity boolean not null default true,
  show_library  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Crea el perfil al registrarse. El nombre de usuario llega en los metadatos
-- del alta; si es inválido o ya está cogido se usa uno generado (así el alta
-- nunca falla con un error opaco de base de datos).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  final  text;
begin
  if wanted ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = wanted) then
    final := wanted;
  else
    final := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, final, nullif(left(new.raw_user_meta_data ->> 'display_name', 40), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── friendships ───────────────────────────────────────────────────
create table public.friendships (
  id            bigint generated always as identity primary key,
  requester_id  uuid not null references public.profiles (id) on delete cascade,
  addressee_id  uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (requester_id <> addressee_id)
);

-- Una única relación por pareja, sin importar quién la inició
create unique index friendships_pair_uniq
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id, status);
create index friendships_requester_idx on public.friendships (requester_id, status);

-- ¿Son amigos a & b? (SECURITY DEFINER para poder usarse dentro de políticas
-- RLS de otras tablas sin recursión ni exponer `friendships`.)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b and exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ¿Hay una solicitud pendiente entre a & b (en cualquier sentido)?
create or replace function public.has_pending_request(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships f
    where f.status = 'pending'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ─── library_entries ───────────────────────────────────────────────
create table public.library_entries (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  media_type  text not null check (media_type in ('anime', 'manga')),
  media_id    integer not null check (media_id > 0),
  -- mismos valores que usa la UI (heredados de AniList)
  status      text not null check (status in ('CURRENT','PLANNING','COMPLETED','PAUSED','DROPPED','REPEATING')),
  progress    integer not null default 0 check (progress between 0 and 100000),
  score       smallint not null default 0 check (score between 0 and 100),
  -- instantánea mínima del título (portada, nombres, nº de episodios…) para
  -- pintar listas propias y de amigos sin consultar AniList por cada entrada
  media       jsonb not null default '{}'::jsonb check (pg_column_size(media) < 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, media_type, media_id)
);
create index library_entries_user_status_idx on public.library_entries (user_id, media_type, status);

create trigger library_entries_updated_at
  before update on public.library_entries
  for each row execute function public.set_updated_at();

-- ─── activity ("viendo ahora") ─────────────────────────────────────
-- Una fila por usuario. En lugar de borrarla al dejar de ver se marca
-- active=false: Realtime no emite eventos DELETE bajo RLS, pero sí UPDATE.
create table public.activity (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  media_id        integer not null check (media_id > 0),
  title           text not null check (char_length(title) <= 200),
  cover_url       text check (char_length(cover_url) <= 500 and cover_url ~ '^https://'),
  episode         integer not null default 0 check (episode between 0 and 100000),
  total_episodes  integer check (total_episodes is null or total_episodes >= 0),
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);

create trigger activity_updated_at
  before update on public.activity
  for each row execute function public.set_updated_at();

-- Visibilidad configurada por el dueño
create or replace function public.can_view_activity(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner = auth.uid()
      or (public.are_friends(auth.uid(), owner)
          and coalesce((select p.show_activity from public.profiles p where p.id = owner), false));
$$;

create or replace function public.can_view_library(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select owner = auth.uid()
      or (public.are_friends(auth.uid(), owner)
          and coalesce((select p.show_library from public.profiles p where p.id = owner), false));
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════
alter table public.profiles        enable row level security;
alter table public.friendships     enable row level security;
alter table public.library_entries enable row level security;
alter table public.activity        enable row level security;

-- Privilegios explícitos (no dependemos de los defaults de la plataforma)
revoke all on public.profiles, public.friendships, public.library_entries, public.activity from anon, authenticated;

-- profiles: propio + amigos + solicitudes pendientes que me afectan.
-- (Los desconocidos NO se pueden listar; se buscan por RPC limitada.)
grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, bio, show_activity, show_library, username)
  on public.profiles to authenticated;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.are_friends(auth.uid(), id)
    or public.has_pending_request(auth.uid(), id)
  );
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- No hay INSERT (lo hace el trigger de alta) ni DELETE (delete_my_account()).

-- friendships: solo lectura directa y borrado (cancelar/rechazar/eliminar amigo).
-- Crear y aceptar se hace únicamente por RPC.
grant select, delete on public.friendships to authenticated;
create policy friendships_select on public.friendships
  for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- library_entries: CRUD propio; lectura también para amigos si el dueño lo permite
grant select, insert, update, delete on public.library_entries to authenticated;
create policy library_select on public.library_entries
  for select to authenticated
  using (public.can_view_library(user_id));
create policy library_insert on public.library_entries
  for insert to authenticated
  with check (user_id = auth.uid());
create policy library_update on public.library_entries
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy library_delete on public.library_entries
  for delete to authenticated
  using (user_id = auth.uid());

-- activity: escritura propia; lectura propia o de amigos con actividad visible
grant select, insert, update, delete on public.activity to authenticated;
create policy activity_select on public.activity
  for select to authenticated
  using (public.can_view_activity(user_id));
create policy activity_insert on public.activity
  for insert to authenticated
  with check (user_id = auth.uid());
create policy activity_update on public.activity
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy activity_delete on public.activity
  for delete to authenticated
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════
-- RPC (todas SECURITY DEFINER con search_path fijo y validación interna)
-- ═══════════════════════════════════════════════════════════════════

-- ¿Está libre el nombre de usuario? (se usa ANTES de registrarse → anon)
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(candidate) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles p where p.username = lower(candidate));
$$;

-- Búsqueda de usuarios por prefijo. Mínimo 3 caracteres, máximo 10 resultados,
-- solo campos públicos, excluye al propio usuario. Evita el volcado masivo.
create or replace function public.search_profiles(q text)
returns table (id uuid, username text, display_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text := lower(trim(coalesce(q, '')));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(needle) < 3 then
    return;
  end if;
  -- escapa comodines LIKE del texto del usuario
  needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.username, p.display_name, p.avatar_url
    from public.profiles p
    where p.username like needle || '%'
      and p.id <> auth.uid()
    order by p.username
    limit 10;
end;
$$;

-- Enviar solicitud de amistad. Si la otra persona ya te había enviado una,
-- se acepta directamente. Devuelve 'sent' | 'accepted'.
create or replace function public.send_friend_request(target uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  existing public.friendships%rowtype;
  pending_count integer;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if target is null or target = me then
    raise exception 'invalid target' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  select * into existing from public.friendships f
   where least(f.requester_id, f.addressee_id) = least(me, target)
     and greatest(f.requester_id, f.addressee_id) = greatest(me, target);

  if found then
    if existing.status = 'accepted' then
      raise exception 'already friends' using errcode = '23505';
    end if;
    if existing.requester_id = me then
      raise exception 'request already sent' using errcode = '23505';
    end if;
    -- la otra persona ya me la había enviado → aceptar
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = existing.id;
    return 'accepted';
  end if;

  -- freno anti-spam: máximo 100 solicitudes pendientes enviadas
  select count(*) into pending_count from public.friendships
   where requester_id = me and status = 'pending';
  if pending_count >= 100 then
    raise exception 'too many pending requests' using errcode = '54000';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target);
  return 'sent';
end;
$$;

-- Aceptar o rechazar una solicitud RECIBIDA.
create or replace function public.respond_friend_request(request_id bigint, accept boolean)
returns void
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

  if accept then
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = request_id and addressee_id = me and status = 'pending';
  else
    delete from public.friendships
     where id = request_id and addressee_id = me and status = 'pending';
  end if;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Borra la cuenta y TODOS sus datos (cascada desde auth.users)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Permisos de ejecución: solo lo necesario
revoke all on function
  public.username_available(text),
  public.search_profiles(text),
  public.send_friend_request(uuid),
  public.respond_friend_request(bigint, boolean),
  public.delete_my_account(),
  public.are_friends(uuid, uuid),
  public.has_pending_request(uuid, uuid),
  public.can_view_activity(uuid),
  public.can_view_library(uuid)
from public, anon, authenticated;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function
  public.search_profiles(text),
  public.send_friend_request(uuid),
  public.respond_friend_request(bigint, boolean),
  public.delete_my_account()
to authenticated;
-- Las funciones de visibilidad las evalúan las políticas RLS con el rol
-- del que consulta, por lo que necesitan poder ejecutarse.
grant execute on function
  public.are_friends(uuid, uuid),
  public.has_pending_request(uuid, uuid),
  public.can_view_activity(uuid),
  public.can_view_library(uuid)
to authenticated;

-- ─── Realtime (solo si existe la publicación, p. ej. en Supabase) ──
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.activity;
    alter publication supabase_realtime add table public.friendships;
  end if;
end
$$;
