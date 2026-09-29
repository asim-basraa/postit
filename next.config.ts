import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The renderer is a workspace package shipped as TypeScript source rather
  // than a build artifact, so Next has to compile it alongside the app.
  transpilePackages: ["@postit/renderer", "@wave/spec", "@wave/inspector", "@wave/server", "@wave/db", "@wave/react", "@wave/mcp", "@wave/skills", "@wave/prototype"],
};

export default nextConfig;
