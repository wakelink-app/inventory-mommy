import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma", "sharp"],
  outputFileTracingIncludes: {
    "*": ["./node_modules/.prisma/client/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    proxyClientMaxBodySize: "50mb",
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
