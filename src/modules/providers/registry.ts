// ═══════════════════════════════════════════════════════════
// Registry — Registro de providers + lógica de fallback
// ═══════════════════════════════════════════════════════════

import { IProvider } from './IProvider';
import { AnimeFlvProvider } from './animeflv';
import { JKAnimeProvider } from './jkanime';
import { AnimeAV1Provider } from './animeav1';
import { findBestMatch } from '../titleMatcher';
import { remoteDisableReason } from '../remoteConfig';
import {
  ProviderId,
  PlayMode,
  StreamingSource,
  UserPreferences,
  AniListAnime,
  CustomProviderDef,
} from '../../types/types';

export const PROVIDERS: Record<ProviderId, IProvider> = {
  animeflv: new AnimeFlvProvider(),
  jkanime: new JKAnimeProvider(),
  animeav1: new AnimeAV1Provider(),
};

/** Clase de provider por plantilla, para mirrors y sitios personalizados. */
const TEMPLATE_CLASSES: Record<
  ProviderId,
  new (opts?: { id?: string; name?: string; baseUrl?: string }) => IProvider
> = {
  animeflv: AnimeFlvProvider,
  jkanime: JKAnimeProvider,
  animeav1: AnimeAV1Provider,
};

/** Instancia un provider integrado respetando la URL alternativa (mirror). */
export function buildBuiltinProvider(pid: ProviderId, prefs: UserPreferences): IProvider {
  const Cls = TEMPLATE_CLASSES[pid];
  return new Cls({ baseUrl: prefs.providerBaseUrls?.[pid] });
}

/** Instancia un provider personalizado a partir de su definición. */
export function buildCustomProvider(def: CustomProviderDef): IProvider | null {
  const Cls = TEMPLATE_CLASSES[def.template];
  if (!Cls) return null;
  return new Cls({ id: def.id, name: def.name, baseUrl: def.baseUrl });
}

/**
 * Lista efectiva de providers según las preferencias, en orden de intento:
 * favorito → resto de integrados habilitados → sitios personalizados.
 * Se instancian en cada llamada para reflejar mirrors recién cambiados
 * (las instancias no tienen estado, crearlas es gratis).
 */
export function buildProviders(prefs: UserPreferences): IProvider[] {
  const baseOrder: ProviderId[] = ['animeflv', 'animeav1', 'jkanime'];
  const list: IProvider[] = [];

  if (prefs.providersEnabled[prefs.preferredProvider]) {
    list.push(buildBuiltinProvider(prefs.preferredProvider, prefs));
  }
  for (const pid of baseOrder) {
    if (pid !== prefs.preferredProvider && prefs.providersEnabled[pid]) {
      list.push(buildBuiltinProvider(pid, prefs));
    }
  }
  for (const custom of prefs.customProviders ?? []) {
    const provider = buildCustomProvider(custom);
    if (provider) list.push(provider);
  }

  // Kill-switch remoto: el dev puede desactivar un provider para todos
  // los usuarios sin publicar versión (remote-config.json en gh-pages).
  return list.filter((p) => {
    const reason = remoteDisableReason(p.id);
    if (reason) console.warn(`[Registry] ${p.id} desactivado remotamente: ${reason}`);
    return !reason;
  });
}

/**
 * Busca un anime en un provider específico usando title matching
 * con los títulos de AniList (romaji, english, native)
 */
async function findAnimeInProvider(
  anime: AniListAnime,
  provider: IProvider,
  dubbed = false
): Promise<{ id: string; title: string; url: string } | null> {
  // Intentar con cada variante de título
  const titles = [
    anime.title.romaji,
    anime.title.english,
  ].filter(Boolean) as string[];

  for (const title of titles) {
    try {
      const results = await provider.search(title, dubbed);
      if (results.length === 0) continue;

      const best = findBestMatch(anime, results);
      if (best) return best;
    } catch (err) {
      console.warn(`[Registry] Error buscando "${title}" en ${provider.id}:`, err);
    }
  }
  return null;
}

/**
 * Obtener source de streaming con fallback automático entre providers.
 * Intenta el provider preferido primero, luego los demás en orden.
 */
export async function getSourceWithFallback(
  anime: AniListAnime,
  episodeNumber: number,
  mode: PlayMode,
  prefs: UserPreferences
): Promise<{ sources: StreamingSource[]; providerId: string } | null> {
  // Favorito → integrados habilitados → sitios personalizados del usuario,
  // todos con sus URLs alternativas (mirrors) aplicadas.
  const providers = buildProviders(prefs);

  for (const provider of providers) {
    const pid = provider.id;

    try {
      // Verificar que el provider está operativo
      const healthy = await provider.healthCheck();
      if (!healthy) {
        console.warn(`[Registry] Provider ${pid} no está operativo`);
        continue;
      }

      // Buscar el anime en el provider
      const match = await findAnimeInProvider(anime, provider, mode === 'dub');
      if (!match) {
        console.warn(`[Registry] No se encontró match en ${pid}`);
        continue;
      }
      console.log(`[Registry] Match en ${pid}: ${match.title} (ID: ${match.id})`);

      // Obtener episodios
      const episodes = await provider.getEpisodes(match.id, mode === 'dub');
      console.log(`[Registry] Episodios en ${pid}:`, episodes.map(e => e.number).join(', '));
      
      const ep = episodes.find((e) => e.number === episodeNumber);
      if (!ep) {
        console.warn(
          `[Registry] Episodio ${episodeNumber} no encontrado en ${pid}. Solo existen: ${episodes.map(e => e.number).join(', ')}`
        );
        continue;
      }

      // Obtener sources de streaming — se devuelven TODOS los servidores
      // para poder saltar al siguiente si el primero está caído
      // (p. ej. embeds que muestran "Content not found").
      const sources = await provider.getStreamingSource(ep.id, mode);
      if (sources.length > 0) {
        console.log(`[Registry] ${sources.length} source(s) obtenidos de ${pid}`);
        return { sources, providerId: pid };
      }
    } catch (err) {
      console.warn(`[Registry] Provider ${pid} falló:`, err);
      if (!prefs.fallbackEnabled) return null;
      continue;
    }
  }

  return null;
}
