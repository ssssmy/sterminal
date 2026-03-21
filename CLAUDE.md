# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# STerminal - Claude Code 项目指南

## 项目概述
跨平台桌面终端管理工具，面向开发者和运维工程师。集成 SSH/SFTP 客户端、本地终端管理、密钥管理、端口转发、命令片段等核心能力，提供免费云同步服务。

技术栈：Electron 33 + Vue 3 (Composition API + `<script setup>`) + Pinia + Element Plus + xterm.js 5 + node-pty + ssh2 + better-sqlite3。

Monorepo 结构：
- `packages/client` — Electron 桌面应用（主进程 + 渲染进程）
- `packages/server` — 后端同步服务（Express + SQLite + WebSocket）

## 开发阶段
| 阶段 | 范围 | 状态 |
|------|------|------|
| **P0 MVP** | 登录注册、本地终端(多配置)、SSH连接、主机管理(CRUD/分组)、多标签/分屏 | ✅ 已完成 |
| **P0+** | 广播模式、会话录制、终端内搜索、侧边栏折叠持久化、远端OS检测 | ✅ 已完成 |
| **P1 核心增强** | SFTP文件管理、命令片段、端口转发、设置完善、云同步对接 | 🔧 部分完成（片段+端口转发已完成） |
| **P2 进阶功能** | SSH密钥管理、已知主机、Vault密钥库、录制回放器、日志审计 | ⏳ 待开发 |
| **P3 体验优化** | 自动补全、命令面板完善、主题自定义、快捷键自定义、数据导入导出、自动更新 | ⏳ 待开发 |

详细进展和待办项见 `docs/PROGRESS.md`。PRD 见 `docs/PRD.md`。技术架构见 `docs/ARCHITECTURE.md`。

## 目录结构
```
packages/client/src/
  main/                    # Electron 主进程
    index.ts                 窗口创建，平台特定配置
    database/schema.ts       SQLite 建表语句（20+ 张表）
    ipc/                     IPC handlers (pty, ssh, db, system, log, port-forward)
    services/db.ts           better-sqlite3 封装
    services/session-recorder.ts  asciicast v2 会话录制服务
  preload/index.ts         # contextBridge，暴露 ipc + platform
  renderer/                # Vue 渲染进程
    components/
      sidebar/AppSidebar.vue       主机列表、本地终端列表、五区域折叠持久化
      toolbar/AppToolbar.vue       分屏、广播、录制、搜索等工具按钮
      terminal/TerminalPane.vue    模块级终端池 + 分屏树渲染（核心文件）
      terminal/TerminalTabs.vue    标签栏（含OS图标、录制指示器）
      terminal/TerminalSearchBar.vue 终端内搜索栏
      terminal/TerminalConfigDialog.vue
      host/HostConfigDialog.vue
      snippet/SnippetEditDialog.vue         片段新建/编辑对话框
      snippet/SnippetVariableDialog.vue     片段变量填写对话框
      port-forward/PortForwardDialog.vue   端口转发配置对话框
      icons/Icon{MacOS,Windows,Linux}.vue  OS图标SVG组件
    composables/useIpc.ts          IPC 封装（invoke/on/off + 自动清理）
    stores/
      sessions.store.ts    标签页、分屏树、terminalInstances Map
      hosts.store.ts       主机 CRUD
      terminals.store.ts   本地终端配置 CRUD
      ui.store.ts          侧边栏宽度、对话框状态
      settings.store.ts    全局设置管理
      snippets.store.ts    命令片段管理（CRUD+分组+变量+拖拽排序）
      port-forwards.store.ts  端口转发规则+隧道状态+自动启动
      auth.store.ts        用户认证（当前 mock，P1 对接真实 API）
    views/
      workspace/WorkspaceView.vue  主工作区（KeepAlive 缓存）
      auth/LoginView.vue           登录页
      auth/RegisterView.vue        注册页
      settings/SettingsLayout.vue  设置页布局
      settings/*.vue               账户/终端/外观等设置子页
    styles/global.scss             全局主题变量
    i18n/                          国际化（zh-CN/en/zh-TW/ja）
  shared/types/            # 前后端共享类型定义
    terminal.ts    TabSession, SplitNode, TerminalInstance(含remoteOS/recording), LocalTerminalConfig
    host.ts        Host, HostGroup, Tag（Host 含 30+ 字段）
    ipc-channels.ts IPC 频道常量（180+ channel 定义，含 SSH.OS_DETECTED、LOG 全流程）
    settings.ts    设置类型
    snippet.ts     命令片段类型
    port-forward.ts 端口转发类型（PortForward, TunnelState）
  shared/utils/
    snippet-variables.ts 片段变量解析/替换工具
  shared/constants/
    defaults.ts    60+ 默认设置值

packages/server/src/
  index.ts                 服务器入口（HTTP + WebSocket + DB 迁移）
  app.ts                   Express 应用配置
  config.ts                环境变量配置
  routes/                  auth, user, sync, file 路由
  controllers/             对应控制器
  services/                auth(Argon2id), user, sync(乐观锁), email, oauth
  middleware/              JWT认证, 限流, zod校验, 错误处理
  websocket/               WebSocket 同步推送
  database/                SQLite 连接(WAL) + 迁移脚本
  validators/              Zod schema 定义
```

## 设计稿与组件映射
UI 设计稿 `untitled.pen` 共 16 屏（使用 pencil MCP 工具读取）：
| 设计稿 | 对应组件 |
|--------|---------|
| 01 主工作区 | WorkspaceView + AppSidebar + TerminalTabs + TerminalPane |
| 02 主机配置 | HostConfigDialog（Basic/Auth/SSH/Proxy/Appearance/Notes 6 Tab） |
| 03 SFTP | SftpPanel（待实现） |
| 04 快速连接 | QuickConnect + CommandPalette |
| 05 Snippets | SnippetEditDialog + SnippetVariableDialog + 侧边栏列表 |
| 06 端口转发 | PortForwardDialog + 侧边栏列表 + port-forward.handler 隧道服务 |
| 07-08 登录注册 | LoginView / RegisterView |
| 09-16 设置/管理 | SettingsLayout 下各子页面 |

## 核心架构

### 进程模型
| 进程 | 职责 |
|------|------|
| Main Process | 窗口管理、SSH/PTY 连接、SQLite 读写、SFTP、同步引擎、密钥管理、系统集成 |
| Renderer Process | Vue 3 UI、xterm.js 终端展示、通过 IPC 调用 Main Process |

数据流：`用户操作 → Vue Component → Pinia Store → IPC invoke → Main Process → SQLite/远程 → IPC reply → Store → UI`

### IPC Channel 划分
`ssh:*`（连接+OS检测）、`pty:*`（本地终端）、`sftp:*`（文件操作）、`db:*`（数据库 CRUD）、`port-forward:*`（隧道生命周期：start/stop/status）、`sync:*`（同步）、`vault:*`（凭据）、`key:*`（密钥）、`system:*`（系统操作）、`window:*`（窗口）、`log:*`（会话录制全流程）

### 终端池模式（TerminalPane.vue）
xterm 实例的生命周期独立于 Vue 组件树，通过**模块级** `<script lang="ts">` 中的 `terminalPool` Map 管理（非 `<script setup>`，确保跨实例共享）：
- 组件 mount：检查池→有则移动 DOM 元素；无则创建新终端
- 组件 unmount：检查 `terminalInstances.has(id)` 判断是分屏重组还是真正关闭
  - 分屏重组：DOM 移到 offscreen holder，PTY/SSH 保持连接
  - 真正关闭：disposePooledTerminal 彻底销毁（含停止录制）
- IPC 监听器直接用 `window.electronAPI.ipc`，不经过 useIpc（避免自动清理干扰）
- 主题变更时通过 `watch(uiStore.theme)` 遍历池中所有终端更新 `terminal.options.theme`
- `dirtyWhileHidden` 标记：隐藏 tab 接收数据时标记脏，切回时 force resize 修复 xterm viewport 滚动
- 广播模式：`broadcastInput()` 遍历当前 tab 所有终端发送输入

### 终端搜索
- `TerminalSearchBar.vue` 通过从 `TerminalPane.vue` 的 `<script lang="ts">` 导出的 `terminalFindNext/Previous/ClearSearch` 函数操作终端池中的 `SearchAddon`
- 搜索在当前活跃 tab 的所有分屏终端上执行

### 会话录制（session-recorder.ts）
- asciicast v2 格式（NDJSON：header + `[elapsed, "o", data]` 事件行）
- PTY/SSH data handler 中调用 `recordData()` 记录输出
- `stream.end()` 回调中更新文件大小到 DB，避免竞态
- `stopAllRecordings()` 先收集 keys 再逐个停止，带 try-catch 容错

### 远端 OS 检测
- SSH shell 就绪后通过 `conn.exec('uname')` 检测，带 5s 超时
- 结果通过 `IPC_SSH.OS_DETECTED` 事件发送到渲染进程
- `TerminalInstance.remoteOS` 存储检测结果，标签页图标据此显示对应 OS SVG

### 分屏树（SplitNode）
- 递归类型：`terminal`（叶子）| `split`（direction + ratio + children[2]）
- splitNodeInTree：原地修改中间节点，避免重建整棵树
- closeSplitPane：先删 terminalInstances 再改树，确保组件 unmount 走销毁路径

### 路由
- WorkspaceView 用 `<KeepAlive include="WorkspaceView">` 缓存
- 切换设置页时终端不销毁
- 路由：`/login`, `/register`, `/`(Workspace), `/settings/*`, 404→`/`

### 命令片段变量系统
- 解析器在 `shared/utils/snippet-variables.ts`：`parseVariables()` / `hasVariables()` / `replaceVariables()`
- 支持 4 种变量：`${name}`（文本）、`${name:default}`（带默认值）、`${name:A|B|C}`（下拉选择）、`${!name}`（密码）
- 内置变量 `${date}` / `${time}` / `${datetime}` / `${timestamp}` 执行时自动替换
- `SnippetVariableDialog.vue` 弹窗填写，实时预览替换后命令，密码变量用 `●` 遮蔽
- 非密码变量自动记忆上次填写的值（模块级缓存，跨对话框保持）
- 侧边栏双击片段执行：无变量直接发送，有变量弹填写对话框
- `sendCommandToTerminal()` 从 `TerminalPane.vue` 导出，用 `\r` 发送

### 端口转发隧道（port-forward.handler.ts）
- **Local 转发 (-L)**：`net.createServer()` 监听本地端口 → `sshClient.forwardOut()` 建立 SSH channel → 双向 pipe
- **Remote 转发 (-R)**：`sshClient.forwardIn()` 请求远程监听 → `tcp connection` 事件 → `net.createConnection()` 连接本地目标 → pipe
- SSH 连接策略：优先复用终端 SSH 连接（通过 connectionId），无终端时建立专用连接
- 隧道迁移：关闭终端时检查同主机其他活跃连接，自动迁移隧道而非停止
- 自动启动：`port-forwards.store` 监听 `IPC_SSH.STATUS` connected 事件，启动 `autoStart=true` 的规则
- SSH STATUS 事件携带 `hostId`（解决时序问题：connectionId 在 terminalInstances 中可能尚未设置）
- `SshSession` 接口增加了 `hostId` 字段，支持隧道迁移时按主机匹配
- `stopAllTunnels()` 在 `app.before-quit` 中调用，强制 destroy 所有 socket 释放端口
- 主机删除保护：侧边栏删除主机前检查 `portForwardsStore.rules`，有绑定规则时阻止并提示

### 默认终端配置
- `createTab()` 未指定 `configId` 时自动使用 `terminalsStore.getDefault()`
- 默认终端互斥：DB 层和 Store 层设置新默认时均先清除其他的 `is_default`

## 重要约定

### 主题
- 使用 Element Plus 官方 `dark/css-vars.css` + `html.dark` class + `html[data-theme]` 属性切换
- 自定义紫色调色板覆盖（`global.scss`），强调色 `#6366f1`
- 主题持久化到 SQLite `settings` 表（`key='app.theme'`），非 localStorage
- 不要在单个组件中设置全局 `--el-*` 变量，用 `html.dark` 选择器
- xterm 终端配色跟随应用主题动态切换（暗色背景 `#1a1b2e`，亮色背景 `#f8f9fc`）
- Windows 下 `titleBarOverlay` 颜色通过 IPC `window:set-title-bar-overlay` 跟随主题

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

### 后端 API
- 认证：`POST /api/v1/auth/register|login|logout|forgot-password|reset-password`，`GET verify-email`
- 用户：`GET|PATCH /api/v1/users/me`，`PUT /me/password`，`DELETE /me`
- 同步：`POST /api/v1/sync/push`，`GET /sync/pull`（游标分页）、`GET /sync/cursors`
- 同步机制：乐观锁（version+1），WebSocket 实时推送，Last-Write-Wins 冲突策略

## 开发命令
```bash
# 安装依赖
npm install

# 开发模式
npm run client:dev          # 或 cd packages/client && npm run dev

# 类型检查
cd packages/client && npm run typecheck   # vue-tsc --noEmit

# 生产构建（仅编译，不打安装包）
npm run client:build

# 打安装包（electron-builder）
npm run client:pack:mac     # macOS .dmg (arm64 + x64)
npm run client:pack:win     # Windows .exe (NSIS)
npm run client:pack:linux   # Linux .AppImage + .deb
npm run client:pack:all     # 三平台一起构建

# 安装包输出到 packages/client/release/
# 原生模块（node-pty、better-sqlite3、ssh2）通过 asarUnpack 解包
```

## P0 已知遗留问题
- `auth.store` 使用 mock（setTimeout 模拟），P1 需对接真实后端 API
- `CommandPalette` 仅有骨架组件
- `system.handler` 多数为骨架（shell列表、剪贴板等）
- 后端登录锁定参数不符 PRD（代码 10次/10分钟，PRD 要求 5次/15分钟）
- 后端缺少 `/sync/full`、`/sync/reset`、`/sync/encryption` 端点
