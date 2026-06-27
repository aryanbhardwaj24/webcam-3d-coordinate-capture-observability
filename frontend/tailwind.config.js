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
      },
    },
  },
  plugins: [],
}
