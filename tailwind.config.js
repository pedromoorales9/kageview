/** @type {import('tailwindcss').Config} */
// ═══════════════════════════════════════════════════════════
// KageView — "Luna de sangre" design tokens
// Paleta extraída del logo: negro tinta con matiz vino, luna
// carmesí, pétalos de sakura y blanco cálido.
// ═══════════════════════════════════════════════════════════
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // Acento: la luna
        'primary': '#ff3d5a',
        'primary-container': '#e3234a',
        'primary-dim': '#c81a3f',
        // Acento secundario: el sakura
        'secondary': '#ff8fa8',
        'tertiary': '#ffc2d1',
        // Tinta (fondos) — de más profundo a más elevado
        'background': '#09050a',
        'surface': '#0f070c',
        'surface-dim': '#09050a',
        'surface-container-lowest': '#09050a',
        'surface-container-low': '#150a10',
        'surface-container': '#1a0d14',
        'surface-container-high': '#22121b',
        'surface-container-highest': '#2c1823',
        'surface-bright': '#38202d',
        'surface-variant': '#150a10',
        // Texto
        'on-background': '#f8f1f3',
        'on-surface': '#f8f1f3',
        'on-surface-variant': '#bcaab2',
        'muted': '#86747c',
        'on-primary': '#ffffff',
        'on-primary-fixed': '#ffffff',
        'on-secondary': '#ffffff',
        'on-tertiary': '#ffffff',
        'outline': 'rgba(255, 255, 255, 0.10)',
        'outline-variant': 'rgba(255, 255, 255, 0.05)',
        'error': '#ff5c78',
      },
      fontFamily: {
        // Tipografía nativa de macOS (SF Pro); Inter/Segoe como respaldo en otros SO
        headline: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"Helvetica Neue"',
          'Inter', '"Segoe UI"', 'system-ui', 'sans-serif',
        ],
        body: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"',
          'Inter', '"Segoe UI"', 'system-ui', 'sans-serif',
        ],
        label: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"',
          'Inter', '"Segoe UI"', 'system-ui', 'sans-serif',
        ],
        serif: ['"Hiragino Mincho ProN"', '"Yu Mincho"', '"Noto Serif JP"', 'serif'],
      },
      borderRadius: {
        lg: '10px',
        xl: '14px',
        '2xl': '18px',
        '3xl': '26px',
      },
      boxShadow: {
        // Elevaciones con sombra tintada (nunca gris plano)
        'card': '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px -8px rgba(0,0,0,0.7)',
        'card-hover': '0 1px 0 rgba(255,255,255,0.10) inset, 0 22px 44px -14px rgba(0,0,0,0.85), 0 0 36px -8px rgba(255,61,90,0.45)',
        'glass': '0 1px 0 rgba(255,255,255,0.08) inset, 0 12px 40px -12px rgba(0,0,0,0.75)',
        'moon': '0 0 0 1px rgba(255,61,90,0.35), 0 8px 30px -6px rgba(255,61,90,0.6)',
        'moon-lg': '0 0 0 1px rgba(255,61,90,0.4), 0 14px 50px -8px rgba(255,61,90,0.65)',
      },
      transitionTimingFunction: {
        'ease-out-custom': 'cubic-bezier(0.33, 1, 0.68, 1)',
        // Curva "spring" suave típica de macOS
        'mac': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      keyframes: {
        'petal-fall': {
          '0%':   { transform: 'translate3d(0,-10vh,0) rotate(0deg)', opacity: '0' },
          '10%':  { opacity: '0.9' },
          '90%':  { opacity: '0.7' },
          '100%': { transform: 'translate3d(var(--petal-drift,80px),110vh,0) rotate(var(--petal-spin,540deg))', opacity: '0' },
        },
        // Solo transform (2 keyframes) y relativo al alto del contenedor (cqh):
        // se combina con steps() para producir ~30 fotogramas/s en vez de 120.
        'petal-drift': {
          '0%':   { transform: 'translate3d(0,-8cqh,0) rotate(0deg)' },
          '100%': { transform: 'translate3d(var(--petal-drift,80px),108cqh,0) rotate(var(--petal-spin,540deg))' },
        },
        'moon-breathe': {
          '0%,100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%':     { opacity: '1',    transform: 'scale(1.03)' },
        },
        'rise-in': {
          '0%':   { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'ink-draw': {
          '0%':   { 'stroke-dashoffset': '1000' },
          '100%': { 'stroke-dashoffset': '0' },
        },
      },
      animation: {
        'petal-fall': 'petal-fall var(--petal-dur,14s) linear infinite',
        'petal-drift': 'petal-drift var(--petal-dur,14s) linear infinite',
        'moon-breathe': 'moon-breathe 6s ease-in-out infinite',
        'rise-in': 'rise-in 0.6s cubic-bezier(0.32,0.72,0,1) both',
        'ink-draw': 'ink-draw 2.4s cubic-bezier(0.32,0.72,0,1) forwards',
      },
    },
  },
  plugins: [],
};
