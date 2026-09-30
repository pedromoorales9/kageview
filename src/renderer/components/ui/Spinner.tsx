import React from 'react';

interface SpinnerProps {
  size?: number;
  className?: string;
}

export default function Spinner({ size = 32, className = '' }: SpinnerProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className="animate-spin drop-shadow-[0_0_8px_rgba(255,61,90,0.55)]"
        style={{ animationDuration: '0.9s' }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="opacity-20"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="url(#spinner-gradient)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffc2d1" />
            <stop offset="100%" stopColor="#ff3d5a" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
