import React from 'react';

interface ChipProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function Chip({
  children,
  selected = false,
  onClick,
  className = '',
}: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5
        px-3.5 py-1.5 rounded-full text-xs font-label font-medium
        transition-all duration-200 ease-out-custom
        border border-transparent
        ${
          selected
            ? 'bg-primary/20 text-primary border-primary/30'
            : 'bg-surface-variant/40 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}
