// ═══════════════════════════════════════════════════════════
// make-dmg-background — Renderiza scripts/dmg-background.html a
// build/dmg-background.png (660×400) + @2x (1320×800) y las combina en un
// TIFF retina (build/dmg-background.tiff) que usa electron-builder.
//
// Uso:  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/make-dmg-background.js
// ═══════════════════════════════════════════════════════════
const { app, BrowserWindow } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build');
const W = 660, H = 400;

app.commandLine.appendSwitch('force-device-scale-factor', '2');
app.commandLine.appendSwitch('high-dpi-support', '1');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: W, height: H, useContentSize: true, frame: false,
    transparent: false, backgroundColor: '#09050a',
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });
  await win.loadFile(path.join(__dirname, 'dmg-background.html'));
  await new Promise((r) => setTimeout(r, 600)); // fuentes y degradados listos
  const img2x = await win.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
  const size = img2x.getSize();
  console.log('captura', size.width, 'x', size.height);
  fs.mkdirSync(OUT, { recursive: true });
  const p1 = path.join(OUT, 'dmg-background.png');
  const p2 = path.join(OUT, 'dmg-background@2x.png');
  fs.writeFileSync(p2, size.width === W * 2 ? img2x.toPNG() : img2x.resize({ width: W * 2, height: H * 2, quality: 'best' }).toPNG());
  fs.writeFileSync(p1, img2x.resize({ width: W, height: H, quality: 'best' }).toPNG());
  // dpi correcto para que tiffutil los reconozca como 1x / 2x
  execFileSync('sips', ['-s', 'dpiWidth', '72', '-s', 'dpiHeight', '72', p1], { stdio: 'ignore' });
  execFileSync('sips', ['-s', 'dpiWidth', '144', '-s', 'dpiHeight', '144', p2], { stdio: 'ignore' });
  execFileSync('tiffutil', ['-cathidpicheck', p1, p2, '-out', path.join(OUT, 'dmg-background.tiff')]);
  console.log('OK →', path.join(OUT, 'dmg-background.tiff'));
  app.quit();
});
