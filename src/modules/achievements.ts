// ═══════════════════════════════════════════════════════════
// Achievements — Logros / insignias del "Demonio Guardián"
// Se calculan a partir del historial de visualización y la
// biblioteca de manga. El estado desbloqueado se persiste en
// electron-store (vía getCache/setCache).
// ═══════════════════════════════════════════════════════════

import { getCache, setCache } from './cache';
import { getHistory } from './watchHistory';
import { getLibrary, getAllProgress } from './manga/mangaLibrary';

const UNLOCKED_KEY = 'achievementsUnlocked';

// ─── Estadísticas derivadas ─────────────────────────────────

interface Stats {
  totalEpisodes: number;
  distinctGenres: number;
  maxEpisodesInDay: number;
  lateNight: boolean;
  maxStreakDays: number;
  maxSameAnime: number;
  mangaInLibrary: number;
  mangaWithProgress: number;
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function computeStats(): Promise<Stats> {
  const history = await getHistory();

  const genres = new Set<string>();
  const perDay = new Map<number, number>();
  const perAnime = new Map<number, number>();
  let lateNight = false;

  for (const e of history) {
    e.anime.genres?.forEach((g) => genres.add(g));

    const day = startOfDay(e.watchedAt);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    perAnime.set(e.anime.id, (perAnime.get(e.anime.id) ?? 0) + 1);

    const hour = new Date(e.watchedAt).getHours();
    if (hour >= 0 && hour < 5) lateNight = true;
  }

  // Racha máxima de días consecutivos
  const days = [...perDay.keys()].sort((a, b) => a - b);
  let maxStreak = days.length > 0 ? 1 : 0;
  let cur = days.length > 0 ? 1 : 0;
  for (let i = 1; i < days.length; i++) {
    const diff = Math.round((days[i] - days[i - 1]) / 86_400_000);
    cur = diff === 1 ? cur + 1 : 1;
    if (cur > maxStreak) maxStreak = cur;
  }

  let library: Awaited<ReturnType<typeof getLibrary>> = [];
  let progress: Awaited<ReturnType<typeof getAllProgress>> = {};
  try {
    [library, progress] = await Promise.all([getLibrary(), getAllProgress()]);
  } catch {
    /* manga opcional */
  }

  return {
    totalEpisodes: history.length,
    distinctGenres: genres.size,
    maxEpisodesInDay: perDay.size ? Math.max(...perDay.values()) : 0,
    lateNight,
    maxStreakDays: maxStreak,
    maxSameAnime: perAnime.size ? Math.max(...perAnime.values()) : 0,
    mangaInLibrary: library.length,
    mangaWithProgress: Object.keys(progress).length,
  };
}

// ─── Definiciones ───────────────────────────────────────────

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  goal: number;
  value: (s: Stats) => number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_episode', title: 'Primer paso',   description: 'Mira tu primer episodio',              icon: 'play_circle',            goal: 1,   value: (s) => s.totalEpisodes },
  { id: 'binge_10',      title: 'Maratón',       description: '10 episodios en un mismo día',         icon: 'local_fire_department',  goal: 10,  value: (s) => s.maxEpisodesInDay },
  { id: 'night_owl',     title: 'Trasnochador',  description: 'Mira un episodio de madrugada (00–05h)', icon: 'bedtime',              goal: 1,   value: (s) => (s.lateNight ? 1 : 0) },
  { id: 'episodes_50',   title: 'Devorador',     description: '50 episodios vistos en total',          icon: 'restaurant',            goal: 50,  value: (s) => s.totalEpisodes },
  { id: 'episodes_100',  title: 'Centurión',     description: '100 episodios vistos en total',         icon: 'military_tech',         goal: 100, value: (s) => s.totalEpisodes },
  { id: 'genres_5',      title: 'Explorador',    description: 'Animes de 5 géneros distintos',         icon: 'explore',               goal: 5,   value: (s) => s.distinctGenres },
  { id: 'streak_3',      title: 'Constante',     description: '3 días seguidos viendo anime',          icon: 'calendar_month',        goal: 3,   value: (s) => s.maxStreakDays },
  { id: 'fan_5',         title: 'Fan nº1',       description: '5 episodios del mismo anime',           icon: 'favorite',              goal: 5,   value: (s) => s.maxSameAnime },
  { id: 'reader_1',      title: 'Lector',        description: 'Lee tu primer capítulo de manga',       icon: 'menu_book',             goal: 1,   value: (s) => s.mangaWithProgress },
  { id: 'librarian_10',  title: 'Bibliotecario', description: '10 mangas en tu biblioteca',            icon: 'auto_stories',          goal: 10,  value: (s) => s.mangaInLibrary },
  { id: 'omnivore',      title: 'Otaku total',   description: 'Ten progreso en anime y manga',         icon: 'workspace_premium',     goal: 2,   value: (s) => (s.totalEpisodes > 0 ? 1 : 0) + (s.mangaWithProgress > 0 ? 1 : 0) },
];

export interface AchievementState {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
  unlockedAt?: number;
}

type UnlockedMap = Record<string, number>; // id → timestamp

async function getUnlockedMap(): Promise<UnlockedMap> {
  return (await getCache<UnlockedMap>(UNLOCKED_KEY)) ?? {};
}

/** Estado completo de todos los logros (para la pantalla de logros). */
export async function getAchievements(): Promise<AchievementState[]> {
  const [stats, unlocked] = await Promise.all([computeStats(), getUnlockedMap()]);
  return ACHIEVEMENTS.map((def) => ({
    def,
    value: Math.min(def.value(stats), def.goal),
    unlocked: !!unlocked[def.id],
    unlockedAt: unlocked[def.id],
  }));
}

/**
 * Recalcula los logros y persiste los recién desbloqueados.
 * Devuelve SOLO los desbloqueados en esta llamada (para celebrarlos).
 */
export async function evaluateAchievements(): Promise<AchievementDef[]> {
  const [stats, unlocked] = await Promise.all([computeStats(), getUnlockedMap()]);

  const newlyUnlocked: AchievementDef[] = [];
  const now = Date.now();

  for (const def of ACHIEVEMENTS) {
    if (!unlocked[def.id] && def.value(stats) >= def.goal) {
      unlocked[def.id] = now;
      newlyUnlocked.push(def);
    }
  }

  if (newlyUnlocked.length > 0) {
    await setCache(UNLOCKED_KEY, unlocked);
  }

  return newlyUnlocked;
}
