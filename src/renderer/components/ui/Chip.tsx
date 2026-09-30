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
      aria-pressed={selected}
      className={`
        inline-flex items-center gap-1.5
        h-[30px] px-3.5 rounded-full text-[12.5px] font-medium tracking-[-0.005em]
        transition-all duration-200 ease-mac active:scale-95
        ${
          selected
            ? 'bg-primary text-white shadow-moon'
            : 'bg-white/[0.06] text-on-surface-variant hover:bg-white/[0.11] hover:text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.1)]'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}
