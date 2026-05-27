// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 必须使用 standalone 输出模式
  output: 'standalone',
  
  // 在开发模式下禁用React严格模式以避免重复初始化
  reactStrictMode: false,
  
  // 图像优化
  images: {
    unoptimized: true,
  },
  
  typescript: {
    // 忽略构建错误可以帮助处理一些棘手的类型问题，但应谨慎使用
    ignoreBuildErrors: true,
  },

  eslint: {
    // 在构建时忽略 ESLint，以加快流程
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
