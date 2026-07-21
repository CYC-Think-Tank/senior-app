import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
