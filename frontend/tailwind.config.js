/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Murmuration design tokens
        bg: {
          main: '#080D12',
          sidebar: '#0B1219',
          card: '#101922',
          elevated: '#151F2A',
        },
        border: {
          subtle: 'rgba(148, 163, 184, 0.14)',
        },
        emerald: {
          mur: '#43D9A3',
        },
        cyan: {
          mur: '#58BFE8',
        },
        amber: {
          mur: '#F4B860',
        },
        red: {
          mur: '#F16C75',
        },
        text: {
          primary: '#EDF4F7',
          secondary: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontVariantNumeric: ['tabular-nums'],
    },
  },
  plugins: [],
}
