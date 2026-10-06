import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Stop `next dev` from writing AGENTS.md / CLAUDE.md into the repo.
  agentRules: false,
};

export default nextConfig;
