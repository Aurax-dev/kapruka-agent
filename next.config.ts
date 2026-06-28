import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "static2.kapruka.com" },
    ],
  },
};

export default nextConfig;
