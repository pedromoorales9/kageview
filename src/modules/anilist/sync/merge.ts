// ═══════════════════════════════════════════════════════════
// Fusión de tres vías: base (último estado acordado) · KageView · AniList
//
// Reglas (probadas en __tests__/merge.test.ts):
//  · Si solo cambió un lado desde la base, se copia ese lado al otro.
//  · Si cambiaron los dos: el progreso es el MAYOR; el estado y la nota, los del
//    cambio más reciente (una nota 0 = «sin nota» nunca pisa una real).
//  · NUNCA se borra nada automáticamente en ninguno de los dos lados: quitar una
//    obra de KageView no la quita de AniList (ni al revés).
//  · El progreso solo baja si el usuario lo baja en KageView (p. ej. «marcar como
//    no leído»); un descenso hecho en AniList no se propaga (se conserva el mayor).
// ═══════════════════════════════════════════════════════════

import type { EntrySnap } from './types';

export interface Side extends EntrySnap {
  /** Cuándo se modificó por última vez (ms). */
  at: number;
}

export interface MergeInput {
  base: EntrySnap | null;
  local: Side | null;
  remote: Side | null;
  /** false = la nota no se sincroniza (el manga de KageView no tiene nota). */
  scoreSynced: boolean;
}

export interface MergeResult {
  /** Nuevo estado acordado (null = sin entrada en ninguno de los lados). */
  next: EntrySnap | null;
  /** Hay que escribir `next` en KageView. */
  toLocal: boolean;
  /** Hay que escribir `next` en AniList. */
  toRemote: boolean;
}

export const snapEq = (a: EntrySnap, b: EntrySnap, scoreSynced = true): boolean =>
  a.status === b.status && a.progress === b.progress && (!scoreSynced || a.score === b.score);

const pure = (s: Side): EntrySnap => ({ status: s.status, progress: s.progress, score: s.score });

export function mergeEntry({ base, local, remote, scoreSynced }: MergeInput): MergeResult {
  // Sin nota local: se toma siempre la de AniList (así nunca hay «cambio» ni conflicto de nota)
  const loc: Side | null = local && !scoreSynced ? { ...local, score: remote?.score ?? base?.score ?? 0 } : local;

  if (!loc && !remote) return { next: null, toLocal: false, toRemote: false };

  // ── Solo en KageView ──
  if (loc && !remote) {
    // Si ya estuvo sincronizada y no la hemos tocado, es que se quitó de AniList: no se resucita
    if (base && snapEq(loc, base, scoreSynced)) return { next: base, toLocal: false, toRemote: false };
    return { next: pure(loc), toLocal: false, toRemote: true };
  }

  // ── Solo en AniList ──
  if (!loc && remote) {
    // Si ya estuvo sincronizada y AniList no cambió, es que se quitó de KageView: no se importa otra vez
    if (base && snapEq(remote, base, scoreSynced)) return { next: base, toLocal: false, toRemote: false };
    return { next: pure(remote), toLocal: true, toRemote: false };
  }

  // ── En los dos ──
  const l = loc as Side;
  const r = remote as Side;
  let next: EntrySnap;

  if (!base) {
    next = resolveBoth(l, r);
  } else {
    const localChanged = !snapEq(l, base, scoreSynced);
    const remoteChanged = !snapEq(r, base, scoreSynced);
    if (!localChanged && !remoteChanged) {
      next = pure(r);
    } else if (localChanged && !remoteChanged) {
      next = pure(l); // incluye bajar el progreso si el usuario lo bajó
    } else if (!localChanged && remoteChanged) {
      // Cambió AniList: estado y nota suyos; el progreso no baja nunca por este camino
      next = { status: r.status, progress: Math.max(r.progress, l.progress), score: r.score };
    } else {
      next = resolveBoth(l, r);
    }
  }

  return {
    next,
    toLocal: !snapEq(next, l, scoreSynced),
    toRemote: !snapEq(next, r, scoreSynced),
  };
}

/** Los dos lados cambiaron (o es la primera vez que se ven): el progreso mayor; lo demás, lo más reciente. */
function resolveBoth(l: Side, r: Side): EntrySnap {
  const newer = l.at > r.at ? l : r;
  const score = l.score === 0 ? r.score : r.score === 0 ? l.score : newer.score;
  return { status: newer.status, progress: Math.max(l.progress, r.progress), score };
}
