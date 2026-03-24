import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1613",
        mist: "#edf4ee",
        moss: "#588157",
        ember: "#c46a42",
        neon: "#d9ff66",
        slate: "#18221f",
      },
      boxShadow: {
        panel: "0 20px 60px rgba(9, 15, 12, 0.18)",
      },
      backgroundImage: {
        grid: "linear-gradient(rgba(13,22,19,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(13,22,19,0.08) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;
