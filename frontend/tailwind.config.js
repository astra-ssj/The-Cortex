/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cortex: {
          bg: "var(--bg)",
          sidebar: "var(--sidebar)",
          surface: "var(--surface)",
          card: "var(--card)",
          "card-hover": "var(--card-hover)",
          elevated: "var(--elevated)",
          border: "var(--border)",
          "border-sub": "var(--border-subtle)",
          text: "var(--text)",
          "text-sec": "var(--text-secondary)",
          "text-ter": "var(--text-tertiary)",
          "text-quiet": "var(--text-quiet)",
          blue: "var(--blue)",
          green: "var(--green)",
          amber: "var(--amber)",
          red: "var(--red)",
          purple: "var(--purple)",
          cyan: "var(--cyan)",
          /* Aliases for existing utility class names */
          muted: "var(--text-secondary)",
          panel: "var(--card)",
        },
      },
    },
  },
  plugins: [],
};
