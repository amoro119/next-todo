// scripts/prepare-standalone.js
// #!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 准备独立的 Next.js 服务器...');

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

   // 5. 复制数据库目录 (如果存在)
  console.log('🗄️ 复制数据库目录...');
  const dbSrc = path.join(projectRoot, 'pgdata');
  const dbDest = path.join(standaloneDir, 'pgdata');
  if (fs.existsSync(dbSrc)) {
    fs.cpSync(dbSrc, dbDest, { recursive: true });
    console.log('✅ 数据库目录复制成功。');
  } else {
    console.warn('⚠️ 源数据库目录不存在，跳过复制。');
  }

  console.log('✅ Standalone 目录准备完成！');

} catch (error) {
  console.error('❌ 构建准备失败:', error.message);
  process.exit(1);
}