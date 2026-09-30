import { describe, it, expect } from 'vitest';
import { isAniListImage, isOwnAvatar, safeAvatarUrl, safeCoverUrl } from '../safeUrl';

describe('safeUrl', () => {
  it('portadas: solo el CDN de AniList por https', () => {
    expect(isAniListImage('https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/x.jpg')).toBe(true);
    expect(isAniListImage('https://anilist.co/img.png')).toBe(true);
    // suplantaciones habituales
    expect(isAniListImage('https://anilist.co.evil.com/x.jpg')).toBe(false);
    expect(isAniListImage('https://evilanilist.co/x.jpg')).toBe(false);
    expect(isAniListImage('https://evil.com/?u=s4.anilist.co')).toBe(false);
    expect(isAniListImage('http://s4.anilist.co/x.jpg')).toBe(false);
    expect(isAniListImage('javascript:alert(1)')).toBe(false);
    expect(isAniListImage('data:image/svg+xml;base64,AAAA')).toBe(false);
    expect(isAniListImage('')).toBe(false);
    expect(isAniListImage(null)).toBe(false);
    expect(isAniListImage('no es una url')).toBe(false);
  });

  it('avatares: solo el Storage del propio proyecto', () => {
    const base = 'https://abcd.supabase.co';
    const good = `${base}/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/avatar.webp?v=1`;
    expect(isOwnAvatar(good, base)).toBe(true);
    expect(isOwnAvatar(`https://evil.com/storage/v1/object/public/avatars/x/avatar.webp`, base)).toBe(false);
    expect(isOwnAvatar(`https://abcd.supabase.co.evil.com/storage/v1/object/public/avatars/x.webp`, base)).toBe(false);
    expect(isOwnAvatar(`${base}/storage/v1/object/public/otro-bucket/x.webp`, base)).toBe(false);
    expect(isOwnAvatar(`http://abcd.supabase.co/storage/v1/object/public/avatars/x.webp`, base)).toBe(false);
    expect(isOwnAvatar(good, '')).toBe(false);          // sin proyecto configurado, nada es "propio"
    expect(isOwnAvatar(null, base)).toBe(false);
  });

  it('sin backend de prueba no se aceptan data: URLs', () => {
    expect(safeAvatarUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeCoverUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeCoverUrl('https://s4.anilist.co/a.jpg')).toBe('https://s4.anilist.co/a.jpg');
    expect(safeCoverUrl('https://tracker.example/a.jpg')).toBeNull();
  });
});
