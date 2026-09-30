// ═══════════════════════════════════════════════════════════
// safeUrl — Solo se cargan imágenes de orígenes de confianza
//
// `avatar_url`, `cover_url` y las portadas de las listas son texto que
// controla OTRO usuario (un amigo). Si se cargara cualquier URL, esa persona
// podría poner una suya y ver la IP de quien abra su perfil (pixel de
// rastreo) o servir contenido inesperado. Solo se aceptan:
//   · el Storage de nuestro propio proyecto de Supabase (avatares)
//   · el CDN de imágenes de AniList (portadas)
//   · data:image/* (solo backend de prueba)
// ═══════════════════════════════════════════════════════════

function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** ¿Es una imagen del CDN de AniList (https)? */
export function isAniListImage(url: string | null | undefined): boolean {
  const u = parse(url);
  return !!u && u.protocol === 'https:' && (u.hostname === 'anilist.co' || u.hostname.endsWith('.anilist.co'));
}

/** ¿Es un avatar alojado en NUESTRO Storage de Supabase? */
export function isOwnAvatar(url: string | null | undefined, supabaseUrl = process.env.SUPABASE_URL): boolean {
  const u = parse(url);
  const base = parse(supabaseUrl);
  if (!u || !base) return false;
  return (
    u.protocol === 'https:' &&
    u.origin === base.origin &&
    u.pathname.startsWith('/storage/v1/object/public/avatars/')
  );
}

/** Avatar permitido (Storage propio, o data: en el backend de prueba). */
export function safeAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (process.env.KAGEVIEW_BACKEND === 'mock' && url.startsWith('data:image/')) return url;
  return isOwnAvatar(url) ? url : null;
}

/** Portada permitida (CDN de AniList, o data: en el backend de prueba). */
export function safeCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (process.env.KAGEVIEW_BACKEND === 'mock' && url.startsWith('data:image/')) return url;
  return isAniListImage(url) ? url : null;
}
