-- ═══════════════════════════════════════════════════════════════════
-- Fotos de perfil (Supabase Storage)
--
-- Bucket público de solo lectura (las URLs de avatar se comparten con los
-- amigos). Solo el dueño puede subir/reemplazar/borrar ficheros dentro de SU
-- carpeta: `<user_id>/avatar.webp`. Límite de 512 KB y solo imágenes.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lectura: el bucket es público, pero por defecto también permitimos leer los
-- metadatos vía API solo a usuarios autenticados.
create policy avatars_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');
