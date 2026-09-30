import { describe, it, expect } from 'vitest';
import {
  chapterLabel,
  findChapterIndex,
  firstUnreadIndex,
  formatChapterNumber,
  latestChapterNumber,
  normalizeChapters,
  parseChapterNumber,
} from '../chapters';

const ch = (id: string, chapter: string | null, publishAt = '', title: string | null = null) => ({ id, chapter, publishAt, title });

describe('parseChapterNumber', () => {
  it('lee enteros, decimales y comas', () => {
    expect(parseChapterNumber('12')).toBe(12);
    expect(parseChapterNumber('12.5')).toBe(12.5);
    expect(parseChapterNumber('12,5')).toBe(12.5);
    expect(parseChapterNumber(' 7 ')).toBe(7);
    expect(parseChapterNumber('0')).toBe(0);
  });
  it('separador de miles de InManga (1,000+) no es coma decimal', () => {
    expect(parseChapterNumber('1,000')).toBe(1000);
    expect(parseChapterNumber('1,196')).toBe(1196);
    expect(parseChapterNumber('12,345,678')).toBe(12345678);
    expect(parseChapterNumber('1,000.5')).toBe(1000.5);
    expect(parseChapterNumber('12,50')).toBe(12.5);   // dos decimales: decimal, no miles
    expect(parseChapterNumber('12,5')).toBe(12.5);
  });
  it('los capítulos ≥ 1000 se ordenan después del 999', () => {
    const list = ['1,001', '999', '1,000', '2'].map((c, i) => ({ id: `i${i}`, chapter: c, publishAt: '' }));
    expect(normalizeChapters(list).map((c) => c.chapter)).toEqual(['2', '999', '1,000', '1,001']);
  });
  it('lo que no es número da null', () => {
    for (const v of ['Extra', '', null, undefined, 'Cap. 3', '-1']) expect(parseChapterNumber(v as string)).toBeNull();
  });
});

describe('normalizeChapters', () => {
  it('convierte el orden descendente de InManga en ascendente (así "siguiente" avanza)', () => {
    const inmanga = [ch('c3', '3'), ch('c2', '2'), ch('c1', '1')];
    const out = normalizeChapters(inmanga);
    expect(out.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    // regresión: el lector avanza con índice+1
    expect(out[0 + 1].chapter).toBe('2');
  });

  it('ordena numéricamente, no como texto (10 va después de 9)', () => {
    expect(normalizeChapters([ch('a', '10'), ch('b', '9'), ch('c', '100'), ch('d', '2')]).map((c) => c.chapter)).toEqual(['2', '9', '10', '100']);
  });

  it('respeta los capítulos con decimales (12.5 entre 12 y 13)', () => {
    expect(normalizeChapters([ch('a', '13'), ch('b', '12.5'), ch('c', '12')]).map((c) => c.chapter)).toEqual(['12', '12.5', '13']);
  });

  it('los extras sin número van al final, por fecha', () => {
    const out = normalizeChapters([
      ch('x2', null, '2026-03-01T00:00:00Z'),
      ch('n2', '2'),
      ch('x1', null, '2026-01-01T00:00:00Z'),
      ch('n1', '1'),
    ]);
    expect(out.map((c) => c.id)).toEqual(['n1', 'n2', 'x1', 'x2']);
  });

  it('a igual número, desempata por fecha y luego por posición original (estable)', () => {
    const out = normalizeChapters([
      ch('b', '5', '2026-02-01T00:00:00Z'),
      ch('a', '5', '2026-01-01T00:00:00Z'),
      ch('c', '5', ''),
    ]);
    expect(out.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(normalizeChapters([ch('p', '1'), ch('q', '1')]).map((c) => c.id)).toEqual(['p', 'q']);
  });

  it('elimina duplicados por id y no modifica el original', () => {
    const input = [ch('a', '2'), ch('a', '2'), ch('b', '1')];
    const copy = [...input];
    expect(normalizeChapters(input).map((c) => c.id)).toEqual(['b', 'a']);
    expect(input).toEqual(copy);
  });

  it('aguanta listas enormes y vacías', () => {
    expect(normalizeChapters([])).toEqual([]);
    const big = Array.from({ length: 5000 }, (_, i) => ch(`id${i}`, String(5000 - i)));
    const out = normalizeChapters(big);
    expect(out[0].chapter).toBe('1');
    expect(out[4999].chapter).toBe('5000');
  });
});

describe('utilidades', () => {
  const list = [ch('a', '1'), ch('b', '2', '', 'El inicio'), ch('c', '2.5'), ch('d', null, '', 'Extra especial')];

  it('último capítulo publicado', () => {
    expect(latestChapterNumber(list)).toBe(2.5);
    expect(latestChapterNumber([ch('x', null)])).toBeNull();
    expect(latestChapterNumber([])).toBeNull();
  });

  it('etiquetas', () => {
    expect(chapterLabel(list[0])).toBe('Cap. 1');
    expect(chapterLabel(list[1])).toBe('Cap. 2 — El inicio');
    expect(chapterLabel(list[1], false)).toBe('Cap. 2');
    expect(chapterLabel(list[3])).toBe('Extra especial');
    expect(chapterLabel(ch('z', null))).toBe('Extra');
    expect(formatChapterNumber(12)).toBe('12');
    expect(formatChapterNumber(12.5)).toBe('12.5');
    expect(formatChapterNumber(null)).toBe('?');
  });

  it('ir al capítulo', () => {
    expect(findChapterIndex(list, '2.5')).toBe(2);
    expect(findChapterIndex(list, '2,5')).toBe(2);
    expect(findChapterIndex(list, '99')).toBe(-1);
    expect(findChapterIndex(list, 'abc')).toBe(-1);
  });

  it('primer capítulo por leer', () => {
    const ids = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const read = (...r: string[]) => (c: { id: string }) => r.includes(c.id);
    expect(firstUnreadIndex(ids, read())).toBe(0);
    expect(firstUnreadIndex(ids, read('a'))).toBe(1);
    expect(firstUnreadIndex(ids, read('a', 'b'))).toBe(2);
    expect(firstUnreadIndex(ids, read('a', 'b', 'c'))).toBe(2); // todo leído: se queda en el último
    expect(firstUnreadIndex(ids, read('b'))).toBe(2);           // se sigue desde el último leído
    expect(firstUnreadIndex([], read())).toBe(0);
  });
});
