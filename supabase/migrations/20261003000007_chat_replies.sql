-- ═══════════════════════════════════════════════════════════════════
-- Responder a un mensaje (como en WhatsApp)
--
--   messages.reply_to   id del mensaje al que se responde (opcional)
--
-- Seguridad:
--   · Solo se guarda el ID. La cita que ve cada persona sale del mensaje
--     ORIGINAL (que ya solo pueden leer los dos amigos), así nadie puede
--     inventarse "lo que dijiste" ni leer mensajes de otras conversaciones.
--   · Un trigger exige que el mensaje citado exista, NO esté borrado y sea de
--     LA MISMA conversación (mismo par de personas).
--   · reply_to es inmutable: no hay UPDATE directo sobre messages.
--   · Si se borra el mensaje original (cuenta eliminada) la respuesta queda
--     sin cita (on delete set null). Si se borra "suavemente", la cita muestra
--     "Mensaje eliminado" porque el original se vacía.
-- ═══════════════════════════════════════════════════════════════════

alter table public.messages
  add column reply_to bigint references public.messages (id) on delete set null;

-- Acelera el "on delete set null" y buscar las respuestas de un mensaje
create index messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;

-- Mismo criterio que el resto de columnas de contenido
grant insert (reply_to) on public.messages to authenticated;

create or replace function public.messages_check_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.messages%rowtype;
begin
  if new.reply_to is null then
    return new;
  end if;
  select * into parent from public.messages where id = new.reply_to;
  if not found
     or parent.deleted_at is not null
     or least(parent.sender_id, parent.recipient_id) <> least(new.sender_id, new.recipient_id)
     or greatest(parent.sender_id, parent.recipient_id) <> greatest(new.sender_id, new.recipient_id)
  then
    raise exception 'invalid reply' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.messages_check_reply() from public, anon, authenticated;

create trigger messages_check_reply_trg
  before insert on public.messages
  for each row execute function public.messages_check_reply();
