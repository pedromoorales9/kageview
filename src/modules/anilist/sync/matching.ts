// ═══════════════════════════════════════════════════════════
// Emparejar un manga de una fuente con su ficha de AniList por el título
//
// Los títulos de las fuentes son de todo tipo (español, inglés, romaji, con o sin
// acentos, con «(Manga)», «(Color)» o un título alternativo entre paréntesis…).
// Un vínculo equivocado ensuciaría la lista de AniList del usuario, así que SOLO se
// vincula solo cuando hay una coincidencia clara con el título PRINCIPAL de la ficha
// y sin rival cercano; en cualquier otro caso se ofrecen sugerencias para confirmar.
// ═══════════════════════════════════════════════════════════

import { distance } from 'fastest-levenshtein';
import type { ALMedia } from './types';

const NOISE = '(?:manga|manhwa|manhua|webtoon|novel|oneshot|one shot|official|color|colour|colored|full color|digital|sin censura|uncensored|oficial|completo|español|spanish|raw)';

/** Sin acentos ni signos, minúsculas, sin artículos iniciales ni etiquetas como «(manga)». */
export function normTitle(s: string): string {
  return s
    // Quita los acentos latinos (NFD) y recompone (NFC): así «ベ», «한» o «ñ» no se parten en trozos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(new RegExp(`\\(\\s*${NOISE}\\s*\\)`, 'g'), ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(el|la|los|las|un|una|the|a|an) /, '');
}

/** 0–1: 1 = igual tras normalizar. */
export function similarity(a: string, b: string): number {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const max = Math.max(na.length, nb.length);
  return 1 - distance(na, nb) / max;
}

/**
 * Variantes del título para buscar: el texto fuera de los paréntesis y, si hay un
 * título alternativo dentro («Emperador mágico (Magic Emperor)»), ese también.
 * Se descartan las etiquetas que no son títulos («(Color)», «(Manga)»…).
 */
export function searchTerms(title: string): string[] {
  const out: string[] = [];
  const outer = title.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (outer.length >= 2) out.push(outer);
  const noise = new RegExp(`^${NOISE}$`, 'i');
  for (const m of title.matchAll(/\(([^)]{3,80})\)/g)) {
    const inner = m[1].trim();
    if (inner && !noise.test(inner) && !out.includes(inner)) out.push(inner);
  }
  return out.length > 0 ? out : [title.trim()].filter((t) => t.length > 0);
}

interface TitleRef {
  text: string;
  /** Título principal de la ficha (inglés, romaji, nativo) frente a un sinónimo. */
  primary: boolean;
}

export function mediaTitleRefs(m: ALMedia): TitleRef[] {
  const primary = [m.title.english, m.title.romaji, m.title.native]
    .filter((t): t is string => !!t && t.trim().length > 0)
    .map((text) => ({ text, primary: true }));
  const synonyms = m.synonyms.filter((t) => t && t.trim().length > 0).map((text) => ({ text, primary: false }));
  return [...primary, ...synonyms];
}

export const mediaTitles = (m: ALMedia): string[] => mediaTitleRefs(m).map((t) => t.text);

/** Una coincidencia por sinónimo no pasa de aquí: se sugiere, pero no se vincula sola. */
export const SYNONYM_CAP = 0.9;

export interface RankedMedia {
  media: ALMedia;
  score: number;
  /** La mejor coincidencia fue con el título principal (no con un sinónimo). */
  byPrimary: boolean;
}

/** Candidatas ordenadas de mejor a peor por parecido de título (sin novelas ligeras). */
export function rankCandidates(title: string | readonly string[], candidates: readonly ALMedia[]): RankedMedia[] {
  const variants = typeof title === 'string' ? searchTerms(title) : title;
  return candidates
    .filter((m) => m.format !== 'NOVEL')
    .map((media) => {
      let score = 0;
      let byPrimary = false;
      for (const ref of mediaTitleRefs(media)) {
        for (const v of variants) {
          const s = ref.primary ? similarity(v, ref.text) : Math.min(similarity(v, ref.text), SYNONYM_CAP);
          if (s > score) {
            score = s;
            byPrimary = ref.primary;
          }
        }
      }
      return { media, score, byPrimary };
    })
    .sort((a, b) => b.score - a.score || (b.media.popularity ?? 0) - (a.media.popularity ?? 0));
}

export type LinkDecision =
  | { kind: 'auto'; media: ALMedia; score: number }
  | { kind: 'ambiguous'; ranked: RankedMedia[] }
  | { kind: 'none' };

/** Mínimo para ofrecer una candidata al usuario. */
export const SUGGEST_MIN = 0.55;
/** Mínimo para vincular sin preguntar. */
export const AUTO_MIN = 0.92;
/** Ventaja mínima sobre la segunda candidata para vincular sin preguntar. */
export const AUTO_MARGIN = 0.06;

export function decideLink(title: string | readonly string[], candidates: readonly ALMedia[]): LinkDecision {
  const ranked = rankCandidates(title, candidates).filter((r) => r.score >= SUGGEST_MIN);
  if (ranked.length === 0) return { kind: 'none' };
  const [best, second] = ranked;
  const clear = best.byPrimary && best.score >= AUTO_MIN && (!second || best.score - second.score >= AUTO_MARGIN);
  return clear ? { kind: 'auto', media: best.media, score: best.score } : { kind: 'ambiguous', ranked: ranked.slice(0, 6) };
}
