import React, { forwardRef, useId } from 'react';

/** Estilos compartidos de los formularios de cuenta. */
export const inputClass =
  'w-full h-11 px-3.5 rounded-xl bg-white/[0.06] text-white text-[14.5px] tracking-[-0.01em] ' +
  'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] placeholder:text-muted outline-none ' +
  'focus:bg-white/[0.09] focus:shadow-[inset_0_0_0_1.5px_rgba(255,61,90,0.7),0_0_0_4px_rgba(255,61,90,0.14)] ' +
  'transition-all duration-200 disabled:opacity-50';

export const primaryButtonClass =
  'btn-moon h-11 px-6 rounded-full font-semibold text-[14.5px] flex items-center justify-center gap-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

export const ghostButtonClass =
  'h-11 px-5 rounded-full font-medium text-[14px] text-on-surface-variant hover:text-white ' +
  'bg-white/[0.06] hover:bg-white/[0.11] transition-colors flex items-center justify-center gap-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  right?: React.ReactNode;
}

/** Campo de texto con etiqueta, ayuda y error accesibles. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, right, className = '', ...props },
  ref
) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12.5px] font-medium text-on-surface-variant">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`${inputClass} ${right ? 'pr-11' : ''} ${
            error ? '!shadow-[inset_0_0_0_1.5px_rgba(255,92,120,0.8)]' : ''
          } ${className}`}
          {...props}
        />
        {right && <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">{right}</div>}
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-[12px] text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Interruptor estilo macOS. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-[42px] h-[25px] rounded-full flex-none transition-colors duration-200 disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-white/[0.16]'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-[21px] h-[21px] rounded-full bg-white shadow-md transition-transform duration-200 ease-mac ${
          checked ? 'translate-x-[17px]' : ''
        }`}
      />
    </button>
  );
}

/** Aviso en línea (éxito/error/info) dentro de un formulario. */
export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: React.ReactNode }) {
  const cls =
    kind === 'error'
      ? 'bg-error/10 text-error ring-error/30'
      : kind === 'success'
      ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/30'
      : 'bg-white/[0.06] text-on-surface-variant ring-white/10';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-snug ring-1 ${cls}`}>
      {children}
    </div>
  );
}
