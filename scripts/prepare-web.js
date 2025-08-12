// scripts/prepare-web.js
const fs = require('fs');
const path = require('path');

const distribution = process.env.DISTRIBUTION || 'premium';
const projectRoot = process.cwd();

console.log(`🌐 准备Web版本构建 (${distribution})...`);

try {
  // 生成分发配置文件到public目录
  const configs = {
    free: {
      defaultSubscription: 'free',
      syncEnabled: false,
      showUpgradePrompts: true,
      features: ['basic-export'],
      appName: 'Todo App (Free) - Web',
      version: '1.0.0',
      buildType: 'free',
      platform: 'web'
    },
    premium: {
      defaultSubscription: 'premium',
      syncEnabled: true,
      showUpgradePrompts: false,
      features: ['sync', 'export', 'themes', 'advanced-search'],
      appName: 'Todo App - Web',
      version: '1.0.0',
      buildType: 'premium',
      platform: 'web'
    }
  };

  const configPath = path.join(projectRoot, 'public', 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(configs[distribution], null, 2));
  console.log(`✅ ${distribution} 版本配置文件生成完成`);

  console.log('✅ Web版本构建完成！');
  console.log('🚀 启动: npm start');

} catch (error) {
  console.error('❌ Web版本构建失败:', error.message);
  process.exit(1);
}