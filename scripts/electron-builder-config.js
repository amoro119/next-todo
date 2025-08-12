// scripts/electron-builder-config.js
const path = require('path');

const distribution = process.env.DISTRIBUTION || 'premium';

const baseConfig = {
  asar: false,
  directories: {
    app: "."
  },
  files: [
    "main.js",
    "preload.js",
    ".next/standalone/**/*",
    "public",
    "electron/**/*",
    "db/**/*",
    ".next/static/**/*",
    "package.json"
  ],
  mac: {
    category: "public.app-category.productivity"
  },
  win: {
    target: "nsis"
  },
  linux: {
    target: "AppImage"
  }
};

const distributionConfigs = {
  free: {
    appId: "com.example.next-todo-free",
    productName: "Todo App (Free)",
    directories: {
      ...baseConfig.directories,
      output: "dist-free"
    }
  },
  premium: {
    appId: "com.example.next-todo-premium",
    productName: "Todo App",
    directories: {
      ...baseConfig.directories,
      output: "dist-premium"
    }
  }
};

const config = {
  ...baseConfig,
  ...distributionConfigs[distribution]
};

module.exports = config;