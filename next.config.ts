import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E（Playwright）実行時、ローカルの通常dev serverと同じ .next を共有して壊さないよう、
  // NEXT_DIST_DIR が設定されている場合のみビルド出力先を分離する（未設定時は既定の .next）。
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
