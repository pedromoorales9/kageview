// ═══════════════════════════════════════════════════════════
// Manga Library — Persistencia local de biblioteca y progreso
// Usa getCache/setCache de cache.ts (electron-store via IPC)
// ═══════════════════════════════════════════════════════════

import { getCache, setCache } from '../cache';
import { MangaModel } from './types';

// ─── Tipos ──────────────────────────────────────────────────

export type MangaLibraryStatus = 'reading' | 'completed' | 'planning' | 'dropped';

export interface MangaLibraryEntry {
  manga: MangaModel;
  status: MangaLibraryStatus;
  addedAt: number;
  updatedAt: number;
}

export interface MangaReadProgress {
  mangaId: string;
  sourceId: string;
  lastChapterId: string;
  lastChapterNumber: string | null;
  lastChapterIndex: number;
  updatedAt: number;
}

// ─── Cache Keys ──────────────────────────────────────────────

const LIBRARY_KEY = 'mangaLibrary';
const PROGRESS_KEY = 'mangaProgress';

// ─── Library Functions ───────────────────────────────────────

export async function getLibrary(): Promise<MangaLibraryEntry[]> {
  return (await getCache<MangaLibraryEntry[]>(LIBRARY_KEY)) ?? [];
}

export async function addToLibrary(
  manga: MangaModel,
  status: MangaLibraryStatus = 'reading'
): Promise<void> {
  const library = await getLibrary();
  const now = Date.now();
  const existing = library.findIndex((e) => e.manga.id === manga.id && e.manga.sourceId === manga.sourceId);

  if (existing >= 0) {
    library[existing] = { ...library[existing], status, updatedAt: now };
  } else {
    library.push({ manga, status, addedAt: now, updatedAt: now });
  }

  await setCache(LIBRARY_KEY, library);
}

export async function removeFromLibrary(mangaId: string, sourceId: string): Promise<void> {
  const library = await getLibrary();
  const filtered = library.filter((e) => !(e.manga.id === mangaId && e.manga.sourceId === sourceId));
  await setCache(LIBRARY_KEY, filtered);
}

export async function isInLibrary(mangaId: string, sourceId: string): Promise<boolean> {
  const library = await getLibrary();
  return library.some((e) => e.manga.id === mangaId && e.manga.sourceId === sourceId);
}

export async function getLibraryEntry(mangaId: string, sourceId: string): Promise<MangaLibraryEntry | null> {
  const library = await getLibrary();
  return library.find((e) => e.manga.id === mangaId && e.manga.sourceId === sourceId) ?? null;
}

export async function updateLibraryStatus(
  mangaId: string,
  sourceId: string,
  status: MangaLibraryStatus
): Promise<void> {
  const library = await getLibrary();
  const idx = library.findIndex((e) => e.manga.id === mangaId && e.manga.sourceId === sourceId);
  if (idx >= 0) {
    library[idx] = { ...library[idx], status, updatedAt: Date.now() };
    await setCache(LIBRARY_KEY, library);
  }
}

// ─── Progress Functions ───────────────────────────────────────

export async function getAllProgress(): Promise<Record<string, MangaReadProgress>> {
  return (await getCache<Record<string, MangaReadProgress>>(PROGRESS_KEY)) ?? {};
}

function progressKey(mangaId: string, sourceId: string): string {
  return `${sourceId}::${mangaId}`;
}

export async function getProgress(mangaId: string, sourceId: string): Promise<MangaReadProgress | null> {
  const all = await getAllProgress();
  return all[progressKey(mangaId, sourceId)] ?? null;
}

export async function saveProgress(
  mangaId: string,
  sourceId: string,
  lastChapterId: string,
  lastChapterNumber: string | null,
  lastChapterIndex: number
): Promise<void> {
  const all = await getAllProgress();
  all[progressKey(mangaId, sourceId)] = {
    mangaId,
    sourceId,
    lastChapterId,
    lastChapterNumber,
    lastChapterIndex,
    updatedAt: Date.now(),
  };
  await setCache(PROGRESS_KEY, all);
}
