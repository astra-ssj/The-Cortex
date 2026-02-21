/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: "#05080f",
          surface: "#090e1a",
          panel: "#0c1220",
          border: "#141e30",
          text: "#e2e8f4",
          muted: "#4a5a72",
          blue: "#3b82f6",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        ui: ["DM Sans", "system-ui", "sans-serif"],
        data: ["DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
