import React, { createContext, useCallback, useContext, useState } from 'react';
import ReactDOM from 'react-dom';

// ═══════════════════════════════════════════════════════════
// Toast — Notificaciones in-app (reemplaza los alert() nativos)
// ═══════════════════════════════════════════════════════════

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface ToastOptions {
  type?: ToastType;
  title?: string;
  message: string;
  /** Duración en ms antes de auto-cerrarse. 0 = no auto-cerrar. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'title'>> {
  id: number;
  title?: string;
}

interface ToastContextValue {
  toast: (opts: ToastOptions) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TYPE_META: Record<ToastType, { icon: string; accent: string; ring: string }> = {
  info:    { icon: 'info',          accent: 'text-primary',   ring: 'border-primary/30' },
  success: { icon: 'check_circle',  accent: 'text-emerald-400', ring: 'border-emerald-500/30' },
  error:   { icon: 'error',         accent: 'text-error',     ring: 'border-error/40' },
  warning: { icon: 'warning',       accent: 'text-amber-400', ring: 'border-amber-500/30' },
};

let idCounter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = ++idCounter;
    const item: ToastItem = {
      id,
      type: opts.type ?? 'info',
      message: opts.message,
      title: opts.title,
      duration: opts.duration ?? 4500,
    };
    setToasts((prev) => [...prev, item]);
    if (item.duration > 0) {
      window.setTimeout(() => dismiss(id), item.duration);
    }
  }, [dismiss]);

  const helpers: ToastContextValue = {
    toast,
    success: (message, title) => toast({ type: 'success', message, title }),
    error:   (message, title) => toast({ type: 'error', message, title }),
    info:    (message, title) => toast({ type: 'info', message, title }),
    warning: (message, title) => toast({ type: 'warning', message, title }),
  };

  return (
    <ToastContext.Provider value={helpers}>
      {children}
      {ReactDOM.createPortal(
        <div className="fixed top-20 right-4 z-[300] flex flex-col gap-2.5 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none">
          {toasts.map((t) => {
            const meta = TYPE_META[t.type];
            return (
              <div
                key={t.id}
                className={`
                  pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl
                  bg-surface-container-high/95 backdrop-blur-xl
                  border ${meta.ring}
                  shadow-[0_10px_30px_-8px_rgba(0,0,0,0.6)]
                  animate-fade-in-scale
                `}
              >
                <span className={`material-symbols-outlined filled text-[20px] flex-none mt-0.5 ${meta.accent}`}>
                  {meta.icon}
                </span>
                <div className="flex-1 min-w-0">
                  {t.title && (
                    <p className="font-headline font-bold text-sm text-on-surface leading-tight mb-0.5">
                      {t.title}
                    </p>
                  )}
                  <p className="text-[13px] text-on-surface-variant leading-snug whitespace-pre-line">
                    {t.message}
                  </p>
                </div>
                <button
                  onClick={() => dismiss(t.id)}
                  className="flex-none w-6 h-6 rounded-md flex items-center justify-center text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-variant/30 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/** Hook para lanzar toasts desde cualquier componente bajo <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback defensivo: si no hay provider, no rompemos la app.
    const noop = () => { /* sin provider */ };
    return { toast: noop, success: noop, error: noop, info: noop, warning: noop };
  }
  return ctx;
}
