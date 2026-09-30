/** Máximo "redondo" del eje (siempre par, para que la marca central sea entera). */
export function niceMax(v: number): number {
  const steps = [4, 8, 10, 20, 40, 50, 100, 200, 400, 500];
  for (const s of steps) if (v <= s) return s;
  const mag = Math.pow(10, Math.ceil(Math.log10(v)));
  const unit = mag / 10; // ≥ 10 aquí (v > 500), así que sus múltiplos son pares
  return Math.ceil(v / unit) * unit; // 501 → 600, 4321 → 5000
}

/** Columna con solo el extremo superior redondeado (4 px) y base recta. */
export function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  return `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
}
