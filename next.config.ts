import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // a stray lockfile in the home directory confuses workspace-root inference
  turbopack: { root: path.join(__dirname) },
};

export default nextConfig;
