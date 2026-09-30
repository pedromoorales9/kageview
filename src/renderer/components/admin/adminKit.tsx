import React from 'react';

/** Selector segmentado (estilo macOS). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: string }>;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex self-start p-[3px] rounded-full bg-white/[0.06] shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`h-8 px-4 rounded-full text-[13px] font-medium flex items-center gap-1.5 transition-all ${
              active ? 'bg-white/[0.16] text-white shadow-sm' : 'text-on-surface-variant hover:text-white'
            }`}
          >
            {o.icon && <span className="material-symbols-outlined text-[16px]">{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</h3>;
}

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="panel p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-muted">
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        <span className="text-[12.5px] font-medium">{label}</span>
      </div>
      <p className="font-headline text-[32px] leading-none font-bold text-white tracking-[-0.03em] tabular-nums">{value}</p>
      {hint && <p className="text-[12px] text-muted leading-snug">{hint}</p>}
    </div>
  );
}

export const textareaClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-white/[0.06] text-white text-[14.5px] leading-snug resize-none ' +
  'shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.12)] placeholder:text-muted outline-none ' +
  'focus:bg-white/[0.09] focus:shadow-[inset_0_0_0_1.5px_rgba(255,61,90,0.7),0_0_0_4px_rgba(255,61,90,0.14)] ' +
  'transition-all duration-200';

export function SmallButton({
  children,
  onClick,
  tone = 'neutral',
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
  title?: string;
}) {
  const cls =
    tone === 'primary'
      ? 'bg-primary text-white shadow-moon hover:brightness-110'
      : tone === 'danger'
      ? 'bg-error/10 text-error hover:bg-error/20'
      : 'bg-white/[0.08] text-white hover:bg-white/[0.15]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-8 px-3.5 rounded-full text-[12.5px] font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-1.5 ${cls}`}
    >
      {children}
    </button>
  );
}
