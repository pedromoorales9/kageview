-- ═══════════════════════════════════════════════════════════════════
-- Administración: roles, anuncios y servicios desactivados
--
--   profiles.role        'user' (por defecto) | 'admin' | 'owner'
--   announcements        avisos para TODOS los usuarios (banner o ventana)
--   provider_switches    servicios (AnimeFLV, MangaDex…) desactivados por mantenimiento
--
-- Seguridad:
--   · El rol NO se puede cambiar desde el cliente: `role` queda fuera de los
--     privilegios de UPDATE de profiles. Solo cambia por SQL (owner inicial) o
--     por la función set_user_role(), que exige ser owner.
--   · Solo puede haber UN owner (índice único parcial).
--   · Lectura pública (también sin sesión) de los anuncios vigentes y de los
--     servicios desactivados: la app los consulta al arrancar.
--   · Escribir anuncios/servicios exige is_staff() (admin u owner) mediante RLS,
--     no mediante la interfaz: aunque alguien manipule la app, la base de datos
--     rechaza la operación.
--   · Gestionar el equipo (nombrar/quitar admins) es exclusivo del owner.
--
-- El owner inicial se asigna a mano una vez (ver supabase/README.md):
--   update public.profiles set role = 'owner'
--    where id = (select id from auth.users where email = 'TU_CORREO');
-- ═══════════════════════════════════════════════════════════════════

-- ─── Roles ─────────────────────────────────────────────────────────
alter table public.profiles
  add column role text not null default 'user' check (role in ('user', 'admin', 'owner'));

-- Como mucho un owner
create unique index profiles_single_owner on public.profiles (role) where role = 'owner';

-- Rol del usuario actual (SECURITY DEFINER: se usa dentro de políticas RLS)
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'user');
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.my_role() in ('admin', 'owner');
$$;

revoke all on function public.my_role(), public.is_staff() from public, anon, authenticated;
grant execute on function public.my_role(), public.is_staff() to authenticated;

-- ─── announcements ─────────────────────────────────────────────────
create table public.announcements (
  id          bigint generated always as identity primary key,
  kind        text not null default 'info'
              check (kind in ('info', 'update', 'event', 'warning', 'maintenance')),
  -- banner: franja discreta bajo la barra superior · modal: ventana al abrir la app
  display     text not null default 'banner' check (display in ('banner', 'modal')),
  title       text not null default '' check (char_length(title) <= 80),
  body        text not null check (char_length(btrim(body)) between 1 and 600),
  -- solo https (el cliente además vuelve a validarlo antes de abrirlo)
  link_url    text check (link_url is null or (char_length(link_url) <= 500 and link_url ~ '^https://')),
  link_label  text check (link_label is null or char_length(link_label) <= 30),
  active      boolean not null default true,
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_at is null or expires_at > starts_at)
);

create index announcements_live_idx on public.announcements (active, starts_at desc);

create trigger announcements_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- Cualquiera (incluso sin sesión) ve los vigentes; el staff ve todos
grant select on public.announcements to anon, authenticated;
create policy announcements_select_live on public.announcements
  for select to anon, authenticated
  using (active and starts_at <= now() and (expires_at is null or expires_at > now()));
create policy announcements_select_staff on public.announcements
  for select to authenticated
  using (public.is_staff());

-- Escribir: solo staff, solo columnas de contenido (autor y fechas de sistema no)
grant insert (kind, display, title, body, link_url, link_label, active, starts_at, expires_at)
  on public.announcements to authenticated;
grant update (kind, display, title, body, link_url, link_label, active, starts_at, expires_at)
  on public.announcements to authenticated;
grant delete on public.announcements to authenticated;
create policy announcements_insert on public.announcements
  for insert to authenticated with check (public.is_staff());
create policy announcements_update on public.announcements
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy announcements_delete on public.announcements
  for delete to authenticated using (public.is_staff());

-- ─── provider_switches ─────────────────────────────────────────────
-- Una fila = ese servicio está desactivado para todos (con su motivo).
create table public.provider_switches (
  provider_id text primary key check (provider_id ~ '^[a-z0-9_-]{2,30}$'),
  reason      text not null default '' check (char_length(reason) <= 200),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create or replace function public.provider_switches_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger provider_switches_touch_trg
  before update on public.provider_switches
  for each row execute function public.provider_switches_touch();

alter table public.provider_switches enable row level security;
revoke all on public.provider_switches from anon, authenticated;

grant select on public.provider_switches to anon, authenticated;
create policy provider_switches_select on public.provider_switches
  for select to anon, authenticated using (true);

grant insert (provider_id, reason) on public.provider_switches to authenticated;
grant update (reason) on public.provider_switches to authenticated;
grant delete on public.provider_switches to authenticated;
create policy provider_switches_insert on public.provider_switches
  for insert to authenticated with check (public.is_staff());
create policy provider_switches_update on public.provider_switches
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy provider_switches_delete on public.provider_switches
  for delete to authenticated using (public.is_staff());

-- ─── RPC ───────────────────────────────────────────────────────────

-- Nombrar / quitar administradores. Solo el owner. El owner no se puede tocar.
create or replace function public.set_user_role(target uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_role_of_target text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.my_role() <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  select p.role into current_role_of_target from public.profiles p where p.id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if current_role_of_target = 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target;
end;
$$;

-- Equipo (admins + owner). Solo staff.
create or replace function public.list_staff()
returns table (id uuid, username text, display_name text, avatar_url text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name, p.avatar_url, p.role
      from public.profiles p
     where p.role in ('admin', 'owner')
     order by (p.role = 'owner') desc, p.username;
end;
$$;

-- Cifras agregadas (nada personal). Solo staff.
create or replace function public.admin_stats()
returns table (users_total bigint, users_7d bigint, watching_now bigint, announcements_live bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      (select count(*) from public.profiles),
      (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      (select count(*) from public.activity a
        where a.active and a.updated_at > now() - interval '15 minutes'),
      (select count(*) from public.announcements n
        where n.active and n.starts_at <= now() and (n.expires_at is null or n.expires_at > now()));
end;
$$;

revoke all on function
  public.set_user_role(uuid, text),
  public.list_staff(),
  public.admin_stats()
from public, anon, authenticated;
grant execute on function
  public.set_user_role(uuid, text),
  public.list_staff(),
  public.admin_stats()
to authenticated;
