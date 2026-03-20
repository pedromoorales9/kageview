/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        primary:                       '#cb97ff',
        'primary-dim':                 '#be83fa',
        'primary-container':           '#c185fd',
        secondary:                     '#f673b7',
        'secondary-dim':               '#f271b5',
        tertiary:                      '#47c4ff',
        background:                    '#0e0e13',
        surface:                       '#0e0e13',
        'surface-dim':                 '#0e0e13',
        'surface-container-lowest':    '#000000',
        'surface-container-low':       '#131318',
        'surface-container':           '#19191f',
        'surface-container-high':      '#1f1f26',
        'surface-container-highest':   '#25252c',
        'surface-bright':              '#2b2b33',
        'surface-variant':             '#25252c',
        'on-background':               '#f8f5fd',
        'on-surface':                  '#f8f5fd',
        'on-surface-variant':          '#acaab1',
        'on-primary':                  '#46007c',
        'on-primary-fixed':            '#000000',
        outline:                       '#76747b',
        'outline-variant':             '#48474d',
        error:                         '#ff6e84',
      },
      fontFamily: {
        headline: ['"Plus Jakarta Sans"', 'sans-serif'],
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
