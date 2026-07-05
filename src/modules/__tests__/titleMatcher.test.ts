// ═══════════════════════════════════════════════════════════
// Tests de titleMatcher — port de TitleMatcherTests.swift
// (versión nativa de macOS, KageViewCore)
// ═══════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  normalizeTitle,
  titleSimilarity,
  findBestMatch,
} from '../titleMatcher';
import { AniListAnime, ProviderAnime } from '../../types/types';

/** Anime de AniList mínimo para los tests (solo importan id + title). */
function makeAnime(
  title: { romaji: string; english: string | null; native?: string }
): AniListAnime {
  return {
    id: 1,
    title: { native: '', ...title },
  } as AniListAnime;
}

describe('normalizeTitle', () => {
  it('minúsculas, sin caracteres especiales, espacios colapsados', () => {
    expect(normalizeTitle('  Attack on Titan!! ')).toBe('attack on titan');
    expect(normalizeTitle('Shingeki no Kyojin: Season 2')).toBe(
      'shingeki no kyojin season 2'
    );
  });

  it('elimina caracteres no latinos', () => {
    expect(normalizeTitle('進撃の巨人')).toBe('');
  });
});

describe('titleSimilarity', () => {
  it('títulos idénticos → 1', () => {
    expect(titleSimilarity('Naruto', 'Naruto')).toBe(1);
  });

  it('títulos casi idénticos → alto', () => {
    expect(titleSimilarity('Attack on Titan', 'Attack on Titan!')).toBeGreaterThan(0.9);
  });

  it('títulos distintos → bajo', () => {
    expect(titleSimilarity('Naruto', 'Bleach')).toBeLessThan(0.5);
  });
});

describe('findBestMatch', () => {
  it('el match exacto gana por el bonus de +0.5', () => {
    const anime = makeAnime({
      romaji: 'Shingeki no Kyojin',
      english: 'Attack on Titan',
      native: '進撃の巨人',
    });
    const results: ProviderAnime[] = [
      { id: 'a', title: 'Some Other Show', url: '' },
      { id: 'b', title: 'Attack on Titan', url: '' },
      { id: 'c', title: 'Attack on Titan Season 2', url: '' },
    ];
    expect(findBestMatch(anime, results)?.id).toBe('b');
  });

  it('devuelve null por debajo del umbral (0.7)', () => {
    const anime = makeAnime({ romaji: 'One Piece', english: null });
    const results: ProviderAnime[] = [
      { id: 'x', title: 'Completely Different Title', url: '' },
    ];
    expect(findBestMatch(anime, results)).toBeNull();
  });
});
