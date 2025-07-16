## 提示词

请深入分析代码，理解todo项目程序功能如何实现和使用的技术框架。然后帮我把todo项目重构为nextjs为核心的next-todo项目，请一步一步来操作，我完成你一步你再告诉我下一步如何操作

```
核心功能
多清单管理：用户可以创建、编辑、删除、排序和隐藏不同的待办事项清单。
待办事项（Todo）管理：支持丰富的 Todo 属性，包括标题、备注、完成状态、优先级、标签、起止日期等。
多种视图：
今日待办 (List View)：显示当天到期的任务。
日历视图 (Calendar View)：以月历形式展示和管理任务，支持拖拽修改日期。
收件箱 (Inbox)：收集未分类或已过期的任务。
清单视图：显示特定清单下的所有任务。
回收站 (Recycle Bin)：软删除的任务会进入回收站，可以恢复或永久删除。
数据导入/导出：支持从 CSV (滴答清单格式) 或 JSON 文件导入数据，也提供了导出功能（尽管UI上按钮的功能尚未完全实现）。
离线可用性：所有操作都首先在本地数据库完成，无需等待网络响应。
云端同步：当网络可用时，本地数据会自动与远程服务器进行双向同步。
技术框架拆解
前端框架:
Next.js (App Router): 用于构建用户界面，利用其服务端组件和客户端组件的能力。
React: UI 库。
Tailwind CSS: 用于样式设计。
桌面应用打包:
Electron: 将基于 Web 技术的应用打包成跨平台的桌面应用（macOS, Windows, Linux）。
main.js: Electron 的主进程入口文件，负责创建窗口和管理应用的生命周期。
preload.js: 预加载脚本，作为主进程和渲染进程之间的桥梁，通过 contextBridge 安全地暴露主进程能力给渲染进程（例如数据库操作）。
数据层 (Local-First 核心):
ElectricSQL: 这是一个 Local-First 同步平台，是本项目的灵魂。它负责在本地设备和云端 PostgreSQL 之间进行实时、双向的数据同步和冲突解决。
PGlite: ElectricSQL 使用的一个关键组件，它是一个在 JavaScript 环境中（浏览器 Worker 或 Node.js）运行的、功能完备的 PostgreSQL 数据库。
在本项目中，PGlite 运行在 Web Worker (app/pglite-worker.ts) 中。这样做的好处是数据库操作不会阻塞 UI 线程，保证了应用的流畅性。
数据同步 (app/sync.ts): 这个文件负责配置和启动 ElectricSQL 的同步过程。它会连接到远程的 ElectricSQL 服务，并定义哪些数据表（Shapes）需要同步。
后端服务 (云端):
Docker Compose (docker-compose.yml): 用于在本地开发环境中一键启动 PostgreSQL 数据库和 ElectricSQL 同步服务。
Supabase: 在生产环境中，本项目似乎计划使用 Supabase 作为后端服务提供商。
PostgreSQL 数据库: Supabase 提供了托管的 PostgreSQL 数据库。
Edge Functions: 使用 Deno 运行时编写的无服务器函数，用于处理自定义逻辑。
token-issuer: 负责为客户端颁发用于 ElectricSQL 同步的 JWT（JSON Web Token）。
gatekeeper: 似乎是一个自定义的、用于数据塑形（Shape）请求的代理或验证层。
write-server: 一个 非常关键 的自定义接口，用于接收客户端（特别是数据导入时）发来的批量数据变更，并将其写入 Supabase 数据库。这是一种手动触发的同步方式，作为 ElectricSQL 自动同步的补充。
```


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
