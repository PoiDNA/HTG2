/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        htg: {
          bg: "#0A0A0B",
          surface: "#141416",
          muted: "#2A2A2E",
          text: "#F5F5F5",
          subtle: "#A1A1AA",
          accent: "#D4AF37",
          danger: "#DC2626",
        },
      },
      fontFamily: {
        sans: ["System"],
      },
    },
  },
  plugins: [],
};
