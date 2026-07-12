import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@thefix/engine", "@thefix/shared"],
};

export default nextConfig;
