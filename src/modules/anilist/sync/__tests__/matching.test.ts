import { describe, it, expect } from 'vitest';
import { decideLink, normTitle, similarity, rankCandidates, searchTerms } from '../matching';
import type { ALMedia } from '../types';

const m = (id: number, romaji: string, english: string | null = null, extra: Partial<ALMedia> = {}): ALMedia => ({
  id, idMal: null, type: 'MANGA', title: { romaji, english, native: null }, synonyms: [],
  coverImage: { extraLarge: null, large: null, color: null }, bannerImage: null, episodes: null, chapters: null,
  genres: [], averageScore: null, status: null, seasonYear: null, startYear: null, format: 'MANGA', isAdult: false, popularity: 0, ...extra,
});

describe('normTitle', () => {
  it('quita acentos, signos, artículos iniciales y etiquetas', () => {
    expect(normTitle('El Antiguo Soberano de la Eternidad')).toBe('antiguo soberano de la eternidad');
    expect(normTitle('Sōsō no Frieren (Manga)')).toBe('soso no frieren');
    expect(normTitle('  ¡Me   Cansé!!  ')).toBe('me canse');
    expect(normTitle('The Beginning After the End')).toBe('beginning after the end');
  });
  it('conserva escrituras no latinas', () => {
    expect(normTitle('ベルセルク')).toBe('ベルセルク');
    expect(normTitle('나 혼자만 레벨업')).toBe('나 혼자만 레벨업');
  });
});

describe('similarity', () => {
  it('1 si son iguales tras normalizar, 0 si alguno queda vacío', () => {
    expect(similarity('Berserk', 'BERSERK!')).toBe(1);
    expect(similarity('', 'x')).toBe(0);
    expect(similarity('!!!', 'x')).toBe(0);
  });
  it('parecidos puntúan alto y distintos bajo', () => {
    expect(similarity('One Piece', 'One Peace')).toBeGreaterThan(0.7);
    expect(similarity('One Piece', 'One Peace')).toBeLessThan(0.92);   // no basta para vincular solo
    expect(similarity('One Piece', 'Naruto')).toBeLessThan(0.3);
  });
});

describe('decideLink', () => {
  it('coincidencia clara y única → vínculo automático', () => {
    const d = decideLink('Berserk', [m(1, 'Berserk'), m(2, 'Berserk of Gluttony'), m(3, 'Vagabond')]);
    expect(d).toMatchObject({ kind: 'auto', media: { id: 1 } });
  });
  it('usa el título en inglés (principal) para vincular solo', () => {
    expect(decideLink('Solo Leveling', [m(105398, 'Na Honjaman Level Up', 'Solo Leveling')])).toMatchObject({ kind: 'auto', media: { id: 105398 } });
  });
  it('una coincidencia SOLO por sinónimo se sugiere pero nunca se vincula sola', () => {
    const d = decideLink('Matanza de Dragones', [m(5, 'Dragon Slayer', null, { synonyms: ['Matanza de Dragones'] })]);
    expect(d.kind).toBe('ambiguous');
    if (d.kind === 'ambiguous') expect(d.ranked[0]).toMatchObject({ byPrimary: false, score: 0.9 });
  });
  it('el título principal gana a un sinónimo idéntico de otra obra (p. ej. «One Piece» vs un doujin)', () => {
    const d = decideLink('One Piece', [m(1, 'One Piece'), m(2, 'Wan Piece', null, { synonyms: ['One Piece'] })]);
    expect(d).toMatchObject({ kind: 'auto', media: { id: 1 } });
  });
  it('los títulos con paréntesis se buscan por el texto exterior y por el título alternativo', () => {
    expect(decideLink('One Piece (Color)', [m(1, 'One Piece')])).toMatchObject({ kind: 'auto', media: { id: 1 } });
    expect(decideLink('Emperador mágico (Magic Emperor)', [m(7, 'Wu Shen Zhu Zai', 'Magic Emperor')]).kind).toBe('auto');
  });
  it('dos candidatas igual de buenas → hay que preguntar (no se adivina)', () => {
    const d = decideLink('Fruits Basket', [m(1, 'Fruits Basket'), m(2, 'Fruits Basket', null, { format: 'ONE_SHOT' })]);
    expect(d.kind).toBe('ambiguous');
  });
  it('parecido pero no igual → se ofrece, no se vincula solo', () => {
    const d = decideLink('Dragon Ball', [m(1, 'Dragon Ball Super'), m(2, 'Dragon Ball Z')]);
    expect(d.kind).toBe('ambiguous');
    if (d.kind === 'ambiguous') expect(d.ranked.length).toBeGreaterThan(0);
  });
  it('sin parecido → ninguna', () => {
    expect(decideLink('Zzzzzz Qqqqq', [m(1, 'Naruto'), m(2, 'Bleach')])).toEqual({ kind: 'none' });
    expect(decideLink('Algo', [])).toEqual({ kind: 'none' });
  });
  it('las novelas ligeras con el mismo título nunca se eligen', () => {
    const d = decideLink('Overlord', [m(1, 'Overlord', null, { format: 'NOVEL', popularity: 99999 }), m(2, 'Overlord', null, { format: 'MANGA' })]);
    expect(d).toMatchObject({ kind: 'auto', media: { id: 2 } });
  });
  it('rankCandidates desempata por popularidad', () => {
    const r = rankCandidates('X', [m(1, 'X', null, { popularity: 5 }), m(2, 'X', null, { popularity: 50 })]);
    expect(r.map((c) => c.media.id)).toEqual([2, 1]);
  });
});

describe('searchTerms', () => {
  it('texto exterior + título alternativo; descarta etiquetas', () => {
    expect(searchTerms('Emperador magico (magic emperor)')).toEqual(['Emperador magico', 'magic emperor']);
    expect(searchTerms('One Piece (Color)')).toEqual(['One Piece']);
    expect(searchTerms('Bleach (Manga)')).toEqual(['Bleach']);
    expect(searchTerms('Solo Leveling')).toEqual(['Solo Leveling']);
    expect(searchTerms('God-level Assassin, I’m the Shadow (manhua)')).toEqual(['God-level Assassin, I’m the Shadow']);
    expect(searchTerms('(Color)').length).toBeGreaterThan(0);
  });
});
