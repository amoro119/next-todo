// scripts/validate-web.js
const fs = require('fs');
const path = require('path');

const distribution = process.env.DISTRIBUTION || 'premium';
const projectRoot = process.cwd();

console.log(`🔍 验证Web构建 (${distribution})...`);

let hasErrors = false;

// 检查Next.js构建输出
const requiredFiles = [
  '.next/static',
  '.next/server',
  'public/config.json'
];

requiredFiles.forEach(file => {
  const filePath = path.join(projectRoot, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.error(`❌ 缺失: ${file}`);
    hasErrors = true;
  }
});

// 检查配置文件
const configPath = path.join(projectRoot, 'public', 'config.json');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.platform === 'web' && config.buildType === distribution) {
    console.log('✅ 配置正确');
  } else {
    console.error('❌ 配置错误');
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error(`❌ 验证失败`);
  process.exit(1);
} else {
  console.log(`✅ 验证通过`);
  console.log(`🚀 启动: npm start`);
}