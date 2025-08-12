// scripts/validate-build.js
const fs = require('fs');
const path = require('path');

const distribution = process.env.DISTRIBUTION || 'premium';

console.log(`🔍 验证 ${distribution} 版本构建产物...`);

const projectRoot = process.cwd();
const standaloneDir = path.join(projectRoot, '.next', 'standalone');
const configPath = path.join(standaloneDir, 'public', 'config.json');

let hasErrors = false;

// 1. 检查 standalone 目录是否存在
if (!fs.existsSync(standaloneDir)) {
  console.error('❌ .next/standalone 目录不存在');
  hasErrors = true;
} else {
  console.log('✅ standalone 目录存在');
}

// 2. 检查配置文件是否存在
if (!fs.existsSync(configPath)) {
  console.error('❌ 配置文件不存在:', configPath);
  hasErrors = true;
} else {
  console.log('✅ 配置文件存在');
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('📋 配置内容:', config);
    
    // 3. 验证配置内容
    const expectedBuildType = distribution;
    if (config.buildType !== expectedBuildType) {
      console.error(`❌ 配置文件中的 buildType (${config.buildType}) 与期望值 (${expectedBuildType}) 不匹配`);
      hasErrors = true;
    } else {
      console.log('✅ buildType 配置正确');
    }
    
    // 4. 检查必需字段
    const requiredFields = ['defaultSubscription', 'syncEnabled', 'showUpgradePrompts', 'features', 'appName', 'version'];
    requiredFields.forEach(field => {
      if (!(field in config)) {
        console.error(`❌ 配置文件缺少必需字段: ${field}`);
        hasErrors = true;
      }
    });
    
    if (!hasErrors) {
      console.log('✅ 配置文件内容验证通过');
    }
    
  } catch (error) {
    console.error('❌ 配置文件格式错误:', error.message);
    hasErrors = true;
  }
}

// 5. 检查输出目录
const expectedOutputDir = path.join(projectRoot, `dist-${distribution}`);
if (fs.existsSync(expectedOutputDir)) {
  console.log(`✅ 输出目录存在: ${expectedOutputDir}`);
  
  // 检查输出目录中的文件
  const files = fs.readdirSync(expectedOutputDir);
  if (files.length > 0) {
    console.log(`✅ 输出目录包含 ${files.length} 个文件/目录`);
  } else {
    console.warn('⚠️ 输出目录为空');
  }
} else {
  console.warn(`⚠️ 输出目录不存在: ${expectedOutputDir} (可能尚未运行 electron:build)`);
}

// 6. 检查必要的文件
const requiredFiles = [
  path.join(standaloneDir, 'package.json'),
  path.join(standaloneDir, 'server.js'),
  path.join(standaloneDir, 'public'),
  path.join(standaloneDir, '.next', 'static'),
];

requiredFiles.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    console.log(`✅ 必要文件存在: ${path.relative(projectRoot, filePath)}`);
  } else {
    console.error(`❌ 必要文件缺失: ${path.relative(projectRoot, filePath)}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.error(`❌ ${distribution} 版本构建验证失败`);
  process.exit(1);
} else {
  console.log(`✅ ${distribution} 版本构建验证通过`);
}