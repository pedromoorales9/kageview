-- ═══════════════════════════════════════════════════════════════════
-- Manga en la cuenta
--
--   manga_entries      biblioteca + progreso de lectura de cada usuario (sincroniza
--                      entre dispositivos). Los ids de manga son TEXTO (varían por
--                      fuente), por eso no reutiliza library_entries (ids de AniList).
--   reading_activity   "leyendo ahora" para los amigos (equivale a `activity`)
--   messages           + tipo 'manga' (compartir un manga por el chat)
--
-- Seguridad:
--   · manga_entries NO admite escritura directa: solo la función manga_sync_push(),
--     que valida cada campo, limita el tamaño (100 por llamada, 3000 por usuario) y
--     resuelve conflictos (gana el sello más nuevo; el sello no puede ir al futuro).
--   · Lectura: la propia siempre; la de los amigos solo si el dueño comparte su
--     lista (show_library) y solo las entradas que están en su biblioteca (nunca el
--     historial suelto ni lo borrado).
--   · reading_activity sigue las mismas reglas que activity (show_activity).
-- ═══════════════════════════════════════════════════════════════════

-- ─── Rangos de capítulos leídos ────────────────────────────────────
-- [[1,45],[47,47],[12.5,12.5]] = capítulos 1–45, 47 y 12,5. Compacto y estable
-- entre fuentes (los números de capítulo no cambian aunque cambien los ids).
create or replace function public.valid_read_ranges(r jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(r) = 'array'
     and jsonb_array_length(r) <= 2000
     and not exists (
       select 1
         from jsonb_array_elements(r) e
        where jsonb_typeof(e) <> 'array'
           or jsonb_array_length(e) <> 2
           or jsonb_typeof(e -> 0) <> 'number'
           or jsonb_typeof(e -> 1) <> 'number'
           or (e ->> 0)::numeric < 0
           or (e ->> 1)::numeric > 100000
           or (e ->> 0)::numeric > (e ->> 1)::numeric
     );
$$;

-- ─── manga_entries ─────────────────────────────────────────────────
create table public.manga_entries (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  source            text not null check (source ~ '^[a-z0-9_-]{2,30}$'),
  manga_id          text not null check (char_length(manga_id) between 1 and 200),
  -- null = solo historial de lectura (no está en la biblioteca)
  status            text check (status is null or status in ('reading', 'planning', 'completed', 'dropped')),
  -- ficha para pintar la tarjeta sin consultar la fuente (título, portada, estado…)
  manga             jsonb not null
                    check (jsonb_typeof(manga) = 'object'
                           and pg_column_size(manga) < 8000
                           and char_length(coalesce(manga ->> 'title', '')) between 1 and 300
                           and (manga ->> 'coverUrl' is null
                                or manga ->> 'coverUrl' = ''
                                or (char_length(manga ->> 'coverUrl') <= 500 and manga ->> 'coverUrl' ~ '^https://'))),
  last_chapter_id     text check (char_length(last_chapter_id) <= 200),
  last_chapter_number text check (char_length(last_chapter_number) <= 20),
  last_page           integer check (last_page between 0 and 100000),
  last_page_count     integer check (last_page_count between 0 and 100000),
  last_read_at        timestamptz,
  read_ranges         jsonb not null default '[]'::jsonb check (public.valid_read_ranges(read_ranges)),
  -- "Olvidar lo leído": lo leído en otros dispositivos ANTES de esta fecha se descarta
  read_reset_at       timestamptz,
  -- borrado lógico: permite que otros dispositivos se enteren de que se quitó
  deleted             boolean not null default false,
  -- sello del cliente (gana el más nuevo) y sello del servidor (para sincronizar)
  updated_at          timestamptz not null,
  synced_at           timestamptz not null default now(),
  primary key (user_id, source, manga_id)
);

create index manga_entries_sync_idx on public.manga_entries (user_id, synced_at);

alter table public.manga_entries enable row level security;
revoke all on public.manga_entries from anon, authenticated;
grant select on public.manga_entries to authenticated;

create policy manga_entries_select on public.manga_entries
  for select to authenticated
  using (
    public.can_view_library(user_id)
    and (user_id = auth.uid() or (status is not null and not deleted))
  );

-- ─── Sincronización (única vía de escritura) ───────────────────────
create or replace function public.manga_sync_push(items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me      uuid := auth.uid();
  it      jsonb;
  applied integer := 0;
  rows_n  integer;
  stamp   timestamptz;
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 100 then
    raise exception 'invalid payload' using errcode = '22023';
  end if;

  for it in select * from jsonb_array_elements(items) loop
    if jsonb_typeof(it) is distinct from 'object' or jsonb_typeof(it -> 'manga') is distinct from 'object' then
      raise exception 'invalid entry' using errcode = '22023';
    end if;
    -- el sello nunca puede ir al futuro (bloquearía la fila para siempre)
    stamp := least((it ->> 'updated_at')::timestamptz, now() + interval '10 minutes');

    insert into public.manga_entries as m (
      user_id, source, manga_id, status, manga,
      last_chapter_id, last_chapter_number, last_page, last_page_count, last_read_at,
      read_ranges, read_reset_at, deleted, updated_at, synced_at
    ) values (
      me,
      it ->> 'source',
      it ->> 'manga_id',
      nullif(it ->> 'status', ''),
      it -> 'manga',
      nullif(it ->> 'last_chapter_id', ''),
      nullif(it ->> 'last_chapter_number', ''),
      (it ->> 'last_page')::integer,
      (it ->> 'last_page_count')::integer,
      (it ->> 'last_read_at')::timestamptz,
      coalesce(it -> 'read_ranges', '[]'::jsonb),
      (it ->> 'read_reset_at')::timestamptz,
      coalesce((it ->> 'deleted')::boolean, false),
      stamp,
      now()
    )
    on conflict (user_id, source, manga_id) do update set
      status              = excluded.status,
      manga               = excluded.manga,
      last_chapter_id     = excluded.last_chapter_id,
      last_chapter_number = excluded.last_chapter_number,
      last_page           = excluded.last_page,
      last_page_count     = excluded.last_page_count,
      last_read_at        = excluded.last_read_at,
      read_ranges         = excluded.read_ranges,
      read_reset_at       = excluded.read_reset_at,
      deleted             = excluded.deleted,
      updated_at          = excluded.updated_at,
      synced_at           = now()
    where excluded.updated_at > m.updated_at;

    get diagnostics rows_n = row_count;
    applied := applied + rows_n;
  end loop;

  -- tope por usuario (evita llenar la base de datos)
  if (select count(*) from public.manga_entries e where e.user_id = me) > 3000 then
    raise exception 'too many entries' using errcode = '54000';
  end if;

  return applied;
end;
$$;

revoke all on function public.manga_sync_push(jsonb) from public, anon, authenticated;
grant execute on function public.manga_sync_push(jsonb) to authenticated;

-- ─── reading_activity ("leyendo ahora") ────────────────────────────
create table public.reading_activity (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  source      text not null check (source ~ '^[a-z0-9_-]{2,30}$'),
  manga_id    text not null check (char_length(manga_id) between 1 and 200),
  title       text not null check (char_length(title) between 1 and 200),
  cover_url   text check (cover_url is null or (char_length(cover_url) <= 500 and cover_url ~ '^https://')),
  chapter     text check (char_length(chapter) <= 20),
  page        integer not null default 0 check (page between 0 and 100000),
  page_count  integer not null default 0 check (page_count between 0 and 100000),
  -- como en activity: se marca inactiva en vez de borrar (Realtime no emite DELETE bajo RLS)
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create trigger reading_activity_updated_at
  before update on public.reading_activity
  for each row execute function public.set_updated_at();

alter table public.reading_activity enable row level security;
revoke all on public.reading_activity from anon, authenticated;
grant select, insert, update, delete on public.reading_activity to authenticated;

create policy reading_activity_select on public.reading_activity
  for select to authenticated using (public.can_view_activity(user_id));
create policy reading_activity_insert on public.reading_activity
  for insert to authenticated
  with check (user_id = auth.uid() and not public.is_suspended(auth.uid()));
create policy reading_activity_update on public.reading_activity
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and not public.is_suspended(auth.uid()));
create policy reading_activity_delete on public.reading_activity
  for delete to authenticated using (user_id = auth.uid());

-- ─── Chat: compartir manga ─────────────────────────────────────────
alter table public.messages drop constraint messages_kind_check;
alter table public.messages
  add constraint messages_kind_check check (kind in ('text', 'anime', 'manga'));

-- "anime" y "manga" necesitan su ficha (payload), salvo que el mensaje esté borrado
alter table public.messages drop constraint messages_check2;
alter table public.messages
  add constraint messages_payload_required
  check (kind not in ('anime', 'manga') or deleted_at is not null or payload is not null);

-- la ficha de un manga compartido debe traer lo mínimo para abrirlo
alter table public.messages
  add constraint messages_manga_payload
  check (
    kind <> 'manga'
    or deleted_at is not null
    or (jsonb_typeof(payload) = 'object'
        and payload ? 'id' and payload ? 'sourceId' and payload ? 'title')
  );

-- ─── Realtime ──────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.reading_activity;
  end if;
end
$$;
