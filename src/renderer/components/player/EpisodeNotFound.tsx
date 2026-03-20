import React from 'react';

interface EpisodeNotFoundProps {
  onBack: () => void;
  episodeNumber?: number;
}

export default function EpisodeNotFound({ onBack, episodeNumber }: EpisodeNotFoundProps) {
  return (
    <main className="fixed inset-0 z-[80] bg-background text-on-background font-body flex items-center justify-center overflow-hidden">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <img
          className="w-full h-full object-cover grayscale opacity-30 blur-sm"
          alt="Cinematic rainy anime city street at night with neon signs"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC9zh5ANIexKEqScC4Io5B7QHJ6mIqbORxqRtPlejNffKxC6tM81iA54Nu6Wl4GhzgrZ2WaXZMxW6K0NmtoGJOhNjSn3DaeN5AJuk2adHKv58bDb0CAH2PB7DJHtn3y4TeiMAoZUhlDkq5T7putwnsNXg8ZVjP5tqz4tTUZ4sDgWTUlPO9BZfFInTHgYPZ8nUTaS6hmru9eElEPafHZ7ou09N5b2g0jaeh443owscCubDRwuT2GElxOG1Oe9rSPPG12ez2bFP33iw2X"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e0e13]/40 to-[#0e0e13]/95" />
      </div>

      {/* Error Content */}
      <div className="relative z-10 w-full max-w-4xl px-8 flex flex-col items-center text-center">
        {/* Asymmetric Element (Character Cutout Silhouette) */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 opacity-10 pointer-events-none">
          <span
            className="material-symbols-outlined text-[24rem]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            person_off
          </span>
        </div>

        {/* Glitchy Error Number */}
        <div className="mb-2 relative">
          <span className="text-[12rem] font-headline font-extrabold tracking-tighter text-surface-container-highest/50 select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-1 h-32 bg-primary/20 blur-xl rotate-45" />
          </div>
        </div>

        {/* Message Block */}
        <div className="space-y-6 max-w-2xl mx-auto -mt-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-error-container/20 border border-error/20 text-error text-[10px] font-headline uppercase tracking-[0.2em] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
            Alerta del Sistema
          </div>

          <h2 className="text-5xl md:text-7xl font-headline font-extrabold tracking-tighter text-on-surface leading-none">
            TRANSMISIÓN <br />
            <span className="text-primary italic">INTERRUMPIDA</span>
          </h2>

          <p className="text-on-surface-variant font-body text-lg leading-relaxed max-w-lg mx-auto">
            Parece que este episodio se ha desvanecido en las sombras.{' '}
            <br className="hidden md:block" />
            Nuestros proveedores no han podido encontrar enlaces.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
            <button
              onClick={onBack}
              className="group relative flex items-center justify-center px-10 py-4 bg-primary rounded-full text-on-primary font-headline font-bold uppercase tracking-widest text-sm transition-all duration-300 hover:scale-105 active:scale-95 shadow-[0_0_40px_0_rgba(203,151,255,0.15)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                Volver
                <span className="material-symbols-outlined text-sm">explore</span>
              </span>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-primary-dim opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              onClick={() => alert("Reporte enviado. Revisaremos el episodio pronto.")}
              className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors font-headline uppercase tracking-widest text-xs font-semibold py-4 px-6 border-b border-transparent hover:border-primary/30"
            >
              <span className="material-symbols-outlined text-sm">flag</span>
              Reportar Enlace Roto
            </button>
          </div>
        </div>
      </div>

      {/* Atmospheric Elements */}
      <div className="absolute bottom-12 right-12 flex-col items-end gap-2 opacity-20 hidden lg:flex">
        <span className="text-[10px] font-headline tracking-[0.4em] uppercase text-on-surface-variant">
          Traza: EP_{episodeNumber ? String(episodeNumber).padStart(3, '0') : 'XXX'}_INVALID_REF
        </span>
        <div className="w-32 h-px bg-on-surface-variant/20" />
      </div>
    </main>
  );
}
