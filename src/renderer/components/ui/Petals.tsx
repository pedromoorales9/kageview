import React, { useEffect, useMemo, useRef, useState } from 'react';

interface PetalsProps {
  /** Nº de pétalos. */
  count?: number;
  className?: string;
  /**
   * 'loop':    lluvia continua (héroe). Avanza a ~30 fps con steps() y se
   *            pausa sola cuando el contenedor sale de pantalla.
   * 'burst':   lluvia finita que va entrando poco a poco.
   * 'prefill': lluvia finita con la pantalla ya llena (intro).
   */
  mode?: 'loop' | 'burst' | 'prefill';
}

/** PRNG determinista: mismos pétalos en cada render (sin parpadeos). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Fotogramas por segundo de la lluvia continua. Los pétalos se mueven muy
 *  despacio, así que 30 fps se ven fluidos. Se mueven con un temporizador JS
 *  (no con animaciones CSS): una animación CSS hace que Chromium tique a
 *  120 Hz y redibuje la página entera en cada tick, mientras que con un
 *  temporizador solo se produce un fotograma por actualización. */
const LOOP_FPS = 30;

/** Sin actividad del usuario (ratón, rueda, teclado) durante este tiempo, la
 *  lluvia se congela: a 30 fps cuesta ~20 % de CPU, y en reposo debe ser ~0 %. */
const IDLE_MS = 8000;

/**
 * Pétalos de sakura cayendo — guiño al logo.
 */
export default function Petals({ count = 12, className = '', mode = 'burst' }: PetalsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  const petals = useMemo(() => {
    const rnd = seeded(20260929);
    return Array.from({ length: count }, (_, i) => {
      const dur = mode === 'loop' ? 14 + rnd() * 10 : 11 + rnd() * 8;
      return {
        id: i,
        left: rnd() * 100,
        size: 11 + rnd() * 15,
        // loop: reparte las fases desde el principio (siempre hay pétalos)
        delay: mode === 'burst' ? rnd() * 7 : -rnd() * (mode === 'loop' ? dur : 6),
        dur,
        drift: (rnd() - 0.3) * 200,
        spin: 360 + rnd() * 540,
        hue: rnd() > 0.5 ? 'from-[#ffc2d1] to-[#ff7a96]' : 'from-[#ff8fa8] to-[#ff3d5a]',
      };
    });
  }, [count, mode]);

  // Pausa la lluvia continua cuando el contenedor no se ve (scroll / otra vista)
  useEffect(() => {
    if (mode !== 'loop') return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [mode]);

  const loop = mode === 'loop';

  // Lluvia continua: posiciona cada pétalo por JS a LOOP_FPS mientras hay
  // actividad del usuario; con la app en reposo se congela (y no consume nada).
  const simTime = useRef(0); // segundos "de lluvia" acumulados (se conserva al pausar)
  useEffect(() => {
    if (!loop || !onScreen) return;
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.children) as HTMLElement[];

    const render = () => {
      const h = root.clientHeight;
      const t = simTime.current;
      for (let i = 0; i < els.length; i++) {
        const p = petals[i];
        // fase 0..1 dentro del ciclo de este pétalo (delay negativo = desfase)
        let ph = ((t - p.delay) / p.dur) % 1;
        if (ph < 0) ph += 1;
        const y = -0.08 * h + ph * 1.16 * h;
        els[i].style.transform = `translate3d(${(ph * p.drift).toFixed(1)}px,${y.toFixed(1)}px,0) rotate(${(ph * p.spin).toFixed(1)}deg)`;
      }
    };

    let interval: number | null = null;
    let idleTimer: number | null = null;
    let last = 0;
    let lastActivity = 0;

    const tick = () => {
      const now = performance.now();
      simTime.current += (now - last) / 1000;
      last = now;
      render();
    };
    const start = () => {
      if (interval !== null || document.hidden) return;
      last = performance.now();
      interval = window.setInterval(tick, 1000 / LOOP_FPS);
    };
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onActivity = () => {
      const now = performance.now();
      if (now - lastActivity < 400 && interval !== null) return; // no rearmar en cada mousemove
      lastActivity = now;
      start();
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = window.setTimeout(stop, IDLE_MS);
    };
    const onVisibility = () => (document.hidden ? stop() : onActivity());

    render(); // pose inicial (también al volver a la vista)
    onActivity();
    const events = ['mousemove', 'wheel', 'keydown', 'pointerdown', 'focus'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      if (idleTimer !== null) clearTimeout(idleTimer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loop, onScreen, petals]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden [contain:strict] ${className}`}
    >
      {petals.map((p) => (
        <span
          key={p.id}
          className={`absolute top-0 block bg-gradient-to-br ${p.hue} ${
            loop ? '' : 'animate-petal-fall'
          }`}
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.8,
              borderRadius: '150% 0 150% 0',
              ...(loop
                ? { willChange: 'transform', transform: 'translate3d(0,-10%,0)' }
                : {
                    animationDelay: `${p.delay}s`,
                    animationIterationCount: 1,
                    animationFillMode: 'both',
                    willChange: 'transform, opacity',
                    '--petal-dur': `${p.dur}s`,
                    '--petal-drift': `${p.drift}px`,
                    '--petal-spin': `${p.spin}deg`,
                  }),
            } as unknown as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
