/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'primary': '#debbff',
        'primary-container': '#cb97ff',
        'secondary': '#ffafd7',
        'tertiary': '#35e66a',
        'background': '#131318',
        'surface': '#131318',
        'surface-dim': '#131318',
        'surface-container-lowest': '#0e0e13',
        'surface-container-low': '#1b1b20',
        'surface-container': '#1f1f24',
        'surface-container-high': '#2a292f',
        'surface-container-highest': '#35343a',
        'surface-bright': '#39383e',
        'surface-variant': '#35343a',
        'on-background': '#e4e1e9',
        'on-surface': '#e4e1e9',
        'on-surface-variant': '#cec3d2',
        'on-primary': '#461076',
        'on-primary-fixed': '#2c0051',
        'on-secondary': '#620044',
        'on-tertiary': '#003912',
        'outline': '#978d9c',
        'outline-variant': '#4b4451',
        'error': '#ffb4ab',
      },
      fontFamily: {
        headline: ['"Manrope"', 'sans-serif'],
        body:     ['Inter', 'sans-serif'],
        label:    ['Inter', 'sans-serif'],
      },
      borderRadius: {
        xl:  '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      transitionTimingFunction: {
        'ease-out-custom': 'cubic-bezier(0.33, 1, 0.68, 1)',
      },
    },
  },
  plugins: [],
};
