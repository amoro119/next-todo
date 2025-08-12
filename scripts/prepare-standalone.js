// scripts/prepare-standalone.js
// #!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取分发版本参数
const distribution = process.env.DISTRIBUTION || process.argv[2] || 'premium';
const validDistributions = ['free', 'premium'];

if (!validDistributions.includes(distribution)) {
  console.error(`❌ 无效的分发版本: ${distribution}`);
  console.error(`✅ 有效值: ${validDistributions.join(', ')}`);
  process.exit(1);
}

console.log(`🚀 准备独立的 Next.js 服务器 (${distribution} 版本)...`);

const projectRoot = process.cwd();
const standaloneDir = path.join(projectRoot, '.next', 'standalone');

if (!fs.existsSync(standaloneDir)) {
  console.error('❌ .next/standalone 目录不存在，请先运行 npm run next:build');
  process.exit(1);
}

try {
  // 1. 将根目录的 package.json 复制到 standalone 目录中
  console.log('📋 复制 package.json 到 standalone 目录...');
  fs.copyFileSync(
    path.join(projectRoot, 'package.json'),
    path.join(standaloneDir, 'package.json')
  );
  
  // 2. 在 standalone 目录中安装生产依赖
  console.log('📦 在 standalone 目录中安装生产依赖...');
  execSync('npm install --omit=dev', { cwd: standaloneDir, stdio: 'inherit' });
  console.log('✅ 生产依赖安装完成。');

  // 3. 复制 public 和 .next/static 目录到 standalone 目录内部
  const publicSrc = path.join(projectRoot, 'public');
  const publicDest = path.join(standaloneDir, 'public');
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log('✅ public 目录已复制到 standalone 内部。');
  }

  const staticSrc = path.join(projectRoot, '.next', 'static');
  const staticDest = path.join(standaloneDir, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log('✅ .next/static 目录已复制到 standalone 内部。');
  } else {
    console.error('❌ 未找到 .next/static 目录，构建可能不完整。');
    process.exit(1);
  }
  
  // 4. 复制 PGlite worker 脚本
  console.log('🔧 复制 worker 文件...');
  const workerSrcDir = path.join(projectRoot, 'dist-worker', 'app');
  if (fs.existsSync(workerSrcDir)) {
      const workerDestDir = path.join(publicDest, 'workers'); // 复制到 standalone 内部的 public 目录
      if (!fs.existsSync(workerDestDir)) {
        fs.mkdirSync(workerDestDir, { recursive: true });
      }
      fs.readdirSync(workerSrcDir).forEach(file => {
          if (file.startsWith('pglite-worker')) {
              fs.copyFileSync(path.join(workerSrcDir, file), path.join(workerDestDir, file));
          }
      });
      console.log('✅ Worker 文件复制成功。');
  } else {
    console.error('❌ 源 worker 目录不存在: ' + workerSrcDir);
    process.exit(1);
  }

  // 5. 复制 write-server 编译产物
  // console.log('🔧 复制 write-server 编译产物 (dist-server)...');
  // const serverSrcDir = path.join(projectRoot, 'dist-server');
  // const serverDestDir = path.join(standaloneDir, 'dist-server');
  // if (fs.existsSync(serverSrcDir)) {
  //   fs.cpSync(serverSrcDir, serverDestDir, { recursive: true });
  //   console.log('✅ dist-server 目录复制成功。');
  // } else {
  //   console.error('❌ 源 write-server 编译产物目录 (dist-server) 不存在。请确保已经编译 server.ts。');
  //   process.exit(1);
  // }

   // 6. 复制数据库目录 (如果存在)
  console.log('🗄️ 复制数据库目录...');
  const dbSrc = path.join(projectRoot, 'pgdata');
  const dbDest = path.join(standaloneDir, 'pgdata');
  if (fs.existsSync(dbSrc)) {
    fs.cpSync(dbSrc, dbDest, { recursive: true });
    console.log('✅ 数据库目录复制成功。');
  } else {
    console.warn('⚠️ 源数据库目录不存在，跳过复制。');
  }

  // 7. 生成分发配置文件
  console.log(`🔧 生成 ${distribution} 版本配置文件...`);
  const distributionConfigs = {
    free: {
      defaultSubscription: 'free',
      syncEnabled: false,
      showUpgradePrompts: true,
      features: ['basic-export'],
      appName: 'Todo App (Free)',
      version: '1.0.0',
      buildType: 'free',
    },
    premium: {
      defaultSubscription: 'premium',
      syncEnabled: true,
      showUpgradePrompts: false,
      features: ['sync', 'export', 'themes', 'advanced-search'],
      appName: 'Todo App',
      version: '1.0.0',
      buildType: 'premium',
    }
  };

  const configPath = path.join(publicDest, 'config.json');
  fs.writeFileSync(
    configPath,
    JSON.stringify(distributionConfigs[distribution], null, 2)
  );
  console.log(`✅ ${distribution} 版本配置文件已生成: ${configPath}`);

  console.log(`✅ Standalone 目录准备完成 (${distribution} 版本)！`);

} catch (error) {
  console.error('❌ 构建准备失败:', error.message);
  process.exit(1);
}