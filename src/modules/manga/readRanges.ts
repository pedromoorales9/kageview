// ═══════════════════════════════════════════════════════════
// readRanges — capítulos leídos como rangos de números
//
//   [[1,45],[47,47],[12.5,12.5]]  =  capítulos 1–45, 47 y 12,5
//
// Es la forma compacta que se sincroniza con la cuenta (una serie de 1200
// capítulos leídos ocupa unos bytes) y sirve entre dispositivos y fuentes,
// porque el NÚMERO de capítulo no cambia aunque cambie su id.
//
// Un rango [a, b] cubre todos los capítulos ENTEROS entre a y b, más los propios
// extremos (así 12,5 no queda «leído» por estar entre el 12 y el 13).
// ═══════════════════════════════════════════════════════════

export type Range = [number, number];

const MAX_RANGES = 2000;
const MAX_NUMBER = 100_000;

const isInt = (n: number) => Number.isInteger(n);

/**
 * Ordena y fusiona los tramos solapados o de enteros contiguos ([1,4]+[5,9] →
 * [1,9]). Los capítulos decimales sueltos (12,5) se conservan aparte: un decimal
 * dentro de un tramo NO queda absorbido (haber leído 1–45 no implica el 12,5).
 */
export function normalizeRanges(list: readonly Range[]): Range[] {
  const valid = list.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a <= b);
  const points = new Set<number>();
  const spans: Range[] = [];
  for (const [a, b] of valid) {
    if (a === b && !isInt(a)) points.add(a);
    else spans.push([a, b]);
  }

  spans.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const merged: Range[] = [];
  for (const r of spans) {
    const last = merged[merged.length - 1];
    if (last) {
      const overlap = r[0] <= last[1];
      const adjacent = isInt(last[1]) && isInt(r[0]) && r[0] <= last[1] + 1;
      if (overlap || adjacent) {
        last[1] = Math.max(last[1], r[1]);
        continue;
      }
    }
    merged.push([r[0], r[1]]);
  }

  const out: Range[] = [...merged, ...[...points].map((p): Range => [p, p])];
  return out.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

/** ¿Está el capítulo `n` cubierto? */
export function hasNumber(ranges: readonly Range[], n: number | null | undefined): boolean {
  if (n === null || n === undefined || !Number.isFinite(n)) return false;
  const integer = isInt(n);
  for (const [a, b] of ranges) {
    if (n === a || n === b) return true;
    if (integer && n > a && n < b) return true;
    if (a > n) break; // ordenados: ya nos pasamos
  }
  return false;
}

export function addNumber(ranges: readonly Range[], n: number): Range[] {
  if (!Number.isFinite(n) || n < 0 || n > MAX_NUMBER || hasNumber(ranges, n)) return [...ranges] as Range[];
  return normalizeRanges([...ranges, [n, n]]);
}

/** Añade los enteros de `from` a `to` de golpe (para «marcar hasta aquí»). */
export function addSpan(ranges: readonly Range[], from: number, to: number): Range[] {
  if (![from, to].every(Number.isFinite) || from > to) return [...ranges] as Range[];
  return normalizeRanges([...ranges, [from, to]]);
}

export function removeNumber(ranges: readonly Range[], n: number): Range[] {
  if (!hasNumber(ranges, n)) return [...ranges] as Range[];
  const out: Range[] = [];
  for (const [a, b] of ranges) {
    const covers = n === a || n === b || (isInt(n) && n > a && n < b);
    if (!covers) {
      out.push([a, b]);
      continue;
    }
    if (a === b) continue; // [n,n] desaparece
    if (!isInt(n)) {
      out.push([a, b]); // un decimal en el extremo de un rango ancho no se toca (no se genera nunca aquí)
      continue;
    }
    if (n > a) out.push([a, n - 1]);
    if (n < b) out.push([n + 1, b]);
  }
  return normalizeRanges(out);
}

export const unionRanges = (a: readonly Range[], b: readonly Range[]): Range[] => normalizeRanges([...a, ...b]);

export function rangesFromNumbers(nums: readonly number[]): Range[] {
  return normalizeRanges(nums.filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_NUMBER).map((n): Range => [n, n]));
}

/** Cuántos capítulos enteros hay cubiertos (para mostrar un total). */
export function countCovered(ranges: readonly Range[]): number {
  let n = 0;
  for (const [a, b] of ranges) {
    if (a === b) n += 1;
    else n += Math.floor(b) - Math.ceil(a) + 1 + (isInt(a) ? 0 : 1) + (isInt(b) ? 0 : 1);
  }
  return n;
}

export function sameRanges(a: readonly Range[], b: readonly Range[]): boolean {
  return a.length === b.length && a.every((r, i) => r[0] === b[i][0] && r[1] === b[i][1]);
}

/**
 * Rangos que llegan de FUERA (la nube, otro dispositivo, un amigo): se leen a la
 * defensiva y se descarta lo que no encaje, sin lanzar nunca.
 */
export function parseRanges(value: unknown): Range[] {
  if (!Array.isArray(value)) return [];
  const out: Range[] = [];
  for (const item of value.slice(0, MAX_RANGES)) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [a, b] = item;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b > MAX_NUMBER || a > b) continue;
    out.push([a, b]);
  }
  return normalizeRanges(out);
}
