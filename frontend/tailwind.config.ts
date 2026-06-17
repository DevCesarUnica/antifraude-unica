import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red:  "#DC2626",
          dark: "#0F0F0F",
          card: "#1F1F1F",
          mid:  "#2D2D2D",
        },
      },
    },
  },
  plugins: [],
};

export default config;
