import path from "path";
import type { NextConfig } from "next";

const DIST_DIR_BY_COMMAND = {
  dev: ".next-dev",
  build: ".next-build",
  start: ".next-build",
} as const;

const nextCommand = process.argv.find(
  (arg): arg is keyof typeof DIST_DIR_BY_COMMAND =>
    Object.hasOwn(DIST_DIR_BY_COMMAND, arg),
);
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // Keep local concurrent dev/build processes from overwriting each other's
  // artifacts, but preserve the default production output on Vercel.
  distDir:
    isVercel
      ? ".next"
      : process.env.NEXT_DIST_DIR ??
        (nextCommand ? DIST_DIR_BY_COMMAND[nextCommand] : ".next"),
  // The dev indicator floats over the bottom HUD on mobile and steals taps.
  devIndicators: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
    ],
  },
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
