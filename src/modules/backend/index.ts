// ═══════════════════════════════════════════════════════════
// Selector de backend de cuentas
//
//   KAGEVIEW_BACKEND=mock            → MockBackend (solo desarrollo)
//   SUPABASE_URL + SUPABASE_ANON_KEY → SupabaseBackend
//   ninguna de las dos               → null (la UI muestra "cuentas no
//                                       configuradas"; el catálogo sigue
//                                       funcionando sin cuenta)
// ═══════════════════════════════════════════════════════════

import { AccountBackend } from './types';
import { SupabaseBackend } from './supabaseBackend';

let instance: AccountBackend | null | undefined;

export function getBackend(): AccountBackend | null {
  if (instance !== undefined) return instance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  // La condición debe ser LITERAL (`process.env.X === 'mock'`, sin pasar por una
  // variable): webpack la evalúa en tiempo de compilación y, en producción
  // (KAGEVIEW_BACKEND vacío), descarta el require y el mock queda fuera del bundle.
  if (process.env.KAGEVIEW_BACKEND === 'mock') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MockBackend } = require('./mockBackend') as typeof import('./mockBackend');
    instance = new MockBackend();
  } else if (url && key) {
    instance = new SupabaseBackend(url, key);
  } else {
    instance = null;
  }
  return instance;
}

/** Solo para pruebas: sustituye el backend (p. ej. por un MockBackend). */
export function __setBackendForTests(backend: AccountBackend | null): void {
  instance = backend;
}

export function isBackendConfigured(): boolean {
  return getBackend() !== null;
}

export * from './types';
export { mapError, AUTH_CALLBACK_URL } from './supabaseBackend';
