// Tipos compartidos entre el proceso principal y la interfaz para la cuenta de AniList.

export interface AniListUser {
  id: number;
  name: string;
  avatar: string | null;
}

export interface AniListStatus {
  /** ¿Esta versión trae un client_id de AniList? Si no, no se puede conectar. */
  configured: boolean;
  connected: boolean;
  user: AniListUser | null;
  expiresAt: number | null;
  /** false = el token solo vive en memoria (el sistema no tiene llavero). */
  persistent: boolean;
}

export type BridgeResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string; message?: string };
