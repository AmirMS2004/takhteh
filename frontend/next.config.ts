import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // In `next dev`, forward API calls to the backend container. Not used by the static build.
  ...(process.env.NODE_ENV === "development" && {
    rewrites: async () => [{ source: "/api/:path*", destination: "http://localhost:8000/api/:path*" }],
  }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
