import React from 'react';

interface SkipButtonProps {
  type: 'intro' | 'outro';
  onClick: () => void;
}

export default function SkipButton({ type, onClick }: SkipButtonProps) {
  return (
    <button
      id={`skip-${type}`}
      onClick={onClick}
      className="
        absolute bottom-28 right-8 z-[85]
        flex items-center gap-2.5
        px-5 py-2.5 rounded-full
        bg-surface-variant/60 backdrop-blur-xl
        border border-primary/30
        text-on-surface font-headline font-semibold text-sm
        transition-all duration-200
        hover:bg-primary/20 hover:border-primary/50
        hover:shadow-[0_0_16px_rgba(203,151,255,0.3)]
        animate-fade-in
      "
    >
      <span className="material-symbols-outlined text-primary text-lg">
        skip_next
      </span>
      Skip {type === 'intro' ? 'Intro' : 'Outro'}
    </button>
  );
}
