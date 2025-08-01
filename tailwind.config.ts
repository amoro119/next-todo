import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 基于你的 SCSS 变量定义的颜色
        'body-bg': '#e8f6ff',
        'font-color': '#33322E',
        'bg-normal': '#fffbe7',
        'bg-submit': '#ffd6e9',
        'bg-completed': '#D0F4F0',
        'bg-discard': '#FFF0EE',
        'bg-deleted': '#ddd',
        'bg-edit': '#fbeef3',
        'normal': '#f5d99e',
        'completed': '#8CD4CB',
        'deleted': '#F6A89E',
        'black': '#33322E',
      },
      fontFamily: {
        sans: [
          'DM Sans',
          'PingFang SC',
          'Lantinghei SC',
          'Microsoft YaHei',
          'HanHei SC',
          'Helvetica Neue',
          'Open Sans',
          'Arial',
          'Hiragino Sans GB',
          'STHeiti',
          'WenQuanYi Micro Hei',
          'SimSun',
          'sans-serif',
          'HYWenHei-GEW',
        ],
      },
      borderRadius: {
        'custom': '12px',
      },
      boxShadow: {
        'custom': '4px 4px 0px #33322E',
        'custom-reverse': '-4px 4px 0px #33322E',
      },
      spacing: {
        'custom-padding': '20px 24px',
        'btn-padding': '12px 24px',
        'btn-small-padding': '10px 20px',
      },
    },
  },
  plugins: [],
}

export default config