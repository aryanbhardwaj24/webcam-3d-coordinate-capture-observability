module.exports = {
  darkMode: ["class"],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#06070B",
          900: "#0B0F17",
          800: "#111827",
        },
        accent: {
          cyan: "#22D3EE",
          violet: "#A78BFA",
        },
      },
      borderRadius: {
        glass: "18px",
      },
      boxShadow: {
        glass: "0 20px 60px rgba(0,0,0,0.55)",
        glow: "0 0 0 1px rgba(34,211,238,0.14), 0 0 0 1px rgba(167,139,250,0.12) inset, 0 30px 90px rgba(0,0,0,0.65)",
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
}
