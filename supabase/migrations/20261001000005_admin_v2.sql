-- ═══════════════════════════════════════════════════════════════════
-- Administración v2
--
--   admin_audit        registro de TODO lo que hace el equipo (quién, qué, cuándo)
--   suspensions        cuentas suspendidas (sin chat, solicitudes ni actividad)
--   announcements      + platform / below_version (segmentar por sistema y versión)
--   RPC                admin_list_users · admin_set_suspended · admin_signups
--
-- Seguridad (igual que la 0004): la autorización la impone la base de datos.
--   · El registro solo lo escriben triggers/funciones SECURITY DEFINER: ningún
--     cliente puede insertar, editar ni borrar entradas (no hay privilegios).
--   · Solo el staff lee el registro y gestiona suspensiones; nunca se puede
--     suspender a un admin/owner.
--   · Un usuario suspendido conserva su cuenta y sus datos (puede leer y borrar
--     su cuenta), pero no puede escribir mensajes, enviar solicitudes de amistad,
--     publicar "viendo ahora" ni editar su perfil.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Registro de auditoría ─────────────────────────────────────────
create table public.admin_audit (
  id         bigint generated always as identity primary key,
  actor_id   uuid references public.profiles (id) on delete set null,
  -- instantánea del nombre (el registro sobrevive aunque cambie o se borre la cuenta)
  actor_name text not null default 'sistema' check (char_length(actor_name) <= 40),
  action     text not null check (char_length(action) <= 40),
  target     text check (char_length(target) <= 120),
  detail     jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 4000),
  created_at timestamptz not null default now()
);
create index admin_audit_recent_idx on public.admin_audit (id desc);

alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant select on public.admin_audit to authenticated;
create policy admin_audit_select on public.admin_audit
  for select to authenticated using (public.is_staff());

create or replace function public.audit(p_action text, p_target text, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  nm  text;
begin
  select p.username into nm from public.profiles p where p.id = uid;
  insert into public.admin_audit (actor_id, actor_name, action, target, detail)
  values (uid, coalesce(nm, 'sistema'), p_action, left(p_target, 120), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- ─── announcements: segmentación ───────────────────────────────────
alter table public.announcements
  add column platform text not null default 'all'
    check (platform in ('all', 'mac', 'windows', 'linux')),
  -- "solo para versiones ANTERIORES a X" (p. ej. avisar de que hay una actualización)
  add column below_version text
    check (below_version is null or below_version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$');

grant insert (platform, below_version) on public.announcements to authenticated;
grant update (platform, below_version) on public.announcements to authenticated;

-- ─── Triggers de auditoría ─────────────────────────────────────────
create or replace function public.announcements_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('announcement.create', new.id::text,
      jsonb_build_object('title', new.title, 'kind', new.kind, 'display', new.display));
  elsif tg_op = 'DELETE' then
    perform public.audit('announcement.delete', old.id::text,
      jsonb_build_object('title', old.title, 'kind', old.kind));
  elsif old.active is distinct from new.active then
    perform public.audit(case when new.active then 'announcement.resume' else 'announcement.pause' end,
      new.id::text, jsonb_build_object('title', new.title));
  elsif (old.kind, old.display, old.title, old.body, old.link_url, old.link_label,
         old.starts_at, old.expires_at, old.platform, old.below_version)
        is distinct from
        (new.kind, new.display, new.title, new.body, new.link_url, new.link_label,
         new.starts_at, new.expires_at, new.platform, new.below_version) then
    perform public.audit('announcement.update', new.id::text, jsonb_build_object('title', new.title));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger announcements_audit_trg
  after insert or update or delete on public.announcements
  for each row execute function public.announcements_audit();

create or replace function public.provider_switches_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit('service.disable', new.provider_id, jsonb_build_object('reason', new.reason));
  elsif tg_op = 'DELETE' then
    perform public.audit('service.enable', old.provider_id, '{}'::jsonb);
  elsif old.reason is distinct from new.reason then
    perform public.audit('service.reason', new.provider_id, jsonb_build_object('reason', new.reason));
  end if;
  return coalesce(new, old);
end;
$$;

create trigger provider_switches_audit_trg
  after insert or update or delete on public.provider_switches
  for each row execute function public.provider_switches_audit();

create or replace function public.profiles_role_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.audit('team.role', new.username,
    jsonb_build_object('from', old.role, 'to', new.role));
  return new;
end;
$$;

create trigger profiles_role_audit_trg
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.profiles_role_audit();

-- ─── Suspensiones ──────────────────────────────────────────────────
create table public.suspensions (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  reason       text not null default '' check (char_length(reason) <= 200),
  suspended_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.suspensions enable row level security;
revoke all on public.suspensions from anon, authenticated;
grant select on public.suspensions to authenticated;
-- cada persona ve la suya (para poder explicarle el motivo); el staff ve todas
create policy suspensions_select on public.suspensions
  for select to authenticated using (user_id = auth.uid() or public.is_staff());

create or replace function public.is_suspended(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and exists (select 1 from public.suspensions s where s.user_id = uid);
$$;
revoke all on function public.is_suspended(uuid) from public, anon, authenticated;
grant execute on function public.is_suspended(uuid) to authenticated;

-- Aplicar la suspensión: escribir mensajes, publicar actividad y editar el perfil
drop policy messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and read_at is null
    and deleted_at is null
    and public.are_friends(sender_id, recipient_id)
    and not public.is_suspended(auth.uid())
  );

drop policy activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert to authenticated
  with check (user_id = auth.uid() and not public.is_suspended(auth.uid()));

drop policy activity_update on public.activity;
create policy activity_update on public.activity
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_suspended(auth.uid()));

drop policy profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and not public.is_suspended(id))
  with check (id = auth.uid());

-- Solicitudes de amistad: mismo cuerpo que en la 0001 + comprobación de suspensión
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
  if public.is_suspended(me) then
    raise exception 'suspended' using errcode = '42501';
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
    update public.friendships
       set status = 'accepted', responded_at = now()
     where id = existing.id;
    return 'accepted';
  end if;

  select count(*) into pending_count from public.friendships
   where requester_id = me and status = 'pending';
  if pending_count >= 100 then
    raise exception 'too many pending requests' using errcode = '54000';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target);
  return 'sent';
end;
$$;

-- ─── RPC ───────────────────────────────────────────────────────────

-- Suspender / reactivar a un usuario normal. Solo staff; nunca a otro staff.
create or replace function public.admin_set_suspended(target uuid, suspend boolean, why text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t_role text;
  t_name text;
  reason_clean text := left(btrim(coalesce(why, '')), 200);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select p.role, p.username into t_role, t_name from public.profiles p where p.id = target;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if t_role <> 'user' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if suspend then
    insert into public.suspensions (user_id, reason, suspended_by)
    values (target, reason_clean, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, suspended_by = excluded.suspended_by;
    perform public.audit('user.suspend', t_name, jsonb_build_object('reason', reason_clean));
  else
    delete from public.suspensions where user_id = target;
    perform public.audit('user.unsuspend', t_name, '{}'::jsonb);
  end if;
end;
$$;

-- Listado de usuarios (sin correo: es dato privado). Solo staff.
create or replace function public.admin_list_users(q text default '', lim integer default 25, off integer default 0)
returns table (
  id uuid, username text, display_name text, avatar_url text, role text,
  created_at timestamptz, last_active timestamptz,
  suspended boolean, suspended_reason text, total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  needle text := lower(btrim(coalesce(q, '')));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  needle := replace(replace(replace(needle, '\', '\\'), '%', '\%'), '_', '\_');
  return query
    select p.id, p.username, p.display_name, p.avatar_url, p.role, p.created_at,
           (select a.updated_at from public.activity a where a.user_id = p.id),
           s.user_id is not null, s.reason,
           count(*) over ()
      from public.profiles p
      left join public.suspensions s on s.user_id = p.id
     where needle = '' or p.username like '%' || needle || '%'
        or lower(coalesce(p.display_name, '')) like '%' || needle || '%'
     order by p.created_at desc, p.id
     limit greatest(1, least(coalesce(lim, 25), 100))
    offset greatest(0, coalesce(off, 0));
end;
$$;

-- Registros por día (los días sin registros salen con 0). Solo staff.
create or replace function public.admin_signups(days integer default 30)
returns table (day date, n bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  span integer := greatest(7, least(coalesce(days, 30), 90));
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select d::date, count(p.id)
      from generate_series(current_date - (span - 1), current_date, interval '1 day') d
      left join public.profiles p on p.created_at::date = d::date
     group by d
     order by d;
end;
$$;

revoke all on function
  public.admin_set_suspended(uuid, boolean, text),
  public.admin_list_users(text, integer, integer),
  public.admin_signups(integer)
from public, anon, authenticated;
grant execute on function
  public.admin_set_suspended(uuid, boolean, text),
  public.admin_list_users(text, integer, integer),
  public.admin_signups(integer)
to authenticated;
