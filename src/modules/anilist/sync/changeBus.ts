// Aviso mínimo de «tu lista de anime cambió» (sin dependencias, para no crear ciclos
// entre library.ts y el motor de sincronización con AniList).
const listeners = new Set<() => void>();

export function onAnimeListChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Lo llama library.ts tras guardar un cambio HECHO POR EL USUARIO. */
export function emitAnimeListChange(): void {
  listeners.forEach((cb) => cb());
}
