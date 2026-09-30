import React, { useEffect, useState } from 'react';
import Petals from './Petals';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsFadingOut(true), 2300);
    const unmountTimer = setTimeout(() => onComplete(), 3100);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden
        bg-background select-none
        transition-opacity duration-700 ease-mac
        ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
    >
      <style>{`
        @keyframes splash-moon {
          0%   { opacity: 0; transform: translateY(40px) scale(0.86); filter: blur(18px); }
          45%  { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          100% { opacity: 1; transform: translateY(-6px) scale(1.04); filter: blur(0); }
        }
        @keyframes splash-kanji {
          0%, 25% { opacity: 0; transform: scale(0.92); filter: blur(10px); }
          60%     { opacity: 1; transform: scale(1);    filter: blur(0); }
          100%    { opacity: 1; transform: scale(1.03); filter: blur(0); }
        }
        @keyframes splash-word {
          0%, 35% { opacity: 0; letter-spacing: 0.9em; }
          100%    { opacity: 1; letter-spacing: 0.5em; }
        }
        .splash-moon  { animation: splash-moon 1.9s cubic-bezier(0.32,0.72,0,1) both; }
        .splash-kanji { animation: splash-kanji 2.1s cubic-bezier(0.32,0.72,0,1) both; }
        .splash-word  { animation: splash-word 2s cubic-bezier(0.32,0.72,0,1) both; }
      `}</style>

      {/* Niebla vino + resplandor */}
      <div className="absolute inset-0 app-ambient" />
      <Petals count={16} mode="prefill" />

      <div className="relative flex flex-col items-center">
        {/* Resplandor de la luna */}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[760px] h-[760px] rounded-full bg-[radial-gradient(circle,rgba(255,61,90,0.34),transparent_66%)] animate-moon-breathe" />

        {/* Luna */}
        <div className="splash-moon relative w-[280px] h-[280px]">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 34% 28%, #ff7088 0%, #ff3d5a 38%, #d81e42 72%, #a30f2e 100%)',
              boxShadow:
                '0 0 90px 10px rgba(255,61,90,0.45), inset -18px -22px 60px rgba(90,4,24,0.55)',
            }}
          />
          {/* Textura lunar */}
          <div
            className="absolute inset-0 rounded-full opacity-40 mix-blend-multiply"
            style={{
              background:
                'radial-gradient(circle at 62% 38%, rgba(120,10,40,.55) 0 9%, transparent 10%),' +
                'radial-gradient(circle at 30% 60%, rgba(120,10,40,.45) 0 12%, transparent 13%),' +
                'radial-gradient(circle at 70% 72%, rgba(120,10,40,.4) 0 7%, transparent 8%)',
            }}
          />

          {/* Kanji 影 (sombra) en tinta sobre la luna */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="splash-kanji font-serif leading-none text-[#0a0508]"
              style={{ fontSize: 150, fontWeight: 300, textShadow: '0 0 30px rgba(9,5,10,0.4)' }}
            >
              影
            </span>
          </div>

          {/* Ensō: círculo a pincel */}
          <svg
            viewBox="0 0 300 300"
            className="absolute -inset-[26px] w-[332px] h-[332px] -rotate-[28deg]"
            fill="none"
          >
            <defs>
              <linearGradient id="enso" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffc2d1" stopOpacity="0.95" />
                <stop offset="1" stopColor="#ff3d5a" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <circle
              cx="150"
              cy="150"
              r="140"
              stroke="url(#enso)"
              strokeWidth="5"
              strokeLinecap="round"
              pathLength="1000"
              strokeDasharray="1000"
              strokeDashoffset="1000"
              className="animate-ink-draw"
              style={{ animationDelay: '0.5s' }}
            />
          </svg>
        </div>

        <p className="splash-word mt-14 text-[13px] font-semibold uppercase text-on-surface-variant pl-[0.5em]">
          KageView
        </p>
      </div>
    </div>
  );
}
