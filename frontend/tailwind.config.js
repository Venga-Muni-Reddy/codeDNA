/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#ebf0ff',
          200: '#d1dcff',
          300: '#a7beff',
          400: '#7395ff',
          500: '#3b66f5',
          600: '#2546d9',
          700: '#1b32a8',
          800: '#172787',
          900: '#17246e',
          950: '#0e1445',
        },
      },
    },
  },
  plugins: [],
}
