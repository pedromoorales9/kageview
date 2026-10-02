import { describe, it, expect, vi } from 'vitest';
vi.mock('../../../safeUrl', () => ({ safeCoverUrl: (u: string | null) => (u && u.startsWith('https://s4.anilist.co/') ? u : null) }));
import { alToManga, mangaStatusToAL, mangaSide, progressFromRanges, animeSide, remoteSide, mediaToMangaModel, mediaToSnapshot, clampScore, mediaTitle } from '../mapping';
import type { ALEntry, ALMedia } from '../types';
import type { MangaRecord } from '../../../manga/mangaStore';

const media = (over: Partial<ALMedia> = {}): ALMedia => ({
  id: 30002, idMal: 2, type: 'MANGA',
  title: { romaji: 'Berserk', english: 'Berserk', native: 'ベルセルク' },
  synonyms: [], coverImage: { extraLarge: 'https://s4.anilist.co/file/x.jpg', large: null, color: '#ff0000' },
  bannerImage: null, episodes: null, chapters: 380, genres: ['Action', 'Fantasy'], averageScore: 93,
  status: 'RELEASING', seasonYear: null, startYear: 1989, format: 'MANGA', isAdult: false, popularity: 1000, ...over,
});

describe('estados del manga', () => {
  it('AniList → KageView: pausa y releyendo cuentan como "leyendo"', () => {
    expect(alToManga('CURRENT')).toBe('reading');
    expect(alToManga('PAUSED')).toBe('reading');
    expect(alToManga('REPEATING')).toBe('reading');
    expect(alToManga('COMPLETED')).toBe('completed');
    expect(alToManga('PLANNING')).toBe('planning');
    expect(alToManga('DROPPED')).toBe('dropped');
  });
  it('KageView → AniList: se conserva "en pausa" si el estado local es el derivado de él', () => {
    expect(mangaStatusToAL('reading', 'PAUSED')).toBe('PAUSED');
    expect(mangaStatusToAL('reading', 'REPEATING')).toBe('REPEATING');
    expect(mangaStatusToAL('reading', null)).toBe('CURRENT');
    expect(mangaStatusToAL('completed', 'PAUSED')).toBe('COMPLETED');   // el usuario lo cambió
    expect(mangaStatusToAL('dropped', 'CURRENT')).toBe('DROPPED');
  });
});

describe('progreso', () => {
  it('es el mayor capítulo leído (parte entera)', () => {
    expect(progressFromRanges(undefined)).toBe(0);
    expect(progressFromRanges([])).toBe(0);
    expect(progressFromRanges([[1, 10]])).toBe(10);
    expect(progressFromRanges([[1, 3], [50, 50]])).toBe(50);           // empezar por el 50 cuenta
    expect(progressFromRanges([[1, 12], [12.5, 12.5]])).toBe(12);
  });
});

describe('lados para la fusión', () => {
  const rec = (over: Partial<MangaRecord> = {}): MangaRecord => ({
    manga: { id: 'a', sourceId: 'x', title: 'T', description: '', coverUrl: '', status: 'ongoing', tags: [], year: null, lastChapter: null },
    status: 'reading', updatedAt: 1000, read: [], readRanges: [[1, 7]], ...over,
  });
  it('un manga fuera de la biblioteca (solo historial) no se sincroniza', () => {
    expect(mangaSide(rec({ status: undefined }), null)).toBeNull();
  });
  it('usa lo más reciente entre el registro y la última lectura', () => {
    expect(mangaSide(rec({ last: { chapterId: 'c', chapterNumber: '7', chapterIndex: 6, page: 1, pageCount: 20, at: 5000 } }), null)).toMatchObject({ at: 5000, progress: 7, status: 'CURRENT' });
  });
  it('anime: usa su estado, progreso, nota (0–100) y fecha', () => {
    const e = { mediaType: 'anime', mediaId: 1, status: 'PAUSED', progress: 3.9, score: 140, updatedAt: '2026-10-01T10:00:00.000Z', media: {} } as never;
    expect(animeSide(e)).toEqual({ status: 'PAUSED', progress: 3, score: 100, at: Date.parse('2026-10-01T10:00:00.000Z') });
    expect(animeSide(undefined)).toBeNull();
  });
  it('remoto: AniList ya da la nota en 0–100', () => {
    const e: ALEntry = { id: 9, mediaId: 1, status: 'CURRENT', progress: 4, score: 72, updatedAt: 123456, media: media() };
    expect(remoteSide(e)).toEqual({ status: 'CURRENT', progress: 4, score: 72, at: 123456 });
  });
  it('las notas inválidas se normalizan', () => {
    expect([clampScore(NaN), clampScore(-5), clampScore(101), clampScore(72.6), clampScore('x')]).toEqual([0, 0, 100, 73, 0]);
  });
});

describe('fichas', () => {
  it('un manga de AniList se convierte en una ficha de KageView sin fuente de lectura', () => {
    const m = mediaToMangaModel(media());
    expect(m).toMatchObject({ id: '30002', sourceId: 'anilist', title: 'Berserk', status: 'ongoing', year: 1989, lastChapter: '380', isAdult: false });
    expect(m.coverUrl).toBe('https://s4.anilist.co/file/x.jpg');
    expect(m.tags).toEqual(['Action', 'Fantasy']);
  });
  it('portadas de otros dominios se descartan; estados se traducen', () => {
    expect(mediaToMangaModel(media({ coverImage: { extraLarge: 'https://evil.example/x.jpg', large: null, color: null } })).coverUrl).toBe('');
    expect(mediaToMangaModel(media({ status: 'FINISHED' })).status).toBe('completed');
    expect(mediaToMangaModel(media({ status: 'HIATUS' })).status).toBe('hiatus');
    expect(mediaToMangaModel(media({ status: 'CANCELLED' })).status).toBe('cancelled');
  });
  it('título: inglés, si no romaji, si no nativo', () => {
    expect(mediaTitle({ title: { romaji: 'A', english: null, native: 'N' } })).toBe('A');
    expect(mediaTitle({ title: { romaji: null, english: null, native: 'N' } })).toBe('N');
    expect(mediaTitle({ title: { romaji: null, english: null, native: null } })).toBe('Sin título');
  });
  it('instantánea de anime para la lista', () => {
    const s = mediaToSnapshot(media({ type: 'ANIME', episodes: 24, chapters: null, genres: Array(12).fill('x') }));
    expect(s).toMatchObject({ id: 30002, episodes: 24, coverImage: { large: 'https://s4.anilist.co/file/x.jpg' } });
    expect(s.genres).toHaveLength(8);
  });
});
