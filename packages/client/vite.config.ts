import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  // 渲染进程入口（Vite 从此目录寻找 index.html）
  root: resolve(__dirname, '.'),
  plugins: [
    vue(),
    // Element Plus 按需自动导入
    AutoImport({
      resolvers: [ElementPlusResolver()],
      imports: ['vue', 'vue-router', 'pinia'],
      dts: resolve(__dirname, 'src/renderer/auto-imports.d.ts'),
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: resolve(__dirname, 'src/renderer/components.d.ts'),
    }),
  ],
  resolve: {
    alias: {
      // @ 指向 renderer 目录
      '@': resolve(__dirname, 'src/renderer'),
      // @shared 指向 shared 目录
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  // variables.scss 只定义 CSS 变量（:root {...}），不含 SCSS 变量/混入
  // CSS 变量在浏览器运行时生效，无需 SCSS additionalData 注入
})
