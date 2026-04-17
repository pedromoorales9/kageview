// ═══════════════════════════════════════════════════════════
// AniList GraphQL Mutations
// ═══════════════════════════════════════════════════════════

/** Actualizar progreso y/o estado de un anime */
export const MUTATION_SAVE_PROGRESS = `
  mutation SaveProgress($mediaId: Int, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
      id
      status
      progress
    }
  }
`;

/** Guardar puntuación de un anime */
export const MUTATION_SAVE_SCORE = `
  mutation SaveScore($mediaId: Int, $score: Float) {
    SaveMediaListEntry(mediaId: $mediaId, score: $score) {
      id
      score
    }
  }
`;
