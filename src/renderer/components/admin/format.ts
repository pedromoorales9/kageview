import type { AuditEntry } from '../../../modules/backend';
import type { AnnouncementState } from '../../../modules/announcements';
import { serviceLabel } from './services';

export const STATE_LABEL: Record<AnnouncementState, string> = {
  live: 'En directo',
  scheduled: 'Programado',
  expired: 'Caducado',
  paused: 'Pausado',
};

export const STATE_STYLE: Record<AnnouncementState, string> = {
  live: 'bg-emerald-400/15 text-emerald-300',
  scheduled: 'bg-sky-400/15 text-sky-300',
  expired: 'bg-white/[0.08] text-muted',
  paused: 'bg-amber-400/15 text-amber-300',
};

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Registro de auditoría ─────────────────────────────────
export type AuditGroup = 'announcement' | 'service' | 'user' | 'team';

export const AUDIT_GROUPS: Array<{ id: AuditGroup | 'all'; label: string }> = [
  { id: 'all', label: 'Todo' },
  { id: 'announcement', label: 'Anuncios' },
  { id: 'service', label: 'Servicios' },
  { id: 'user', label: 'Usuarios' },
  { id: 'team', label: 'Equipo' },
];

export interface AuditView {
  group: AuditGroup;
  icon: string;
  /** Clases de color del icono. */
  tone: string;
  /** Frase tras el nombre de quien lo hizo ("publicó el anuncio «X»"). */
  text: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Convierte una entrada del registro en algo legible. */
export function describeAudit(e: AuditEntry): AuditView {
  const title = str(e.detail.title);
  const quoted = title ? ` «${title}»` : ` #${e.target ?? '?'}`;
  const reason = str(e.detail.reason);
  const why = reason ? ` — «${reason}»` : '';
  const who = e.target ? `@${e.target}` : 'un usuario';

  switch (e.action) {
    case 'announcement.create':
      return { group: 'announcement', icon: 'campaign', tone: 'text-emerald-300', text: `publicó el anuncio${quoted}` };
    case 'announcement.update':
      return { group: 'announcement', icon: 'edit', tone: 'text-sky-300', text: `editó el anuncio${quoted}` };
    case 'announcement.pause':
      return { group: 'announcement', icon: 'pause_circle', tone: 'text-amber-300', text: `pausó el anuncio${quoted}` };
    case 'announcement.resume':
      return { group: 'announcement', icon: 'play_circle', tone: 'text-emerald-300', text: `reactivó el anuncio${quoted}` };
    case 'announcement.delete':
      return { group: 'announcement', icon: 'delete', tone: 'text-error', text: `eliminó el anuncio${quoted}` };
    case 'service.disable':
      return { group: 'service', icon: 'power_off', tone: 'text-error', text: `desactivó ${serviceLabel(e.target ?? '')}${why}` };
    case 'service.enable':
      return { group: 'service', icon: 'power', tone: 'text-emerald-300', text: `reactivó ${serviceLabel(e.target ?? '')}` };
    case 'service.reason':
      return { group: 'service', icon: 'edit_note', tone: 'text-sky-300', text: `cambió el motivo de ${serviceLabel(e.target ?? '')}${why}` };
    case 'user.suspend':
      return { group: 'user', icon: 'block', tone: 'text-error', text: `suspendió a ${who}${why}` };
    case 'user.unsuspend':
      return { group: 'user', icon: 'how_to_reg', tone: 'text-emerald-300', text: `reactivó a ${who}` };
    case 'team.role': {
      const to = str(e.detail.to);
      const text =
        to === 'admin' ? `nombró administrador a ${who}`
        : to === 'user' ? `quitó el rol de administrador a ${who}`
        : `cambió el rol de ${who} a ${to || '?'}`;
      return { group: 'team', icon: 'shield_person', tone: 'text-pink-300', text };
    }
    default:
      return { group: 'announcement', icon: 'history', tone: 'text-muted', text: e.action };
  }
}
