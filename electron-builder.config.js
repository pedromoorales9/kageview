// ═══════════════════════════════════════════════════════════
// KageView — Configuración de empaquetado (electron-builder)
//
//   npm run dist:mac    → instalador .dmg para macOS (Apple Silicon + Intel)
//   npm run dist:win    → instalador NSIS para Windows
//   npm run dist:linux  → AppImage + deb
//
// FIRMA EN macOS
//   · Sin Developer ID (por defecto): la app se firma "ad-hoc" (hook
//     scripts/adhoc-sign.js). En Apple Silicon es obligatorio que el binario lleve
//     al menos esa firma para arrancar. Gatekeeper NO la considera de confianza:
//     el usuario debe autorizarla la primera vez (clic derecho → Abrir, o
//     Ajustes del Sistema → Privacidad y seguridad → "Abrir igualmente").
//   · Con Developer ID (Apple Developer Program, 99 $/año): define
//         CSC_LINK / CSC_KEY_PASSWORD   (o tener el certificado en el llavero)
//         APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER   (notarización)
//     y el mismo comando firma con hardened runtime y notariza. Entonces los
//     usuarios abren la app sin avisos y la autoactualización funciona.
// ═══════════════════════════════════════════════════════════

const hasDeveloperId = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const canNotarize = hasDeveloperId && Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
  (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
);

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.sh4dow.kageview',
  productName: 'KageView',
  copyright: 'Copyright © 2026 Sh4Dow',
  directories: { output: 'release/build', buildResources: 'build' },
  files: ['dist/**/*', 'package.json'],
  asar: true,

  // kageview://auth-callback (confirmación de correo / recuperar contraseña)
  protocols: [{ name: 'KageView', schemes: ['kageview'] }],

  publish: { provider: 'github', owner: 'pedromoorales9', repo: 'KageView' },

  // ─── macOS ───────────────────────────────────────────────
  mac: {
    // Un único .dmg que sirve para Apple Silicon e Intel
    target: [{ target: 'dmg', arch: ['universal'] }].concat(
      // El .zip solo hace falta para la autoactualización, que exige firma real
      hasDeveloperId ? [{ target: 'zip', arch: ['universal'] }] : []
    ),
    icon: 'build/icon.icns',
    category: 'public.app-category.entertainment',
    darkModeSupport: true,
    minimumSystemVersion: '11.0.0',
    artifactName: '${productName}-${version}-mac.${ext}',
    // Sin Developer ID no se firma aquí: lo hace el hook afterSign (ad-hoc)
    ...(hasDeveloperId
      ? {
          hardenedRuntime: true,
          gatekeeperAssess: false,
          entitlements: 'build/entitlements.mac.plist',
          entitlementsInherit: 'build/entitlements.mac.plist',
          notarize: canNotarize,
        }
      : { identity: null }),
  },
  afterSign: 'scripts/adhoc-sign.js',

  // ─── Ventana del instalador (.dmg) ───────────────────────
  dmg: {
    title: 'KageView ${version}',
    icon: 'build/icon.icns',
    background: 'build/dmg-background.tiff', // 660×400 @1x/@2x
    iconSize: 104,
    iconTextSize: 13,
    // La altura de la ventana INCLUYE la barra de título (~30 px): 430 deja
    // visibles los 400 px del fondo. Los iconos se colocan sobre el contenido.
    window: { width: 660, height: 430 },
    contents: [
      { x: 170, y: 200, type: 'file' },
      { x: 490, y: 200, type: 'link', path: '/Applications', name: 'Aplicaciones' },
    ],
    format: 'UDZO',
    sign: false, // el .dmg en sí no se firma; la app de dentro sí
  },

  // ─── Windows ─────────────────────────────────────────────
  win: {
    target: ['nsis'],
    icon: 'build/icon.png',
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'KageView',
  },

  // ─── Linux ───────────────────────────────────────────────
  linux: {
    target: ['AppImage', 'deb'],
    icon: 'build/icon.png',
    category: 'Video',
  },
};
