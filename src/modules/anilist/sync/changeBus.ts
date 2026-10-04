// Aviso mínimo de «tu lista de anime cambió» (sin dependencias, para no crear ciclos
// entre library.ts y el motor de sincronización con AniList).

/** Lo que cambió: permite enviar SOLO ese anime a AniList al momento. */
export interface AnimeChange {
  mediaId: number;
  title: string;
  status: 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'PAUSED' | 'DROPPED' | 'REPEATING';
  progress: number;
  score: number;
}

type Listener = (change?: AnimeChange) => void;
const listeners = new Set<Listener>();

export function onAnimeListChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Lo llama library.ts tras guardar un cambio HECHO POR EL USUARIO. */
export function emitAnimeListChange(change?: AnimeChange): void {
  listeners.forEach((cb) => cb(change));
}
