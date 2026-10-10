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
          main: '#000000',
          sidebar: '#000000',
          card: '#0A0A0A',
          elevated: '#141414',
        },
        border: {
          subtle: '#1A1A1A',
        },
        emerald: {
          mur: '#FFFFFF',
        },
        cyan: {
          mur: '#FFFFFF',
        },
        amber: {
          mur: '#F4B860',
        },
        red: {
          mur: '#F16C75',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A3A3A3',
        },
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontVariantNumeric: ['tabular-nums'],
    },
  },
  plugins: [],
}
