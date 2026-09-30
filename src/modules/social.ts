// ═══════════════════════════════════════════════════════════
// social — Amigos, solicitudes y "viendo ahora"
//
// Estado en un store propio. Se mantiene al día con Realtime (cambios en
// `activity` y `friendships`) y, como red de seguridad, un refresco cada 2
// minutos (también renueva los "hace X min").
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { Activity, Friend, FriendActivity, FriendRequest, getBackend } from './backend';

interface SocialState {
  friends: Friend[];
  requests: FriendRequest[];
  activity: FriendActivity[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const EMPTY: SocialState = {
  friends: [],
  requests: [],
  activity: [],
  loaded: false,
  loading: false,
  error: null,
};

export const useSocialStore = create<SocialState>(() => ({ ...EMPTY }));

/** Si dejó de enviar latidos hace más de esto, ya no cuenta como "viendo ahora". */
export const WATCHING_FRESH_MS = 3.5 * 60 * 1000;

export function isWatchingNow(a: Pick<Activity, 'active' | 'updatedAt'>): boolean {
  return a.active && Date.now() - new Date(a.updatedAt).getTime() < WATCHING_FRESH_MS;
}

/** "ahora", "hace 5 min", "hace 3 h", "hace 2 días" */
export function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

export async function refreshSocial(): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  useSocialStore.setState({ loading: true });
  try {
    const [friends, requests, activity] = await Promise.all([
      backend.listFriends(),
      backend.listFriendRequests(),
      backend.listFriendsActivity(),
    ]);
    useSocialStore.setState({ friends, requests, activity, loaded: true, loading: false, error: null });
  } catch (err) {
    console.warn('[social] Error al refrescar:', err);
    useSocialStore.setState({
      loading: false,
      error: 'No se pudo cargar la información de tus amigos.',
    });
  }
}

let unsubscribe: (() => void) | null = null;
let pollTimer: number | null = null;

export function startSocial(): void {
  const backend = getBackend();
  if (!backend || unsubscribe) return;
  void refreshSocial();
  unsubscribe = backend.subscribeSocial(() => void refreshSocial());
  pollTimer = window.setInterval(() => void refreshSocial(), 2 * 60 * 1000);
}

export function stopSocial(): void {
  unsubscribe?.();
  unsubscribe = null;
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  useSocialStore.setState({ ...EMPTY });
}
