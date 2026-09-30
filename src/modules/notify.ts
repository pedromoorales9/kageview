// ═══════════════════════════════════════════════════════════
// notify — avisos desde lógica fuera de React (App los muestra como toast)
// ═══════════════════════════════════════════════════════════

export type NoticeType = 'info' | 'success' | 'error' | 'warning';

export interface Notice {
  type: NoticeType;
  message: string;
  title?: string;
}

export const NOTICE_EVENT = 'kageview:notice';

export function notify(type: NoticeType, message: string, title?: string): void {
  window.dispatchEvent(new CustomEvent<Notice>(NOTICE_EVENT, { detail: { type, message, title } }));
}
