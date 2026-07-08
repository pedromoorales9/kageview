import fs from 'fs';
import path from 'path';
import webpack from 'webpack';

// ═══════════════════════════════════════════════════════════
// Carga las credenciales OAuth de AniList desde `.env` (raíz del
// proyecto, NO versionado) y las inyecta en el bundle del renderer.
//
// Así las credenciales persisten en la máquina y se incrustan
// automáticamente en cada build/update, sin depender de un
// clientData.ts manual que se pierda entre versiones.
//
// Prioridad: variable de entorno real (CI) > .env > valor por defecto.
// ═══════════════════════════════════════════════════════════

const rootDir = path.resolve(__dirname, '../..');

function parseDotEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return out;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function anilistDefinePlugin(): webpack.DefinePlugin {
  const env = parseDotEnv();
  const pick = (key: string, fallback: string) =>
    JSON.stringify(process.env[key] ?? env[key] ?? fallback);

  return new webpack.DefinePlugin({
    'process.env.ANILIST_CLIENT_ID': pick('ANILIST_CLIENT_ID', '0'),
    'process.env.ANILIST_CLIENT_SECRET': pick('ANILIST_CLIENT_SECRET', ''),
    'process.env.ANILIST_REDIRECT_URI': pick('ANILIST_REDIRECT_URI', 'kageview://auth'),
    'process.env.DISCORD_CLIENT_ID': pick('DISCORD_CLIENT_ID', ''),
    // Contraseña del Panel de Desarrollador (Ajustes). Vacía = panel
    // desactivado por completo. Solo es una barrera de UI: la
    // autorización real para publicar cambios es el PAT de GitHub,
    // que nunca se incrusta en la build.
    'process.env.DEV_PANEL_PASSWORD': pick('DEV_PANEL_PASSWORD', ''),
  });
}
