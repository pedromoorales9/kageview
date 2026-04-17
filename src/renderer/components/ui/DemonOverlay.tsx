import React, { useState, useEffect, useRef } from 'react';

interface DemonOverlayProps {
  visible: boolean;
  onTestNotification?: () => void;
}

export default function DemonOverlay({ visible, onTestNotification }: DemonOverlayProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cerrar el menú al hacer clic fuera del componente
  useEffect(() => {
    if (!menuOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }

    // Pequeño delay para que el clic que abre no lo cierre inmediatamente
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  // Cerrar el menú si el overlay se oculta
  useEffect(() => {
    if (!visible) setMenuOpen(false);
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes demonFloat {
          0%, 100% { transform: translateY(0px) rotate(-3deg); }
          50%       { transform: translateY(-8px) rotate(3deg); }
        }
        @keyframes demonGlow {
          0%, 100% { box-shadow: 0 0 12px 4px rgba(203,151,255,0.35); }
          50%       { box-shadow: 0 0 22px 8px rgba(203,151,255,0.6); }
        }
        .demon-float {
          animation: demonFloat 2.8s ease-in-out infinite, demonGlow 2.8s ease-in-out infinite;
        }
        .demon-float-paused {
          animation: demonFloat 2.8s ease-in-out infinite paused, demonGlow 2.8s ease-in-out infinite paused;
        }
        @keyframes menuIn {
          from { opacity: 0; transform: translateY(6px) translateX(-50%) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)  translateX(-50%) scale(1); }
        }
        .demon-menu {
          animation: menuIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: bottom center;
        }
      `}</style>

      <div
        ref={containerRef}
        className="fixed bottom-6 right-6 z-[200] flex flex-col items-center"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Menú desplegable — se abre/cierra con clic */}
        {menuOpen && (
          <div
            className="
              demon-menu
              absolute bottom-full mb-3 left-1/2
              w-52
              px-3 py-3 rounded-2xl
              bg-surface-container-highest
              border border-primary/25
              text-xs text-on-surface font-medium
              shadow-2xl shadow-black/40
            "
            style={{ transform: 'translateX(-50%)' }}
          >
            {/* Flecha indicadora */}
            <div
              className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-surface-container-highest border-r border-b border-primary/25"
            />

            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base leading-none">👹</span>
              <span className="text-primary font-semibold text-[12px]">Demonio Guardián</span>
            </div>

            <p className="text-on-surface-variant text-[11px] leading-relaxed mb-3">
              Activo — recibirás notificaciones de Windows cuando salgan nuevos episodios.
            </p>

            {onTestNotification && (
              <button
                id="demon-test-notification"
                onClick={() => {
                  onTestNotification();
                  setMenuOpen(false);
                }}
                className="
                  w-full flex items-center justify-center gap-1.5
                  px-3 py-2 rounded-xl
                  bg-primary/15 hover:bg-primary/25
                  text-primary text-[11px] font-semibold
                  transition-colors duration-150
                  border border-primary/20
                "
              >
                <span className="material-symbols-outlined text-sm">notifications</span>
                Probar notificación
              </button>
            )}
          </div>
        )}

        {/* Botón principal del demonio */}
        <button
          id="demon-guardian-toggle"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={`
            w-12 h-12 rounded-2xl
            bg-surface-container-highest
            border border-primary/30
            flex items-center justify-center
            text-2xl select-none cursor-pointer
            transition-all duration-200 active:scale-95
            ${menuOpen ? 'demon-float-paused ring-2 ring-primary/40' : 'demon-float'}
          `}
          title="Demonio Guardián — clic para opciones"
          aria-label="Demonio guardián de notificaciones"
          aria-expanded={menuOpen}
        >
          👹
        </button>

        {/* Indicador ON */}
        <span className="mt-1 text-[9px] text-primary/70 font-semibold tracking-wide uppercase select-none">
          ON
        </span>
      </div>
    </>
  );
}
