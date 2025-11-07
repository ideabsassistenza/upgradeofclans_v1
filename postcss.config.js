// PostCSS minimale senza Tailwind.
// Questo impedisce a Next di tentare di caricare "@tailwindcss/postcss".
module.exports = {
  plugins: {
    autoprefixer: {}
  }
};
