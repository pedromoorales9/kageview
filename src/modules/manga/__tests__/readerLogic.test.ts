import { describe, it, expect } from 'vitest';
import {
  alignToSpread,
  arrowStep,
  buildPageUrls,
  chapterProgress,
  clickZone,
  currentCascadePage,
  pageStep,
  reachedEnd,
  resumePage,
  siblingIndex,
} from '../readerLogic';

describe('dirección de lectura', () => {
  it('izquierda→derecha: la mitad derecha y la flecha derecha avanzan', () => {
    expect(clickZone(750, 0, 1000, 'ltr')).toBe('next');
    expect(clickZone(250, 0, 1000, 'ltr')).toBe('prev');
    expect(arrowStep('ArrowRight', 'ltr')).toBe('next');
    expect(arrowStep('ArrowLeft', 'ltr')).toBe('prev');
  });

  it('derecha→izquierda (manga japonés): todo invertido', () => {
    expect(clickZone(750, 0, 1000, 'rtl')).toBe('prev');
    expect(clickZone(250, 0, 1000, 'rtl')).toBe('next');
    expect(arrowStep('ArrowRight', 'rtl')).toBe('prev');
    expect(arrowStep('ArrowLeft', 'rtl')).toBe('next');
  });

  it('el clic respeta el desplazamiento del contenedor', () => {
    expect(clickZone(1300, 1000, 600, 'ltr')).toBe('prev'); // el centro exacto cuenta como mitad izquierda
    expect(clickZone(1290, 1000, 600, 'ltr')).toBe('prev');
    expect(clickZone(1301, 1000, 600, 'ltr')).toBe('next');
  });

  it('otras teclas no son flechas laterales', () => {
    for (const k of ['ArrowUp', 'ArrowDown', ' ', 'a']) expect(arrowStep(k, 'ltr')).toBeNull();
  });
});

describe('páginas', () => {
  it('paso y alineación de pliegos', () => {
    expect(pageStep('single')).toBe(1);
    expect(pageStep('cascade')).toBe(1);
    expect(pageStep('double')).toBe(2);
    expect([0, 1, 2, 3, 7].map(alignToSpread)).toEqual([0, 0, 2, 2, 6]);
  });

  it('final del capítulo según el modo', () => {
    expect(reachedEnd(9, 10, 'single')).toBe(true);
    expect(reachedEnd(8, 10, 'single')).toBe(false);
    expect(reachedEnd(8, 10, 'double')).toBe(true);   // pliego 8-9
    expect(reachedEnd(6, 10, 'double')).toBe(false);
    expect(reachedEnd(8, 9, 'double')).toBe(true);    // última página suelta
    expect(reachedEnd(0, 0, 'single')).toBe(false);
  });

  it('porcentaje', () => {
    expect(chapterProgress(0, 10)).toBe(10);
    expect(chapterProgress(9, 10)).toBe(100);
    expect(chapterProgress(50, 10)).toBe(100);
    expect(chapterProgress(3, 0)).toBe(0);
  });

  it('capítulo anterior / siguiente', () => {
    expect(siblingIndex(0, 5, 'prev')).toBeNull();
    expect(siblingIndex(0, 5, 'next')).toBe(1);
    expect(siblingIndex(4, 5, 'next')).toBeNull();
    expect(siblingIndex(4, 5, 'prev')).toBe(3);
    expect(siblingIndex(0, 1, 'next')).toBeNull();
  });
});

describe('retomar', () => {
  it('vuelve a la página guardada si es ese capítulo', () => {
    expect(resumePage({ chapterId: 'c1', page: 12 }, 'c1', 30)).toBe(12);
  });
  it('otro capítulo o sin datos: empieza de cero', () => {
    expect(resumePage({ chapterId: 'c1', page: 12 }, 'c2', 30)).toBe(0);
    expect(resumePage(undefined, 'c1', 30)).toBe(0);
    expect(resumePage({ chapterId: 'c1', page: 12 }, 'c1', 0)).toBe(0);
  });
  it('si ya lo habías terminado, se relee desde el principio', () => {
    expect(resumePage({ chapterId: 'c1', page: 29 }, 'c1', 30)).toBe(0);
    expect(resumePage({ chapterId: 'c1', page: 40 }, 'c1', 30)).toBe(0);
  });
  it('una página guardada de más (el capítulo cambió) no se sale del rango', () => {
    expect(resumePage({ chapterId: 'c1', page: 25 }, 'c1', 27)).toBe(25);
    expect(resumePage({ chapterId: 'c1', page: -3 }, 'c1', 27)).toBe(0);
  });
});

describe('URLs de las páginas', () => {
  const md = { baseUrl: 'https://cdn.example', hash: 'abc', data: ['1.png', '2.png'], dataSaver: ['1.jpg', '2.jpg'] };
  it('MangaDex: calidad original o ahorro de datos', () => {
    expect(buildPageUrls(md, false)).toEqual(['https://cdn.example/data/abc/1.png', 'https://cdn.example/data/abc/2.png']);
    expect(buildPageUrls(md, true)).toEqual(['https://cdn.example/data-saver/abc/1.jpg', 'https://cdn.example/data-saver/abc/2.jpg']);
  });
  it('sin versión comprimida usa la original aunque se pida ahorro', () => {
    expect(buildPageUrls({ ...md, dataSaver: [] }, true)[0]).toContain('/data/abc/1.png');
  });
  it('otras fuentes: URLs completas tal cual', () => {
    const other = { baseUrl: '', hash: '', data: ['https://a/1.jpg', 'https://a/2.jpg'], dataSaver: [] };
    expect(buildPageUrls(other, true)).toEqual(other.data);
    expect(buildPageUrls(other, false)).not.toBe(other.data); // copia, no la misma referencia
  });
});

describe('página actual en cascada', () => {
  const tops = [0, 800, 1600, 2400, 3200];
  it('la última página cuyo borde ya pasó por la línea de lectura', () => {
    expect(currentCascadePage(tops, 0, 900)).toBe(0);
    expect(currentCascadePage(tops, 600, 900)).toBe(1);    // línea en 915
    expect(currentCascadePage(tops, 1500, 900)).toBe(2);   // línea en 1815
    expect(currentCascadePage(tops, 99999, 900)).toBe(4);
  });
  it('sin páginas devuelve 0', () => {
    expect(currentCascadePage([], 500, 900)).toBe(0);
  });
});
