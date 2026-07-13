import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const defaultDistDir =
    phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next-production-v2";

  return { distDir: process.env.BRIGHT_STUDIO_DIST_DIR ?? defaultDistDir };
}
