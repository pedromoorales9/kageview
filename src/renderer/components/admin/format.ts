import type { AnnouncementState } from '../../../modules/announcements';

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
