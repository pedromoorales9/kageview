// ═══════════════════════════════════════════════════════════
// account — Sesión, perfil y ciclo de vida de la cuenta (Supabase)
//
// Toda la lógica vive aquí (fuera de React) y publica su estado en el store
// global; los componentes solo leen `account`/`myList` y llaman a estas
// funciones. Los errores se lanzan como `BackendError` para que cada
// formulario los muestre donde toca.
// ═══════════════════════════════════════════════════════════

import {
  AuthUser,
  BackendError,
  Profile,
  ProfilePatch,
  getBackend,
} from './backend';
import { useAppStore } from './store';
import { clearMyList, loadMyList } from './library';
import { startSocial, stopSocial } from './social';
import { startChat, stopChat } from './chat';
import { startMangaSync, stopMangaSync } from './manga/mangaSync';
import { stopReading } from './manga/readingPresence';
import { stopWatching } from './presence';
import { notify } from './notify';
import { AuthModalMode } from '../types/types';

const st = () => useAppStore.getState();

function requireBackend() {
  const b = getBackend();
  if (!b) throw new BackendError('not_configured');
  return b;
}

// ─── Textos de error para la UI ────────────────────────────
export function errorMessage(err: unknown): string {
  const code = err instanceof BackendError ? err.code : 'unknown';
  switch (code) {
    case 'not_configured':
      return 'Las cuentas no están configuradas en esta versión de la app.';
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Aún no has confirmado tu correo. Revisa tu bandeja de entrada.';
    case 'email_taken':
      return 'Ya existe una cuenta con ese correo.';
    case 'username_taken':
      return 'Ese nombre de usuario ya está en uso.';
    case 'invalid_username':
      return 'El usuario debe tener de 3 a 20 caracteres: letras minúsculas, números o guion bajo.';
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 8 caracteres.';
    case 'invalid_email':
      return 'Introduce un correo válido.';
    case 'rate_limited':
      return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'not_authenticated':
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    case 'not_found':
      return 'No se encontró ese usuario.';
    case 'already_friends':
      return 'Ya sois amigos.';
    case 'request_exists':
      return 'Ya hay una solicitud pendiente con esa persona.';
    case 'too_many_requests':
      return 'Tienes demasiadas solicitudes pendientes. Espera a que respondan.';
    case 'forbidden':
      return 'No tienes permiso para hacer eso. Si tu cuenta está suspendida, contacta con el equipo de KageView.';
    case 'suspended':
      return 'Tu cuenta está suspendida por el equipo de KageView: no puedes escribir mensajes, enviar solicitudes ni editar tu perfil.';
    case 'file_too_large':
      return 'La imagen es demasiado grande.';
    case 'invalid_file':
      return 'Ese archivo no es una imagen válida (usa JPG, PNG o WebP).';
    case 'network':
      return 'Sin conexión con el servidor. Revisa tu internet.';
    default:
      return 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
  }
}

// ─── Ciclo de vida ─────────────────────────────────────────
async function loadProfile(): Promise<Profile | null> {
  const backend = requireBackend();
  let profile = await backend.getMyProfile();
  if (!profile) {
    // El trigger de alta puede tardar unos ms tras registrarse: un reintento
    await new Promise((r) => setTimeout(r, 800));
    profile = await backend.getMyProfile();
  }
  return profile;
}

async function onSignedIn(user: AuthUser): Promise<void> {
  const cur = st().account;
  // supabase-js re-emite SIGNED_IN al recuperar el foco de la ventana: si ya
  // estaba todo cargado para este usuario, no repetir el trabajo
  if (cur.status === 'signedIn' && cur.user?.id === user.id && cur.profile) return;

  st().setAccount({ status: 'signedIn', user });
  try {
    const profile = await loadProfile();
    st().setAccount({ profile });
  } catch (err) {
    console.warn('[account] No se pudo cargar el perfil:', err);
  }
  await loadMyList();
  startSocial();
  startChat();
  startMangaSync(user.id);
}

function onSignedOut(): void {
  stopWatching();
  stopReading();
  stopMangaSync();
  stopSocial();
  stopChat();
  clearMyList();
  st().setAccount({ status: 'signedOut', user: null, profile: null });
  st().setProfileModalOpen(false);
}

async function handleAuthUrl(url: string): Promise<void> {
  const backend = getBackend();
  if (!backend) return;
  try {
    await backend.handleAuthCallbackUrl(url);
    // PASSWORD_RECOVERY / SIGNED_IN llegan por onAuthChange; si fue una
    // confirmación de correo, avisamos.
    if (!/type=recovery/.test(url)) {
      notify('success', 'Correo confirmado. ¡Bienvenido a KageView!');
    }
  } catch (err) {
    notify('error', errorMessage(err), 'Enlace no válido');
  }
}

let started = false;

/** Arranca la sesión (idempotente). Llamar una vez al montar la app. */
export function initAccount(): void {
  if (started) return;
  started = true;

  const backend = getBackend();
  if (!backend) {
    st().setAccount({ status: 'unavailable', user: null, profile: null });
    return;
  }

  backend.onAuthChange((event, user) => {
    if (event === 'SIGNED_OUT') {
      onSignedOut();
    } else if (event === 'PASSWORD_RECOVERY') {
      st().setAuthModal({ mode: 'recovery' });
      if (user) void onSignedIn(user);
    } else if (user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
      void onSignedIn(user);
    }
  });

  backend
    .getSession()
    .then((user) => (user ? onSignedIn(user) : st().setAccount({ status: 'signedOut' })))
    .catch(() => st().setAccount({ status: 'signedOut' }));

  // Enlaces kageview://auth-callback (confirmación de correo, recuperación)
  window.electron?.onAuthCallback?.((url) => void handleAuthUrl(url));
  window.electron?.consumePendingAuthUrl?.().then((url) => {
    if (url) void handleAuthUrl(url);
  });
}

// ─── Acciones de autenticación ─────────────────────────────
export function signUp(input: { email: string; password: string; username: string }) {
  return requireBackend().signUp(input);
}
export function signIn(email: string, password: string) {
  return requireBackend().signIn(email, password);
}
export async function signOut(): Promise<void> {
  await requireBackend().signOut();
}
export function requestPasswordReset(email: string) {
  return requireBackend().requestPasswordReset(email);
}
export function updatePassword(newPassword: string) {
  return requireBackend().updatePassword(newPassword);
}
export function isUsernameAvailable(username: string) {
  return requireBackend().isUsernameAvailable(username);
}
export async function deleteAccount(): Promise<void> {
  await requireBackend().deleteAccount();
  onSignedOut();
}

// ─── Perfil ────────────────────────────────────────────────
export async function updateProfile(patch: ProfilePatch): Promise<Profile> {
  const profile = await requireBackend().updateMyProfile(patch);
  st().setAccount({ profile });
  return profile;
}
export async function uploadAvatar(image: Blob): Promise<Profile> {
  const profile = await requireBackend().uploadAvatar(image);
  st().setAccount({ profile });
  return profile;
}
export async function removeAvatar(): Promise<Profile> {
  const profile = await requireBackend().removeAvatar();
  st().setAccount({ profile });
  return profile;
}

// ─── Modales ───────────────────────────────────────────────
export function openAuth(mode: AuthModalMode = 'login', reason?: string): void {
  st().setAuthModal({ mode, reason });
}
export function closeAuth(): void {
  st().setAuthModal(null);
}

/**
 * Si hay sesión devuelve true. Si no, abre el formulario de acceso con el
 * motivo indicado y devuelve false (para cortar la acción en curso).
 */
export function requireAccount(reason: string): boolean {
  const { status } = st().account;
  if (status === 'signedIn') return true;
  if (status === 'unavailable') {
    notify('warning', 'Las cuentas no están disponibles en esta versión de la app.');
    return false;
  }
  openAuth('login', reason);
  return false;
}

/** Botón "cuenta": abre el perfil si hay sesión, o el acceso si no. */
export function openAccount(): void {
  const { status } = st().account;
  if (status === 'signedIn') st().setProfileModalOpen(true);
  else if (status === 'unavailable') {
    notify('warning', 'Las cuentas no están disponibles en esta versión de la app.');
  } else if (status === 'signedOut') openAuth('login');
}
