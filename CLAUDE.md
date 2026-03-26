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
| **P1 核心增强** | SFTP文件管理、命令片段、端口转发、设置完善、云同步对接 | 🔧 大部分完成（SFTP+片段+端口转发+设置+i18n+已知主机+云同步E2EE+同步引擎，剩OAuth客户端流程） |
| **P2 进阶功能** | SSH密钥管理、Vault密钥库、录制回放器、日志审计 | 🔧 部分完成（密钥管理+Vault+回放器已实现，剩日志审计） |
| **P3 体验优化** | 自动补全、命令面板完善、主题自定义、快捷键自定义、数据导入导出、自动更新 | 🔧 部分完成（数据管理+命令面板+主题选择器已实现，剩自动补全+快捷键自定义+自动更新） |

详细进展和待办项见 `docs/PROGRESS.md`。PRD 见 `docs/PRD.md`。技术架构见 `docs/ARCHITECTURE.md`。

## 目录结构
```
packages/client/src/
  main/                    # Electron 主进程
    index.ts                 窗口创建，平台特定配置
    database/schema.ts       SQLite 建表语句（20+ 张表）
    ipc/                     IPC handlers (pty, ssh, db, system, log, port-forward, sftp, local-fs, sync, key, vault)
    services/db.ts           better-sqlite3 封装
    services/session-recorder.ts  asciicast v2 会话录制服务
    services/crypto.ts       E2EE 加密（libsodium-wrappers-sumo，Argon2id 密钥派生 + XSalsa20-Poly1305）
    services/key-manager.ts  SSH 密钥生成服务（Ed25519/RSA/ECDSA，via ssh2 utils）
    services/vault-service.ts  Vault 密钥库服务（CRUD + 密码生成）
    services/sync-engine.ts  云同步引擎（push/pull/WebSocket 实时通知/自动周期同步）
    services/server-api.ts   主进程 HTTP 客户端（对接后端 REST API）
    services/server-url-service.ts  可配置服务器 URL 服务（SaaS/自托管双模式，读写 SQLite）
    services/ssh-config-parser.ts  解析 ~/.ssh/config，将 Host 块转换为 STerminal 主机记录
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
      sftp/SftpPanel.vue                   SFTP 双栏文件浏览器（根组件）
      sftp/SftpFileList.vue                文件列表（排序/多选/重命名/右键菜单）
      sftp/SftpPathBar.vue                 路径面包屑导航
      sftp/SftpToolbar.vue                 SFTP 工具栏
      sftp/SftpTransferQueue.vue           传输队列面板
      sftp/SftpFileEditor.vue              远程文件编辑器
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
      sftp.store.ts        SFTP 会话状态+传输队列（直接 IPC，非 useIpc）
      auth.store.ts        用户认证（真实后端 API，token 自动续期，restoreSession 网络错误保留本地登录态）
      sync.store.ts        云同步状态管理（SyncState/SyncStatus，触发同步、加密配置）
      keys.store.ts        SSH 密钥管理（CRUD，与 key.handler.ts 对接）
      vault.store.ts       Vault 密钥库管理（CRUD，与 vault.handler.ts 对接）
    views/
      workspace/WorkspaceView.vue  主工作区（KeepAlive 缓存）
      auth/LoginView.vue           登录页
      auth/RegisterView.vue        注册页
      settings/SettingsLayout.vue  设置页布局（8 项导航）
      settings/TerminalSettings.vue  终端设置（字体/光标/行为，实时预览）
      settings/AppearanceSettings.vue  外观设置（主题/语言/缩放/紧凑模式）
      settings/LogSettings.vue       日志设置（录制/清理/文件管理）
      settings/AccountSettings.vue   账户设置（骨架，等云同步）
      settings/KeysSettings.vue      SSH 密钥管理（列表/生成/导入/部署）
      settings/VaultSettings.vue     Vault 密钥库（条目CRUD/密码生成/复制自动清除）
      settings/DataSettings.vue      数据管理（OpenSSH config 导入/JSON 备份导出导入/清除本地数据/清除全部数据）
    styles/global.scss             全局主题变量 + 紧凑模式 CSS
    i18n/                          国际化（zh-CN/en/zh-TW，约 400 key/语言）
  shared/types/            # 前后端共享类型定义
    terminal.ts    TabSession, SplitNode, TerminalInstance(含remoteOS/recording), LocalTerminalConfig
    host.ts        Host, HostGroup, Tag（Host 含 30+ 字段）
    ipc-channels.ts IPC 频道常量（180+ channel 定义，含 SSH.OS_DETECTED、LOG 全流程）
    settings.ts    设置类型
    snippet.ts     命令片段类型
    port-forward.ts 端口转发类型（PortForward, TunnelState）
    sync.ts        云同步类型（SyncState, SyncStatus）
    key.ts         SSH 密钥类型（SshKey, KeyType, GenerateKeyOptions）
    vault.ts       Vault 条目类型（VaultEntry, VaultEntryType）
  shared/utils/
    snippet-variables.ts 片段变量解析/替换工具
    server-url.ts        服务器 URL 工具（normalizeServerUrl / deriveApiBase / deriveWsUrl）
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
`ssh:*`（连接+OS检测）、`pty:*`（本地终端）、`sftp:*`（文件操作）、`db:*`（数据库 CRUD）、`port-forward:*`（隧道生命周期：start/stop/status）、`sync:*`（start/stop/sync-now/status/status-changed/set-encryption/clear-encryption/has-encryption/get-salt/set-auto-interval）、`server:*`（get-url/set-url）、`vault:*`（凭据）、`key:*`（密钥）、`system:*`（系统操作）、`window:*`（窗口）、`log:*`（会话录制全流程）

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

### SFTP 文件管理（sftp.handler.ts + sftp.store.ts）
- SFTP 会话通过 `sshSessions.get(connectionId).client.sftp()` 创建，存入 `sftpSessions` Map
- `sftp:open` 返回 `sftpId` + `homePath`（通过 `sftp.realpath('.')` 获取远程 home）
- 递归目录操作：`collectRemoteFiles` / `collectLocalFiles` 收集文件列表，`mkdirpRemote` 递归创建远程目录
- 传输进度通过 `webContents.send(IPC_SFTP.TRANSFER_PROGRESS)` 推送，store 用直接 IPC 监听（非 useIpc，避免 listener 泄漏）
- `sftp.store.ts` 用 `reactive<Record>` 存 session 状态（非 Map，确保 Vue 响应式）
- Tab 集成：`TabSession.contentType: 'sftp'`，WorkspaceView 条件渲染 SftpPanel vs TerminalPane
- symlink 检测用 `(mode & 0o170000) === 0o120000`（POSIX 完整类型位掩码）
- `closeAllSftpSessions()` 在 app before-quit 中调用

### 设置系统
- 通用 KV 存储：`settings` 表 + `settings.store.ts`（`getSetting/setSetting`，自动回退 `DEFAULT_SETTINGS`）
- 响应式触发：`setSetting` 创建新 Map（`settings.value = new Map(...)`）以触发 Vue watch
- 终端设置实时预览：`TerminalPane` 的 `<script setup>` 中 watch `settingsStore.settings` 变化，更新所有 xterm options + fit
- 新终端从 `getXtermBaseOptions()` 读设置，不再硬编码
- 外观设置：缩放通过 `IPC_WINDOW.SET_ZOOM` → `webContents.setZoomFactor()`，紧凑模式通过 `html.compact` CSS class
- 日志设置：`session-recorder.ts` 每次录制时从 DB 读取格式/目录/模板/大小上限
- 自动录制：PTY spawn / SSH shell ready 后检查 `shouldAutoRecord()`，录制后渲染进程通过 `IPC_LOG.IS_RECORDING` 同步状态
- 自动清理：`autoCleanRecordings()` 在 app 启动时扫描过期录制文件
- 启动恢复：`App.vue` onMounted 恢复语言/缩放/紧凑模式

### 国际化 (i18n)
- 使用 vue-i18n Composition API 模式（`legacy: false`）
- CSP 需要 `unsafe-eval`（vue-i18n 运行时编译消息插值需要 `new Function()`）
- 3 个语言包：`zh-CN.json` / `en.json` / `zh-TW.json`，各约 400 个 key
- 所有组件通过 `const { t } = useI18n()` + `t('key')` 访问翻译
- 模块级代码（如 TerminalPane `<script lang="ts">`）无法用 `useI18n()`，少量文本保持硬编码
- 语言切换：`locale.value = lang` 即时生效 + `setSetting('app.language', lang)` 持久化

### 默认终端配置
- `createTab()` 未指定 `configId` 时自动使用 `terminalsStore.getDefault()`
- 默认终端互斥：DB 层和 Store 层设置新默认时均先清除其他的 `is_default`

### 云同步（sync-engine.ts）
- Push/pull 采用乐观锁（version+1），Last-Write-Wins 冲突策略
- WebSocket 实时通知：服务端推送变更后自动触发 pull
- 周期自动同步：可配置间隔（`sync:set-auto-interval`），默认 5 分钟
- E2EE 加密敏感字段：`password_enc`、`key_passphrase_enc`、`proxy_password_enc`、vault 条目密码字段 在推送前加密、拉取后解密
- 同步表范围：hosts, host_groups, local_terminals, snippets, port_forwards, settings, keys, vault_entries
- 同步状态通过 `sync:status-changed` IPC 事件推送到渲染进程，`sync.store.ts` 维护 `SyncState`
- `sync_deletes` 表追踪删除操作，`sync_meta` 表存储设备 ID 和最后同步时间戳

### E2EE（crypto.ts）
- 依赖 `libsodium-wrappers-sumo`（WebAssembly，sumo 版包含完整 Argon2id 支持）
- 密钥派生：Argon2id（`crypto_pwhash`），salt 存储在 `sync_meta` 表，密钥仅保留在内存
- 加密算法：XSalsa20-Poly1305（`crypto_secretbox`）
- 通过 `sync:set-encryption` / `sync:clear-encryption` / `sync:has-encryption` IPC 管理

### SSH 密钥管理（key-manager.ts + key.handler.ts）
- 密钥生成：通过 ssh2 的 `utils.generateKeyPair()` 生成 Ed25519 / RSA / ECDSA 密钥对，支持可选密码保护
- 密钥导入：接受 PEM 文件路径或粘贴的 PEM 文本，自动检测密钥格式
- 公钥操作：复制公钥到剪贴板；生成 `ssh-copy-id` 等效部署命令供用户复制
- 部署到远程：通过 SSH 连接追加公钥到目标主机 `~/.ssh/authorized_keys`
- 主机配置集成：`HostConfigDialog.vue` 的 SSH 认证方式下拉列表从 `keys.store.ts` 动态读取
- 同步：`keys` 表纳入云同步范围，私钥内容作为敏感字段在 E2EE 加密后传输

### Vault 密钥库（vault-service.ts + vault.handler.ts）
- 无主密码设计：简化架构，不需要额外的 Vault 解锁步骤，依赖系统账户安全和 E2EE 保护
- 条目类型：`password`（登录凭据）/ `api_key`（API 密钥）/ `token`（访问令牌），含名称/用户名/密码/备注/关联主机
- 密码生成器：可配置长度（8-128）和字符集（大写/小写/数字/特殊字符）
- 复制保护：复制密码到剪贴板后 30 秒自动清除剪贴板内容
- 主机配置集成：`HostConfigDialog.vue` 的密码字段可从 Vault 条目选择自动填充
- 同步：`vault_entries` 表纳入云同步范围，密码字段（`password_enc`）在 E2EE 加密后传输

### 数据管理（ssh-config-parser.ts + DataSettings.vue）
- OpenSSH config 导入：`ssh-config-parser.ts` 解析 `~/.ssh/config` 的 Host 块，映射 HostName/User/Port/IdentityFile 等字段到 STerminal Host 类型；`DataSettings.vue` 提供文件选择、解析预览、确认批量导入流程
- STerminal JSON 导出：将主机（含分组）、命令片段、设置序列化为带时间戳的 JSON 文件，通过 `system:save-file` IPC 触发系统另存对话框
- STerminal JSON 导入：从 JSON 备份文件恢复数据，支持合并（保留现有）或覆盖两种模式
- 清除本地数据：通过 `db:clear-local-data` IPC 清空本地 SQLite 中的业务数据（主机/片段/设置等），保留登录态
- 清除全部数据：清除本地数据后通过 `sync:clear-cloud-data` IPC 通知服务端删除该设备的同步数据

### 可配置服务器 URL
- SaaS 模式（默认）与自托管双模式
- 渲染进程通过 `server:get-url` / `server:set-url` IPC 读写；主进程由 `server-url-service.ts` 持久化到 SQLite
- 登录页提供服务器设置入口
- 共享工具函数：`normalizeServerUrl`（补全协议/路径）、`deriveApiBase`（推导 REST base URL）、`deriveWsUrl`（推导 WebSocket URL）

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
- `sync_deletes` 表：追踪已删除记录（table_name + record_id + deleted_at + version）
- `sync_meta` 表：存储设备 ID（deviceId）和最后同步时间戳（lastSyncAt）、E2EE salt

### 后端 API
- 认证：`POST /api/v1/auth/register|login|logout|forgot-password|reset-password`，`GET verify-email`
- 用户：`GET|PATCH /api/v1/users/me`，`PUT /me/password`，`DELETE /me`
- 同步：`POST /api/v1/sync/push`，`GET /sync/pull`（游标分页）、`GET /sync/cursors`
- 同步机制：乐观锁（version+1），WebSocket 实时推送，Last-Write-Wins 冲突策略
- `auth.store` 已对接真实后端：token 在 `GET /user/me` 时自动续期；`restoreSession` 仅在收到 401/403 时清除登录态，网络错误时保留本地状态

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

# 后端服务（PM2）
cd packages/server && npm run pm2:start   # 使用 ecosystem.config.cjs 启动
```

## P1 已知遗留问题
- `system.handler` 多数为骨架（shell列表、剪贴板等）
- 后端登录锁定参数不符 PRD（代码 10次/10分钟，PRD 要求 5次/15分钟）
- 后端缺少 `/sync/full`、`/sync/reset`、`/sync/encryption` 端点
- OAuth 客户端流程（GitHub/Google 社交登录）尚未实现

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.
Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse,
/qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /retro,
/investigate, /document-release, /codex, /cso, /autoplan, /careful, /freeze, /guard,
/unfreeze, /gstack-upgrade.