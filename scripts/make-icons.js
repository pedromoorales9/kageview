// ═══════════════════════════════════════════════════════════
// make-icons — Genera build/icon.png y build/icon.icns a partir de
// assets/icon.png (logo con la silueta sobre fondo negro).
//
//   1. Recorta la silueta: relleno desde los bordes sobre el negro puro.
//   2. La reescala al 80,5 % del lienzo (plantilla de icono de macOS:
//      824 px de 1024) y añade la sombra suave que llevan los iconos de macOS.
//   3. Exporta PNG 1024 (transparente) y el .icns con todos los tamaños.
//
// Uso:  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/make-icons.js
// (se ejecuta con Electron solo para usar nativeImage; no requiere dependencias extra)
// ═══════════════════════════════════════════════════════════
const { app, nativeImage } = require('electron');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/icon.png');
const OUT_DIR = path.join(ROOT, 'build');
const CANVAS = 1024;
const BODY = 824;          // tamaño de la silueta dentro del lienzo (plantilla macOS)
const BG_THRESHOLD = 6;    // suma R+G+B ≤ 6 se considera fondo negro exterior

function boxBlurAlpha(a, w, h, r) {
  // desenfoque de caja separable sobre un Float32Array de un canal
  const tmp = new Float32Array(a.length);
  const out = new Float32Array(a.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / win;
      sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

app.whenReady().then(() => {
  const src = nativeImage.createFromPath(SRC);
  const { width: W, height: H } = src.getSize();
  const bmp = src.toBitmap(); // BGRA
  const idx = (x, y) => (y * W + x) * 4;
  const isBg = (i) => bmp[i] + bmp[i + 1] + bmp[i + 2] <= BG_THRESHOLD;

  // 1) Localizar el aro fino que delimita la silueta.
  //    El fondo exterior de la fuente NO es limpio (halo de ruido oscuro con
  //    suma R+G+B ≤ ~30 pegado al borde), así que en vez de umbralizar el negro
  //    se busca el ESCALÓN del aro (suma > 45) recorriendo desde fuera hacia
  //    dentro, y con él se ajusta una superelipse ("squircle").
  const RIM_SUM = 45;
  const sum = (x, y) => { const i = idx(x, y); return bmp[i] + bmp[i + 1] + bmp[i + 2]; };
  const isRim = (x, y) => sum(x, y) > RIM_SUM;
  const median = (arr) => arr.sort((p, q) => p - q)[arr.length >> 1];
  const lefts = [], rights = [], tops = [], bottoms = [];
  for (let y = Math.round(H * 0.3); y < H * 0.7; y += 6) {
    let x = 0; while (x < W && !isRim(x, y)) x++; if (x < W) lefts.push(x);
    x = W - 1; while (x >= 0 && !isRim(x, y)) x--; if (x >= 0) rights.push(x);
  }
  for (let x = Math.round(W * 0.3); x < W * 0.7; x += 6) {
    let y = 0; while (y < H && !isRim(x, y)) y++; if (y < H) tops.push(y);
    y = H - 1; while (y >= 0 && !isRim(x, y)) y--; if (y >= 0) bottoms.push(y);
  }
  const rimL = median(lefts), rimR = median(rights), rimT = median(tops), rimB = median(bottoms);
  const cx = (rimL + rimR) / 2, cy = (rimT + rimB) / 2;
  const ha = (rimR - rimL) / 2, hb = (rimB - rimT) / 2;
  // exponente de la superelipse: se ajusta con el punto del aro en la diagonal
  let dk = 0;
  while (dk < Math.min(W, H) / 2 && !isRim(Math.round(rimL + dk), Math.round(rimT + dk))) dk++;
  const t = 1 - dk / ha;                     // fracción del semieje en la diagonal
  const n = Math.min(8, Math.max(3, -Math.LN2 / Math.log(Math.max(0.5, Math.min(0.95, t)))));
  console.log(`aro: x ${rimL}-${rimR}, y ${rimT}-${rimB}; diagonal ${dk}px; exponente n=${n.toFixed(2)}`);

  // 2) Alfa por la ecuación de la superelipse con borde antialias (~1 px).
  //    Se encoge unos px (el arco de las esquinas de la fuente no es una superelipse exacta) para que quede siempre dentro del cuerpo oscuro y no entre
  //    nada del halo exterior.
  const INSET = 6;
  const alpha = new Float32Array(W * H);
  const scale = (ha + hb) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = Math.pow(Math.pow(Math.abs(x - cx) / ha, n) + Math.pow(Math.abs(y - cy) / hb, n), 1 / n);
    alpha[y * W + x] = Math.max(0, Math.min(1, 0.5 + (1 - f) * scale - INSET));
  }

  // Caja que contiene la silueta
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (alpha[y * W + x] > 0.5) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  console.log(`silueta: x ${minX}-${maxX}, y ${minY}-${maxY} (${bw}×${bh})`);

  // 3) Silueta recortada con su alfa → bitmap BGRA **premultiplicado**
  //    (nativeImage/Skia trabajan en alfa premultiplicado; pasar color sin
  //    premultiplicar genera píxeles de colores sueltos en el borde al reescalar)
  const crop = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const s = idx(minX + x, minY + y), d = (y * bw + x) * 4;
    const a = alpha[(minY + y) * W + (minX + x)];
    crop[d] = Math.round(bmp[s] * a); crop[d + 1] = Math.round(bmp[s + 1] * a); crop[d + 2] = Math.round(bmp[s + 2] * a);
    crop[d + 3] = Math.round(a * 255);
  }
  const body = nativeImage
    .createFromBitmap(crop, { width: bw, height: bh })
    .resize({ width: BODY, height: Math.round((BODY * bh) / bw), quality: 'best' });
  const bs = body.getSize();
  const bodyBmp = body.toBitmap(); // premultiplicado

  // 4) Lienzo 1024 transparente: sombra (alfa desenfocado, desplazado) + silueta
  const C = CANVAS;
  const offX = Math.round((C - bs.width) / 2), offY = Math.round((C - bs.height) / 2);
  const bodyAlpha = new Float32Array(C * C);
  for (let y = 0; y < bs.height; y++) for (let x = 0; x < bs.width; x++) {
    bodyAlpha[(y + offY) * C + (x + offX)] = bodyBmp[(y * bs.width + x) * 4 + 3] / 255;
  }
  let shadow = bodyAlpha;
  for (let i = 0; i < 3; i++) shadow = boxBlurAlpha(shadow, C, C, 9); // ≈ gaussiano
  const SHADOW_DY = 14, SHADOW_OPACITY = 0.38;
  const out = Buffer.alloc(C * C * 4); // premultiplicado
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const p = y * C + x;
    // sombra (negra, premultiplicada = solo alfa) desplazada hacia abajo
    const sy = y - SHADOW_DY;
    const sa = (sy >= 0 ? shadow[sy * C + x] : 0) * SHADOW_OPACITY;
    let br = 0, bg2 = 0, bb = 0, fa = 0;
    const bx = x - offX, by = y - offY;
    if (bx >= 0 && by >= 0 && bx < bs.width && by < bs.height) {
      const s = (by * bs.width + bx) * 4;
      bb = bodyBmp[s]; bg2 = bodyBmp[s + 1]; br = bodyBmp[s + 2]; fa = bodyBmp[s + 3] / 255;
    }
    // "over" en premultiplicado: cuerpo + sombra·(1 − alfa del cuerpo)
    out[p * 4] = bb; out[p * 4 + 1] = bg2; out[p * 4 + 2] = br;
    out[p * 4 + 3] = Math.round((fa + sa * (1 - fa)) * 255);
  }
  const final = nativeImage.createFromBitmap(out, { width: C, height: C });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const png1024 = path.join(OUT_DIR, 'icon.png');
  fs.writeFileSync(png1024, final.toPNG());

  // 5) .icns con todos los tamaños (sips reescala conservando el alfa)
  const iconset = path.join(OUT_DIR, 'icon.iconset');
  fs.rmSync(iconset, { recursive: true, force: true });
  fs.mkdirSync(iconset);
  for (const [base, scale] of [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]]) {
    const px = base * scale;
    const name = `icon_${base}x${base}${scale === 2 ? '@2x' : ''}.png`;
    execFileSync('sips', ['-z', String(px), String(px), png1024, '--out', path.join(iconset, name)], { stdio: 'ignore' });
  }
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(OUT_DIR, 'icon.icns')]);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log('OK →', path.join(OUT_DIR, 'icon.png'), path.join(OUT_DIR, 'icon.icns'));
  app.quit();
});
