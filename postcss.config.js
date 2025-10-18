// Tailwind v4: el plugin de PostCSS ahora es @tailwindcss/postcss
export default {
  plugins: {
    "@tailwindcss/postcss": {}, // 👈 nuevo plugin
    autoprefixer: {},           // opcional (puedes quitarlo si no lo necesitas)
  },
};
