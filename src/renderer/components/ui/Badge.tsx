import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
}

// Nota: se evita `backdrop-blur` aquí a propósito. Los Badge aparecen en cada
// tarjeta (varios por tarjeta), y un backdrop-filter por badge multiplica el
// coste de compositing al hacer scroll. Se compensa con fondos algo más opacos.
const variantClasses: Record<string, string> = {
  primary: 'bg-primary/25 text-primary',
  secondary: 'bg-secondary/25 text-secondary',
  success: 'bg-green-500/25 text-green-400',
  warning: 'bg-yellow-500/25 text-yellow-400',
  error: 'bg-error/25 text-error',
  neutral: 'bg-surface-container-high/80 text-on-surface-variant',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({
  children,
  variant = 'primary',
  size = 'sm',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-label font-medium
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}
