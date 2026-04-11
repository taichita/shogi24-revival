import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@shogi24/engine"],
  output: "standalone",
};

export default nextConfig;
