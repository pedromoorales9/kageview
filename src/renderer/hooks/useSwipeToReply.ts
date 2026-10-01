import React, { useCallback, useEffect, useRef } from 'react';

/** Píxeles que hay que arrastrar para que se active «responder». */
export const SWIPE_TRIGGER = 56;
const SWIPE_MAX = 72;
/** Desplazamiento horizontal acumulado del trackpad (dos dedos) para activarlo. */
const WHEEL_TRIGGER = 90;
const WHEEL_IDLE_MS = 220;

/** Con resistencia: sigue al dedo hasta el umbral y a partir de ahí cuesta cada vez más. */
const ease = (raw: number) => {
  if (raw <= 0) return 0;
  if (raw <= SWIPE_TRIGGER) return raw;
  return Math.min(SWIPE_MAX, SWIPE_TRIGGER + (raw - SWIPE_TRIGGER) * 0.25);
};

/**
 * Arrastrar un mensaje hacia la derecha para responderle (estilo WhatsApp).
 *
 *  · Ratón / táctil / lápiz: arrastre horizontal sobre el mensaje.
 *    Con ratón, si la pulsación empezó sobre el texto (se está seleccionando), no
 *    se interpreta como gesto: así copiar texto sigue funcionando.
 *  · Trackpad: deslizar con dos dedos en horizontal sobre el mensaje.
 *
 * El movimiento se pinta directamente en el DOM (sin re-renderizar en cada píxel).
 * `moveRef` = elemento que se desplaza · `hintRef` = icono que aparece detrás.
 */
export function useSwipeToReply(onReply: () => void, enabled: boolean) {
  const moveRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;

  const s = useRef({
    tracking: false,
    dragging: false,
    x: 0,
    y: 0,
    id: -1,
    armed: false,
    wheelAcc: 0,
    wheelFired: false,
    wheelTimer: 0 as ReturnType<typeof setTimeout> | 0,
  });

  const paint = useCallback((dx: number, animate: boolean) => {
    const el = moveRef.current;
    if (el) {
      el.style.transition = animate ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
      el.style.transform = dx > 0 ? `translateX(${dx}px)` : '';
    }
    const h = hintRef.current;
    if (h) {
      const p = Math.min(1, dx / SWIPE_TRIGGER);
      h.style.transition = animate ? 'opacity 200ms, transform 200ms' : 'none';
      h.style.opacity = String(p);
      h.style.transform = `scale(${0.6 + 0.4 * p})`;
      h.dataset.armed = dx >= SWIPE_TRIGGER ? '1' : '0';
    }
  }, []);

  useEffect(
    () => () => {
      document.body.style.userSelect = '';
      if (s.current.wheelTimer) clearTimeout(s.current.wheelTimer);
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('textarea,input,a')) return;
    Object.assign(s.current, { tracking: true, dragging: false, x: e.clientX, y: e.clientY, id: e.pointerId, armed: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const t = s.current;
    if (!t.tracking || e.pointerId !== t.id) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.dragging) {
      // Scroll vertical, o gesto hacia la izquierda: no es para nosotros
      if ((Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) || dx < -14) {
        t.tracking = false;
        return;
      }
      if (dx < 14 || dx < 2 * Math.abs(dy)) return;
      // Con ratón, si ya hay texto seleccionado el usuario está copiando, no respondiendo
      if (e.pointerType === 'mouse' && (window.getSelection()?.toString().length ?? 0) > 0) {
        t.tracking = false;
        return;
      }
      t.dragging = true;
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = 'none';
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* sin captura el gesto funciona igual mientras el puntero siga encima */
      }
    }
    t.armed = dx >= SWIPE_TRIGGER;
    paint(ease(dx), false);
  };

  const finish = (e: React.PointerEvent, cancelled: boolean) => {
    const t = s.current;
    if (!t.tracking || e.pointerId !== t.id) return;
    t.tracking = false;
    if (!t.dragging) return;
    t.dragging = false;
    document.body.style.userSelect = '';
    const fire = !cancelled && e.clientX - t.x >= SWIPE_TRIGGER;
    paint(0, true);
    // El clic que sigue a un arrastre no debe abrir tarjetas ni pulsar botones
    const swallow = (ev: Event) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 60);
    if (fire) onReplyRef.current();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!enabled) return;
    const ax = Math.abs(e.deltaX);
    // Solo gestos claramente horizontales; el scroll vertical normal pasa de largo
    if (ax < 1 || ax < Math.abs(e.deltaY) * 2) return;
    const t = s.current;
    if (!t.wheelFired) {
      t.wheelAcc += ax;
      paint(ease(t.wheelAcc * 0.6), false);
      if (t.wheelAcc >= WHEEL_TRIGGER) {
        t.wheelFired = true; // una sola vez por gesto, aunque siga la inercia
        onReplyRef.current();
      }
    }
    if (t.wheelTimer) clearTimeout(t.wheelTimer);
    t.wheelTimer = setTimeout(() => {
      t.wheelTimer = 0;
      t.wheelAcc = 0;
      t.wheelFired = false;
      paint(0, true);
    }, WHEEL_IDLE_MS);
  };

  return {
    moveRef,
    hintRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent) => finish(e, false),
      onPointerCancel: (e: React.PointerEvent) => finish(e, true),
      onWheel,
    },
  };
}
