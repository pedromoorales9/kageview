import React from 'react';
import type { Announcement } from '../../../modules/backend';
import { KIND_META, isSafeLink } from '../../../modules/announcements';

/** Lo mínimo que necesita pintarse (sirve también para la vista previa del panel). */
export type AnnouncementLike = Pick<Announcement, 'kind' | 'title' | 'body' | 'linkUrl' | 'linkLabel'>;

function openLink(url: string) {
  if (isSafeLink(url)) window.electron?.openExternal(url);
}

/** Franja discreta bajo la barra superior. */
export function BannerView({
  a,
  extra,
  onDismiss,
  onLink,
}: {
  a: AnnouncementLike;
  /** Nº de avisos más en cola. */
  extra?: number;
  onDismiss?: () => void;
  onLink?: (url: string) => void;
}) {
  const m = KIND_META[a.kind];
  const link = isSafeLink(a.linkUrl) ? a.linkUrl : null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ${m.tint} ${m.ring} bg-[#130a11]/80`}
    >
      <span className={`material-symbols-outlined text-[21px] mt-[1px] flex-none ${m.text}`} aria-hidden>
        {m.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug text-white">
          {a.title && <strong className={`font-semibold mr-1.5 ${m.text}`}>{a.title}</strong>}
          <span className="text-on-surface-variant whitespace-pre-line break-words">{a.body}</span>
        </p>
      </div>
      {link && (
        <button
          onClick={() => (onLink ?? openLink)(link)}
          className={`flex-none h-7 px-3 rounded-full text-[12px] font-semibold ${m.text} bg-white/[0.08] hover:bg-white/[0.15] transition-colors`}
        >
          {a.linkLabel || 'Saber más'}
        </button>
      )}
      {!!extra && (
        <span className="flex-none h-7 px-2 inline-flex items-center rounded-full text-[11.5px] font-semibold text-muted bg-white/[0.06]">
          +{extra}
        </span>
      )}
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Descartar aviso"
          className="flex-none w-7 h-7 -mr-1 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-white/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}

/** Contenido de la ventana emergente (sin fondo oscuro ni posicionamiento). */
export function ModalCardView({
  a,
  onDismiss,
  onLink,
  dismissLabel = 'Entendido',
}: {
  a: AnnouncementLike;
  onDismiss?: () => void;
  onLink?: (url: string) => void;
  dismissLabel?: string;
}) {
  const m = KIND_META[a.kind];
  const link = isSafeLink(a.linkUrl) ? a.linkUrl : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={a.title || m.label}
      className="relative w-full max-w-[460px] overflow-hidden rounded-[28px] bg-[#130a11] hairline shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] animate-fade-in-scale"
    >
      <div className="pointer-events-none absolute -top-28 left-1/2 -translate-x-1/2 w-[380px] h-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.18),transparent_68%)]" />
      <div className="relative px-8 pt-9 pb-7 flex flex-col items-center text-center gap-4">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ring-1 ${m.tint} ${m.ring}`}>
          <span className={`material-symbols-outlined text-[28px] ${m.text}`} aria-hidden>{m.icon}</span>
        </div>
        <span className={`text-[11px] font-bold uppercase tracking-[0.16em] ${m.text}`}>{m.label}</span>
        <h2 className="font-headline text-[22px] font-bold text-white tracking-[-0.025em] leading-tight break-words max-w-full">
          {a.title || m.label}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-on-surface-variant whitespace-pre-line break-words max-w-full">
          {a.body}
        </p>
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5 w-full mt-2">
          {link && (
            <button
              onClick={() => (onLink ?? openLink)(link)}
              className="btn-moon h-11 px-6 rounded-full font-semibold text-[14.5px] flex-1"
            >
              {a.linkLabel || 'Saber más'}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="h-11 px-6 rounded-full font-medium text-[14px] text-on-surface-variant hover:text-white bg-white/[0.06] hover:bg-white/[0.11] transition-colors flex-1"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
