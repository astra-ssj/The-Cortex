/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: "#05080f",
          surface: "#0f172a",
          panel: "#1e293b",
          border: "#334155",
          text: "#f1f5f9",
          muted: "#94a3b8",
          blue: "#3b82f6",
          purple: "#8b5cf6",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
