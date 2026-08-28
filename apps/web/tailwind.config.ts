import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0c1016",
        panel: "#151b24",
        line: "#2a3342",
        turf: "#3dd68c",
      },
    },
  },
  plugins: [],
};

export default config;
