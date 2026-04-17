// ═══════════════════════════════════════════════════════════
// Mapeos manuales AniList ID → título del provider
// Para casos donde el title matching automático falla
// ═══════════════════════════════════════════════════════════

/**
 * Mapeo de AniList ID a título exacto que usan los providers.
 * Añadir entradas aquí cuando el matching automático de Levenshtein
 * no funcione para un anime específico.
 *
 * Formato: { [anilistId]: "título exacto en el provider" }
 */
export const CUSTOM_TITLE_MAP: Record<number, string> = {
  // Ejemplos de casos conocidos con títulos difíciles de emparejar:
  // 16498: "Shingeki no Kyojin",          // Attack on Titan
  // 101922: "Kimetsu no Yaiba",           // Demon Slayer
  // 21459: "Boku no Hero Academia",       // My Hero Academia
  // 113415: "Jujutsu Kaisen",
  // 20958: "Shingeki no Kyojin Season 2",
};

/**
 * Obtener el título personalizado para un AniList ID,
 * o null si no hay mapeo manual.
 */
export function getCustomTitle(anilistId: number): string | null {
  return CUSTOM_TITLE_MAP[anilistId] || null;
}
