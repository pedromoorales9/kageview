// ═══════════════════════════════════════════════════════════
// afterSign — firma "ad-hoc" cuando no hay certificado de Developer ID.
//
// electron-builder modifica el .app de Electron (nombre, Info.plist, asar…),
// lo que invalida la firma original; en Apple Silicon un binario sin firma
// válida no arranca ("killed: 9"). La firma ad-hoc (`-`) no da confianza ante
// Gatekeeper, pero permite ejecutar la app tras autorizarla el usuario.
// ═══════════════════════════════════════════════════════════
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return; // firma real: la hace electron-builder

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • firma ad-hoc  ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
};
