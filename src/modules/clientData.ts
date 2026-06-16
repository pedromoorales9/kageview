// ═══════════════════════════════════════════════════════════
// clientData — Identificación OAuth de la app ante AniList
//
// KageView usa el flujo "Implicit Grant", así que SOLO necesita el
// clientId PÚBLICO de la app (no el client_secret). El clientId no es
// un secreto ni da acceso a ninguna cuenta: es el identificador público
// de la aplicación que permite que CADA usuario inicie sesión con SU
// propia cuenta de AniList. La sesión/token de cada usuario se guarda
// únicamente en su máquina, nunca se incluye en el build.
//
// El valor se inyecta en build desde `.env` (raíz, NO versionado):
//   ANILIST_CLIENT_ID=<id de tu app en https://anilist.co/settings/developer>
// Redirect URL de la app de AniList: kageview://auth
//
// Configúralo una vez en `.env` y persiste para todas las builds futuras.
// (clientSecret se mantiene por compatibilidad de tipos pero ya NO se usa.)
// ═══════════════════════════════════════════════════════════

import { ClientData } from '../types/types';

export const clientData: ClientData = {
  clientId: Number(process.env.ANILIST_CLIENT_ID) || 0,
  clientSecret: process.env.ANILIST_CLIENT_SECRET || '',
  redirectUri: process.env.ANILIST_REDIRECT_URI || 'kageview://auth',
};
