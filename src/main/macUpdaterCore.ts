// ═══════════════════════════════════════════════════════════
// macUpdaterCore — lógica PURA del actualizador de macOS (sin Electron)
//
// Por qué existe: `electron-updater` en macOS usa Squirrel.Mac, que exige que la
// app esté firmada con un certificado de Apple Developer. KageView va firmada
// "ad-hoc" (sin certificado de pago), así que Squirrel rechaza la actualización.
// En su lugar la app descarga el .zip de la release, comprueba su huella SHA-512
// (publicada en `latest-mac.yml`, igual que hace electron-updater en Windows),
// lo descomprime junto a la app instalada y la sustituye al reiniciar.
//
// Todo lo que decide qué se descarga, de dónde y adónde se instala está aquí,
// validado con expresiones estrictas y cubierto por tests.
// ═══════════════════════════════════════════════════════════

export const REPO = 'pedromoorales9/kageview';
export const BUNDLE_ID = 'com.sh4dow.kageview';

/** El .zip de una release: ~190 MB. Fuera de este rango algo va mal. */
const MIN_SIZE = 5 * 1024 * 1024;
const MAX_SIZE = 800 * 1024 * 1024;

export interface MacFeed {
  version: string;
  /** Nombre del .zip (validado: `KageView-<versión>-mac.zip`). */
  file: string;
  /** SHA-512 en base64, tal cual lo publica electron-builder. */
  sha512: string;
  size: number;
}

const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SHA512_B64_RE = /^[A-Za-z0-9+/]{86}==$/;

const unquote = (s: string) => s.trim().replace(/^['"]|['"]$/g, '');

/**
 * Lee `latest-mac.yml` (formato de electron-builder) y devuelve el .zip de la
 * versión publicada, o null si el archivo es dudoso. Nunca se fía de una URL
 * del YAML: solo del nombre, que debe ser exactamente `KageView-<v>-mac.zip`.
 */
export function parseLatestMac(yml: string): MacFeed | null {
  const version = /^version:\s*(\S+)\s*$/m.exec(yml)?.[1];
  if (!version || !VERSION_RE.test(unquote(version))) return null;
  const v = unquote(version);
  const expectedFile = `KageView-${v}-mac.zip`;

  const entry = /-\s+url:\s*(\S+)\s*\r?\n\s+sha512:\s*(\S+)\s*\r?\n\s+size:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = entry.exec(yml)) !== null) {
    const file = unquote(m[1]);
    if (file !== expectedFile) continue;
    const sha512 = unquote(m[2]);
    const size = Number(m[3]);
    if (!SHA512_B64_RE.test(sha512)) return null;
    if (!Number.isFinite(size) || size < MIN_SIZE || size > MAX_SIZE) return null;
    return { version: v, file, sha512, size };
  }
  return null;
}

/** -1, 0, 1; null si alguna no es `x.y.z`. */
export function compareVersions(a: string, b: string): number | null {
  if (!VERSION_RE.test(a) || !VERSION_RE.test(b)) return null;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

export function isNewer(current: string, candidate: string): boolean {
  return compareVersions(current, candidate) === -1;
}

// ─── Dónde se consulta y de dónde se descarga ──────────────
export interface FeedLocation {
  feedUrl: string;
  /** Devuelve la URL de descarga del .zip de esa versión. */
  fileUrl: (version: string, file: string) => string;
}

/**
 * GitHub por defecto. Para pruebas locales se admite `KAGEVIEW_UPDATE_FEED`,
 * pero SOLO si apunta a este mismo equipo (http://127.0.0.1:puerto): así una
 * variable de entorno nunca puede redirigir las actualizaciones a otro servidor.
 */
export function feedLocation(override: string | undefined): FeedLocation {
  const origin = override && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(override) ? override : null;
  if (origin) {
    return { feedUrl: `${origin}/latest-mac.yml`, fileUrl: (_v, file) => `${origin}/${file}` };
  }
  return {
    feedUrl: `https://github.com/${REPO}/releases/latest/download/latest-mac.yml`,
    fileUrl: (v, file) => `https://github.com/${REPO}/releases/download/v${v}/${file}`,
  };
}

/** Del cuerpo de la release, solo las viñetas (`- algo`), para el aviso de novedades. */
export function releaseNotesFromBody(body: string | null | undefined): string | null {
  if (!body) return null;
  const bullets = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+\S/.test(l))
    // sin el marcador ni el formato (**negrita**, `código`); la interfaz espera "- texto"
    .map((l) => `- ${l.replace(/^[-*]\s+/, '').replace(/[*_`]/g, '').trim()}`)
    .slice(0, 6);
  return bullets.length ? bullets.join('\n') : null;
}

// ─── Dónde está instalada la app ───────────────────────────
/** `/Applications/KageView.app/Contents/MacOS/KageView` → `/Applications/KageView.app`. */
export function bundlePathFromExe(exePath: string): string | null {
  const m = /^(.*\.app)\/Contents\/MacOS\/[^/]+$/.exec(exePath);
  return m ? m[1] : null;
}

export interface InstallContext {
  isPackaged: boolean;
  bundlePath: string | null;
  /** ¿Se puede escribir en la carpeta que contiene la app y en la propia app? */
  writable: boolean;
}

/** null = se puede actualizar sola; si no, el motivo (para mostrárselo al usuario). */
export function installBlockReason(ctx: InstallContext): string | null {
  if (!ctx.isPackaged) return 'Solo la app instalada se actualiza sola (esto es una ejecución de desarrollo).';
  if (!ctx.bundlePath) return 'No se pudo localizar la app instalada.';
  if (ctx.bundlePath.startsWith('/Volumes/')) {
    return 'KageView se está ejecutando desde la imagen de disco. Arrástrala a Aplicaciones y ábrela desde ahí.';
  }
  if (ctx.bundlePath.includes('/AppTranslocation/')) {
    return 'macOS está ejecutando KageView aislada. Muévela a Aplicaciones, ciérrala y ábrela de nuevo.';
  }
  if (!ctx.writable) {
    return 'KageView está en una carpeta sin permisos de escritura. Descarga la nueva versión manualmente.';
  }
  return null;
}

// ─── Sustitución de la app (script de shell) ───────────────
/**
 * Se lanza desconectado de la app con `sh -c SWAP_SCRIPT sh <pid> <appActual> <appNueva>`.
 * Los tres datos llegan como argumentos posicionales (nunca interpolados en el
 * texto del script), así que ninguna ruta puede inyectar comandos.
 *
 *  1. Espera a que la app cierre (máx. 30 s). Si no cierra, NO toca nada.
 *  2. Aparta la app actual (`.kageview-old`), coloca la nueva en su sitio (mismo
 *     volumen → renombrado atómico) y la abre.
 *  3. Si algo falla, devuelve la antigua a su sitio y la abre.
 *  4. Limpia la carpeta de preparación y deja un registro en ~/Library/Logs.
 *
 * `OPEN_CMD` solo lo usan los tests (para no abrir apps de verdad).
 */
export const SWAP_SCRIPT = `
PID="$1"; OLD="$2"; NEW="$3"
BAK="$OLD.kageview-old"
STAGE="$(dirname "$NEW")"
OPEN="\${OPEN_CMD:-open}"
LOG="\${KAGEVIEW_UPDATE_LOG:-$HOME/Library/Logs/KageView-update.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null
exec >>"$LOG" 2>&1
echo "[$(date '+%F %T')] actualizando $OLD desde $NEW (pid $PID)"

i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -gt 60 ]; then echo "la app no se cerró; no se toca nada"; exit 1; fi
  sleep 0.5
done

if [ ! -d "$NEW" ]; then echo "falta la app nueva"; "$OPEN" "$OLD"; exit 1; fi
rm -rf "$BAK"

if ! mv "$OLD" "$BAK"; then echo "no se pudo apartar la app actual"; rm -rf "$STAGE"; "$OPEN" "$OLD"; exit 1; fi
if ! mv "$NEW" "$OLD"; then
  echo "no se pudo colocar la app nueva: se restaura la anterior"
  mv "$BAK" "$OLD"; rm -rf "$STAGE"; "$OPEN" "$OLD"; exit 1
fi

xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
rm -rf "$BAK" "$STAGE"
echo "actualización completada"
"$OPEN" "$OLD"
`;
