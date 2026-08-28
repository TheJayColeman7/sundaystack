import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "../..");

function publicApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  try {
    const envFile = readFileSync(path.join(repoRoot, ".env"), "utf8");
    const match = envFile.match(/^NEXT_PUBLIC_API_URL=(.*)$/m);
    const value = match?.[1]?.trim();
    if (value) {
      return value;
    }
  } catch {
    // Root .env is optional; fall back to the default API port.
  }

  return "http://localhost:3001";
}

const apiUrl = publicApiUrl();

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  transpilePackages: ["@sundaystack/shared"],
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
