/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'arlo-blue': '#00c3e3',
        'arlo-dark': '#0a0a0a',
        'arlo-glass': 'rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        'dirt-pattern': "url('/assets/dirt.png')",
      },
      fontFamily: {
        outfit: ['Outfit', 'sans-serif'],
        pixel: ['"Press Start 2P"', 'system-ui'],
      },
    },
  },
  plugins: [],
}
