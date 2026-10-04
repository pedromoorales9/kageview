// ═══════════════════════════════════════════════════════════
// Los modos de prueba (KAGEVIEW_BACKEND=mock / KAGEVIEW_ANILIST=mock) guardan sus datos
// en su PROPIA carpeta. Si compartieran la de la app normal, la biblioteca y los vínculos
// de ejemplo acabarían en una cuenta real (así se coló una vez en un AniList de verdad).
//
// Debe importarse el PRIMERO en main.ts: los almacenes (electron-store) fijan su ruta al
// crearse. En las compilaciones normales las variables valen '' y esto no hace nada.
// ═══════════════════════════════════════════════════════════

import { app } from 'electron';
import path from 'path';

if (process.env.KAGEVIEW_BACKEND === 'mock' || process.env.KAGEVIEW_ANILIST === 'mock') {
  app.setPath('userData', path.join(app.getPath('appData'), `${app.getName()}-mock`));
}
