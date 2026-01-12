/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./components/**/*.tsx",
    "./components/**/*.ts",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1677ff',
        'primary-bg': '#e6f4ff',
        success: '#52c41a',
        warning: '#faad14',
        danger: '#ff4d4f',
        'text-main': '#1f1f1f',
        'text-sub': '#8c8c8c',
        'bg-light': '#f5f7fa',
      },
    },
  },
}
