import { describe, it, expect } from 'vitest';
import {
  Range,
  addNumber,
  addSpan,
  countCovered,
  hasNumber,
  normalizeRanges,
  parseRanges,
  rangesFromNumbers,
  removeNumber,
  sameRanges,
  unionRanges,
} from '../readRanges';

describe('normalizeRanges', () => {
  it('ordena y fusiona solapados y enteros contiguos', () => {
    expect(normalizeRanges([[5, 9], [1, 4]])).toEqual([[1, 9]]);
    expect(normalizeRanges([[1, 5], [3, 8]])).toEqual([[1, 8]]);
    expect(normalizeRanges([[1, 3], [5, 7]])).toEqual([[1, 3], [5, 7]]);       // hay hueco (el 4)
    expect(normalizeRanges([[10, 10], [1, 2], [11, 11]])).toEqual([[1, 2], [10, 11]]);
  });
  it('los decimales no se fusionan con los enteros contiguos', () => {
    // los enteros 1–12 y 13–20 son contiguos y se fusionan; el 12,5 se conserva aparte
    expect(normalizeRanges([[1, 12], [12.5, 12.5], [13, 20]])).toEqual([[1, 20], [12.5, 12.5]]);
    expect(hasNumber(normalizeRanges([[1, 12], [12.5, 12.5], [13, 20]]), 12.5)).toBe(true);
    expect(hasNumber(normalizeRanges([[1, 12], [13, 20]]), 12.5)).toBe(false);
    expect(normalizeRanges([[12.5, 12.5], [12.5, 12.5]])).toEqual([[12.5, 12.5]]);
  });
  it('descarta lo inválido y no modifica la entrada', () => {
    const input: Range[] = [[5, 1], [NaN, 3], [2, 4]];
    const copy = JSON.parse(JSON.stringify(input));
    expect(normalizeRanges(input)).toEqual([[2, 4]]);
    expect(JSON.parse(JSON.stringify(input))).toEqual(copy);
  });
});

describe('hasNumber', () => {
  const r: Range[] = [[1, 45], [47, 47], [12.5, 12.5]];
  it('enteros dentro de un rango y en sus extremos', () => {
    for (const n of [1, 2, 30, 45, 47]) expect(hasNumber(normalizeRanges(r), n)).toBe(true);
    for (const n of [0, 46, 48, 100]) expect(hasNumber(normalizeRanges(r), n)).toBe(false);
  });
  it('un decimal solo cuenta si se marcó él mismo', () => {
    expect(hasNumber(normalizeRanges(r), 12.5)).toBe(true);
    expect(hasNumber(normalizeRanges(r), 13.5)).toBe(false);
    expect(hasNumber([[1, 45]], 12.5)).toBe(false);          // entre el 12 y el 13 NO está leído
  });
  it('valores raros', () => {
    expect(hasNumber([[1, 5]], null)).toBe(false);
    expect(hasNumber([[1, 5]], undefined)).toBe(false);
    expect(hasNumber([[1, 5]], NaN)).toBe(false);
    expect(hasNumber([], 3)).toBe(false);
  });
});

describe('añadir y quitar', () => {
  it('leer capítulos sueltos va formando rangos', () => {
    let r: Range[] = [];
    for (const n of [1, 2, 3, 5, 4, 10]) r = addNumber(r, n);
    expect(r).toEqual([[1, 5], [10, 10]]);
    expect(addNumber(r, 3)).toEqual(r);                      // repetir no cambia nada
    expect(addNumber(r, 12.5)).toEqual([[1, 5], [10, 10], [12.5, 12.5]]);
  });
  it('ignora números absurdos', () => {
    expect(addNumber([[1, 2]], -1)).toEqual([[1, 2]]);
    expect(addNumber([[1, 2]], 1e9)).toEqual([[1, 2]]);
    expect(addNumber([[1, 2]], NaN)).toEqual([[1, 2]]);
  });
  it('marcar hasta aquí', () => {
    expect(addSpan([], 1, 30)).toEqual([[1, 30]]);
    expect(addSpan([[40, 50]], 1, 39)).toEqual([[1, 50]]);
    expect(addSpan([[1, 5]], 9, 3)).toEqual([[1, 5]]);        // rango invertido: nada
  });
  it('quitar parte un rango en dos', () => {
    expect(removeNumber([[1, 10]], 5)).toEqual([[1, 4], [6, 10]]);
    expect(removeNumber([[1, 10]], 1)).toEqual([[2, 10]]);
    expect(removeNumber([[1, 10]], 10)).toEqual([[1, 9]]);
    expect(removeNumber([[5, 5]], 5)).toEqual([]);
    expect(removeNumber([[1, 10]], 20)).toEqual([[1, 10]]);   // no estaba
    expect(removeNumber([[1, 12], [12.5, 12.5]], 12.5)).toEqual([[1, 12]]);
  });
  it('quitar y volver a poner deja lo mismo', () => {
    const r: Range[] = [[1, 20]];
    expect(addNumber(removeNumber(r, 7), 7)).toEqual(r);
  });
});

describe('utilidades', () => {
  it('unión, desde números, igualdad y recuento', () => {
    expect(unionRanges([[1, 3]], [[4, 6], [10, 10]])).toEqual([[1, 6], [10, 10]]);
    expect(rangesFromNumbers([3, 1, 2, 9, 2.5])).toEqual([[1, 3], [2.5, 2.5], [9, 9]]);
    expect(sameRanges([[1, 3]], [[1, 3]])).toBe(true);
    expect(sameRanges([[1, 3]], [[1, 4]])).toBe(false);
    expect(countCovered([[1, 45], [47, 47], [12.5, 12.5]])).toBe(47);
    expect(countCovered([])).toBe(0);
  });
});

describe('parseRanges (datos de fuera: nunca lanza)', () => {
  it('lee lo válido y descarta lo demás', () => {
    expect(parseRanges([[1, 5], [3, 9]])).toEqual([[1, 9]]);
    for (const bad of [null, undefined, 'texto', 5, {}, [[1]], [['a', 'b']], [[5, 1]], [[-1, 2]], [[1, 1e9]], [[NaN, 2]], [[1, 2, 3]]]) {
      expect(parseRanges(bad)).toEqual([]);
    }
    expect(parseRanges([[1, 3], 'x', null, [7, 7]])).toEqual([[1, 3], [7, 7]]);
  });
  it('acota el tamaño', () => {
    const many = Array.from({ length: 5000 }, (_, i) => [i * 2, i * 2]);
    expect(parseRanges(many).length).toBeLessThanOrEqual(2000);
  });
});
