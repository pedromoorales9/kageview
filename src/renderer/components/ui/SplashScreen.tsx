import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Empezar a disolver el fondo después de que el kanji brille
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2200);

    // Desmontar completamente el componente
    const unmountTimer = setTimeout(() => {
      onComplete();
    }, 3000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, [onComplete]);

  return (
    <div 
      className={`
        fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center
        transition-opacity duration-700 ease-in-out select-none
        ${isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}
      `}
    >
      <style>{`
        @keyframes splash-kanji {
          0% { opacity: 0; transform: scale(0.85); filter: blur(15px); }
          25% { opacity: 1; transform: scale(1); filter: blur(0px); text-shadow: 0 0 20px rgba(203, 151, 255, 0.4); }
          75% { opacity: 1; transform: scale(1.05); filter: blur(0px); text-shadow: 0 0 50px rgba(203, 151, 255, 1); }
          100% { opacity: 0; transform: scale(1.2); filter: blur(25px); text-shadow: 0 0 80px rgba(203, 151, 255, 0); }
        }
        .animate-splash-kanji {
          animation: splash-kanji 2.6s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>
      
      <div className="relative flex flex-col items-center justify-center">
        {/* Glow dinámico de fondo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-primary/20 blur-[80px] rounded-full pointer-events-none mix-blend-screen" />
        
        {/* EL KANJI: 影 (Sombra) */}
        <h1 className="text-[140px] md:text-[180px] font-serif font-extralight text-on-surface tracking-widest animate-splash-kanji relative z-10 leading-none">
          影
        </h1>
        <p className="text-secondary font-label uppercase tracking-[0.5em] text-xs absolute -bottom-12 opacity-0 animate-[fade-in_2s_ease-out_0.5s_forwards] font-bold">
          KageView
        </p>
      </div>
    </div>
  );
}
