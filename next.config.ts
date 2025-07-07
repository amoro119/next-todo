// next.config.ts
import type { NextConfig } from "next";

const isElectron = process.env.ELECTRON === 'true';

const nextConfig: NextConfig = {
  // 必须使用 standalone 输出模式
  output: 'standalone',
  
  // 在 Electron 中，图像优化通常是不必要的，并且可能导致问题
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
  
  webpack(config, { isServer }) {
    // 关键：告诉 Webpack，在 Electron 环境中，不要打包 Node.js 的原生模块
    if (isElectron) {
      config.externals = [
        ...config.externals,
        'fs',
        'path',
        'os',
        'crypto',
        'stream',
        'assert',
        'util',
        'events',
      ];
    }
    
    // 保留 wasm 文件加载规则
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'asset/resource',
    });
    
    // 保留 raw 文件加载规则 (如果需要)
    config.module.rules.push({
      resourceQuery: /raw/,
      type: 'asset/source',
    });

    return config;
  },
};

export default nextConfig;