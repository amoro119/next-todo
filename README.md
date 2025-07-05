## 提示词

请深入分析代码，理解todo项目程序功能如何实现和使用的技术框架。然后帮我把todo项目重构为nextjs为核心的next-todo项目，请一步一步来操作，我完成你一步你再告诉我下一步如何操作

```
原始 todo 项目
技术栈:
前端: 这是一个经典的单页面应用（SPA），使用 Vue.js (v2) 作为核心框架。所有前端逻辑都包含在 index-zh.html 文件中的 <script> 标签内，通过一个大的 Vue 实例来管理状态和交互。
后端: 使用 Node.js + Express 搭建了一个简单的 RESTful API 服务器 (server.js)。
数据库: 使用 SQLite (database.js) 进行数据持久化。
样式: 使用原生 CSS，并提供了 SCSS 源文件 (style.css, style.scss)。
日历模块功能实现:
视图切换: 通过一个名为 currentView 的 Vue 数据属性，在不同的视图（如今日待办、收件箱、日历）之间切换。
日历网格生成: 使用 calendarDays 计算属性动态生成一个月的日历视图，包括上个月和下个月的补全日期。
任务展示: getTodosForDate 方法负责筛选出在特定日期应该显示的任务。它支持跨越多天的任务（通过 start_date 和 due_date）。
交互:
拖放: 您可以在日历的不同日期之间拖放任务来更改其截止日期。
任务详情: 点击日历上的任务会弹出一个模态框，允许用户查看和编辑任务的完整信息（包括标题、备注、日期、优先级等）。
快速添加: 点击日期上的 + 号，可以直接在主输入框中为该日期添加新任务。
目标 next-todo 项目
技术栈:
前端: Next.js (App Router) with React and TypeScript。这是一个更现代的、基于组件的架构。
后端: Next.js Route Handlers (app/api/...)，同样连接到 SQLite 数据库。
样式: Tailwind CSS (通过 globals.css 和 @import "tailwindcss"; 配置)。
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
