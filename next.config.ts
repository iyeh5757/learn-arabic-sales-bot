import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The chat route reads the owner spec with fs. Trace it into the function bundle.
  outputFileTracingIncludes: {
    "/api/chat": ["./docs/MASTER_AI_SALES_OPERATING_SPEC.md"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
