/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red:  '#cc0000',
          blue: '#094f82',
          dark: '#0a2540',
        }
      }
    }
  },
  plugins: []
}
