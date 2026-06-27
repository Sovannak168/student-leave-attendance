/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0d0f12",
        card: "#15181e",
        border: "#232936",
        primary: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5"
        },
        danger: {
          DEFAULT: "#ef4444",
          hover: "#dc2626"
        },
        success: {
          DEFAULT: "#22c55e",
          hover: "#16a34a"
        },
        warning: {
          DEFAULT: "#eab308",
          hover: "#ca8a04"
        }
      },
      fontFamily: {
        sans: ["var(--font-outfit)", "Inter", "sans-serif"],
      },
      animation: {
        glow: "glow 2s infinite alternate",
        pulseFast: "pulse 1s infinite"
      },
      keyframes: {
        glow: {
          "0%": { boxShadow: "0 0 5px rgba(99, 102, 241, 0.2)" },
          "100%": { boxShadow: "0 0 20px rgba(99, 102, 241, 0.6)" }
        }
      }
    },
  },
  plugins: [],
}
