import fs from 'fs';
import path from 'path';
import webpack from 'webpack';

// ═══════════════════════════════════════════════════════════
// Carga la configuración pública desde `.env` (raíz del proyecto, NO
// versionado) y la inyecta en el bundle del renderer.
//
//   SUPABASE_URL / SUPABASE_ANON_KEY  → backend de cuentas (la anon key es
//     PÚBLICA por diseño: la seguridad la da RLS. NUNCA pongas aquí la
//     service_role key).
//   KAGEVIEW_BACKEND=mock             → backend en memoria (solo desarrollo)
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
    'process.env.SUPABASE_URL': pick('SUPABASE_URL', ''),
    'process.env.SUPABASE_ANON_KEY': pick('SUPABASE_ANON_KEY', ''),
    'process.env.KAGEVIEW_BACKEND': pick('KAGEVIEW_BACKEND', ''),
    'process.env.DISCORD_CLIENT_ID': pick('DISCORD_CLIENT_ID', ''),
  });
}
