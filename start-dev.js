#!/usr/bin/env node

// 临时启动脚本，绕过Node.js版本检查
import { spawn } from 'child_process';

console.log('Starting development server with Node.js version bypass...');

// 启动后端服务
const backend = spawn('docker', ['compose', 'up', '-d'], {
  stdio: 'inherit',
  shell: true
});

backend.on('close', (code) => {
  if (code === 0) {
    console.log('Backend services started successfully');
    
    // 启动写入服务器
    const writeServer = spawn('npx', ['dotenv', '-e', '.env.local', '--', 'tsx', 'server.ts'], {
      stdio: 'inherit',
      shell: true
    });
    
    // 启动Next.js开发服务器（绕过版本检查）
    const nextDev = spawn('npx', ['--yes', 'next', 'dev', '-p', '3000'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' }
    });
    
    // 处理进程退出
    const cleanup = () => {
      writeServer.kill();
      nextDev.kill();
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
  } else {
    console.error('Failed to start backend services');
    process.exit(code);
  }
}); 