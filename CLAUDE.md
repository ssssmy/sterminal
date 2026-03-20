# STerminal - Claude Code 项目指南

## 项目概述
跨平台桌面终端管理工具。Electron + Vue 3 (Composition API + `<script setup>`) + Pinia + Element Plus + xterm.js + node-pty + ssh2。

Monorepo 结构：
- `packages/client` — Electron 桌面应用（主进程 + 渲染进程）
- `packages/server` — 后端服务（开发中）

## 目录结构
```
packages/client/src/
  main/                    # Electron 主进程
    index.ts                 窗口创建，平台特定配置
    database/schema.ts       SQLite 建表语句
    ipc/                     IPC handlers (pty, ssh, db)
    services/db.ts           better-sqlite3 封装
  preload/index.ts         # contextBridge，暴露 ipc + platform
  renderer/                # Vue 渲染进程
    components/
      sidebar/AppSidebar.vue       主机列表、本地终端列表、分组
      toolbar/AppToolbar.vue       分屏、广播、录制等工具按钮
      terminal/TerminalPane.vue    终端池 + 分屏树渲染（核心文件）
      terminal/TerminalTabs.vue    标签栏
      terminal/TerminalConfigDialog.vue
      host/HostConfigDialog.vue
    composables/useIpc.ts          IPC 封装（invoke/on/off + 自动清理）
    stores/
      sessions.store.ts    标签页、分屏树、terminalInstances Map
      hosts.store.ts       主机 CRUD
      terminals.store.ts   本地终端配置 CRUD
      ui.store.ts          侧边栏宽度、对话框状态
      auth.store.ts        用户认证（当前 mock）
    views/
      workspace/WorkspaceView.vue  主工作区（KeepAlive 缓存）
      settings/SettingsLayout.vue  设置页
    styles/global.scss             全局主题变量
  shared/types/            # 前后端共享类型定义
    terminal.ts    TabSession, SplitNode, TerminalInstance, LocalTerminalConfig
    host.ts        Host, HostGroup, Tag
    ipc-channels.ts IPC 频道常量
```

## 核心架构

### 终端池模式（TerminalPane.vue）
xterm 实例的生命周期独立于 Vue 组件树，通过模块级 `terminalPool` Map 管理：
- 组件 mount：检查池→有则移动 DOM 元素；无则创建新终端
- 组件 unmount：检查 `terminalInstances.has(id)` 判断是分屏重组还是真正关闭
  - 分屏重组：DOM 移到 offscreen holder，PTY/SSH 保持连接
  - 真正关闭：disposePooledTerminal 彻底销毁
- IPC 监听器直接用 `window.electronAPI.ipc`，不经过 useIpc（避免自动清理干扰）

### 分屏树（SplitNode）
- 递归类型：`terminal`（叶子）| `split`（direction + ratio + children[2]）
- splitNodeInTree：原地修改中间节点，避免重建整棵树
- closeSplitPane：先删 terminalInstances 再改树，确保组件 unmount 走销毁路径

### 路由
- WorkspaceView 用 `<KeepAlive include="WorkspaceView">` 缓存
- 切换设置页时终端不销毁

## 重要约定

### 主题
- 使用 Element Plus 官方 `dark/css-vars.css` + `html.dark` class
- 自定义紫色调色板覆盖（`global.scss`）
- 不要在单个组件中设置全局 `--el-*` 变量，用 `html.dark` 选择器

### 平台适配
- `window.electronAPI.platform` 暴露平台信息（darwin/win32/linux）
- macOS：`titleBarStyle: 'hidden'` + `trafficLightPosition`，侧边栏/设置页顶部 38px spacer
- Windows：`titleBarOverlay` 原生窗口按钮，工具栏右侧 138px spacer

### 终端命令
- 发送命令到 PTY/SSH 用 `\r`（CR），不要用 `\n`（LF）—— PowerShell 把 LF 当续行符
- 启动命令等待首次数据输出后发送（shell prompt 就绪）

### IPC
- `useIpc` composable 用于普通组件的 IPC 调用，自动清理监听器
- TerminalPane 中的终端池直接调用 `window.electronAPI.ipc`，自行管理生命周期
- Preload 的 `on()` 在 callback 上存储 `_handler` 引用，`removeListener` 通过它找到真实 handler

### 数据库
- 数据库字段用 snake_case，TypeScript 用 camelCase
- Store 中的 `mapDbRow` / `mapDbRowToHost` 负责转换
- DB handler 在 `db.handler.ts`，CRUD 通过 IPC_DB 频道

## 开发命令
```bash
# 安装依赖
npm install

# 开发模式
cd packages/client && npm run dev

# 类型检查（忽略 .vue 文件找不到模块的错误，需要 vue-tsc）
npx tsc --noEmit --project packages/client/tsconfig.json
```
