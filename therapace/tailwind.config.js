/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,ts,tsx}', './components/**/*.{js,ts,tsx}', './containers/**/*.{js,ts,tsx}'],

  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: '#E43D7C',
        background: '#EFEFEB',
        accent: '#DC6403',
      },
      fontSize: {
        dynamic: "var(--font-size-dynamic)",
      },
    },
  },
  plugins: [],
};
