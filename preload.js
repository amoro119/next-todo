// preload.js
// 此文件在渲染进程加载之前在一个拥有特权的上下文中运行。
// 因为 `contextIsolation` 是开启的，所以在这里设置的 window 属性不会影响到主世界。
// 主要的 polyfill 现在通过内联脚本在 layout.tsx 中处理。
// 此文件保持存在以遵循 Electron 的最佳实践。

console.log('Preload script has been loaded.');