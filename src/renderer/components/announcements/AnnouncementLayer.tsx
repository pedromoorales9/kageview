import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../modules/store';
import { loadDismissed, pendingAnnouncements, saveDismissed } from '../../../modules/announcements';
import { BannerView, ModalCardView } from './AnnouncementViews';

/**
 * Anuncios del equipo para todos los usuarios.
 *   · banner → franja bajo la barra superior (se descarta con la X)
 *   · modal  → ventana al abrir la app (una vez por anuncio)
 * Lo descartado se recuerda por dispositivo.
 */
function useAnnouncementQueue(display: 'banner' | 'modal') {
  const announcements = useAppStore((s) => s.remoteConfig?.announcements);
  const [dismissed, setDismissed] = useState<Set<number>>(loadDismissed);
  // Reevalúa caducidades/programaciones aunque no llegue config nueva
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const queue = useMemo(
    () => pendingAnnouncements(announcements, dismissed, display),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [announcements, dismissed, display, tick]
  );

  const dismiss = useCallback((id: number) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      saveDismissed(next);
      return next;
    });
  }, []);

  return { queue, dismiss };
}

export function AnnouncementBanner() {
  const { queue, dismiss } = useAnnouncementQueue('banner');
  const first = queue[0];
  if (!first) return null;
  return (
    <div className="flex-none mb-4 animate-fade-in">
      <BannerView a={first} extra={queue.length - 1} onDismiss={() => dismiss(first.id)} />
    </div>
  );
}

export function AnnouncementModal({ enabled }: { enabled: boolean }) {
  const { queue, dismiss } = useAnnouncementQueue('modal');
  const first = enabled ? queue[0] : undefined;

  useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss(first.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [first, dismiss]);

  if (!first) return null;
  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center p-6 bg-[#09050a]/80 animate-fade-in">
      <ModalCardView
        key={first.id}
        a={first}
        onDismiss={() => dismiss(first.id)}
        onLink={(url) => {
          window.electron?.openExternal(url);
          dismiss(first.id);
        }}
      />
    </div>
  );
}
