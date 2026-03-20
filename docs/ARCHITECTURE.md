# STerminal 系统架构设计文档

> 版本: 1.0 | 日期: 2026-03-20
> 基于 PRD v1.0 及 UI 设计稿 (untitled.pen 16 屏)

---

## 目录

1. [技术选型](#1-技术选型)
2. [系统整体架构](#2-系统整体架构)
3. [前端架构](#3-前端架构)
4. [后端架构](#4-后端架构)
5. [数据库设计](#5-数据库设计)
6. [API 接口设计](#6-api-接口设计)
7. [云同步协议](#7-云同步协议)
8. [安全架构](#8-安全架构)
9. [部署架构](#9-部署架构)

---

## 1. 技术选型

### 1.1 前端（桌面客户端）

| 层面 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 桌面框架 | Electron | 33.x | 跨平台桌面应用框架 |
| UI 框架 | Vue 3 | 3.5+ | Composition API + `<script setup>` |
| 组件库 | Element Plus | 2.x | 基于 Vue 3 的企业级组件库 |
| 状态管理 | Pinia | 2.x | Vue 官方推荐状态管理 |
| 路由 | Vue Router | 4.x | 客户端内页面/视图切换 |
| 终端渲染 | xterm.js | 5.x | 终端仿真核心 |
| SSH 协议 | ssh2 | 1.x | Node.js SSH2 客户端库 |
| SFTP | ssh2-sftp-client | 基于 ssh2 | SFTP 操作封装 |
| 本地数据库 | better-sqlite3 | 11.x | 客户端本地 SQLite |
| 加密 | libsodium-wrappers | 0.7+ | 端到端加密（E2EE） |
| 国际化 | vue-i18n | 9.x | 多语言支持 |
| 构建 | Vite | 6.x | 前端构建工具 |
| 样式 | SCSS + CSS Variables | - | 主题系统基础 |
| 进程通信 | Electron IPC | - | 主进程/渲染进程通信 |

### 1.2 后端（同步服务）

| 层面 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Node.js | 20 LTS | 服务端运行环境 |
| 框架 | Express | 4.x | HTTP API 框架 |
| 数据库 | SQLite (better-sqlite3) | 11.x | 轻量数据存储（单机部署足够） |
| ORM | Knex.js | 3.x | SQL 查询构建器 + 迁移管理 |
| 认证 | jsonwebtoken + passport | - | JWT Token + OAuth 策略 |
| 密码哈希 | argon2 | 0.40+ | Argon2id 密码哈希 |
| 实时通信 | ws | 8.x | WebSocket 同步推送 |
| 邮件 | nodemailer | 6.x | 验证邮件/密码重置邮件 |
| 文件存储 | 本地磁盘 / S3 兼容 | - | 头像等文件存储 |
| 日志 | pino | 8.x | 结构化日志 |
| 校验 | zod | 3.x | 请求参数校验 |
| 限流 | express-rate-limit | 7.x | API 限流保护 |

---

## 2. 系统整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    STerminal 桌面客户端                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    Renderer Process (Vue 3)                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │ │
│  │  │ Terminal  │ │  SFTP    │ │ Settings │ │   Auth UI    │ │ │
│  │  │  Views   │ │  Views   │ │  Views   │ │   Views      │ │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │ │
│  │       │             │            │               │         │ │
│  │  ┌────┴─────────────┴────────────┴───────────────┴──────┐ │ │
│  │  │              Pinia Store Layer                        │ │ │
│  │  │  hosts | terminals | snippets | vault | settings ... │ │ │
│  │  └──────────────────────┬───────────────────────────────┘ │ │
│  └─────────────────────────┼─────────────────────────────────┘ │
│                             │ IPC Bridge                        │
│  ┌─────────────────────────┼─────────────────────────────────┐ │
│  │                  Main Process (Node.js)                    │ │
│  │  ┌──────────┐ ┌────────┴───┐ ┌──────────┐ ┌───────────┐ │ │
│  │  │ SSH/PTY  │ │  Local DB  │ │  Sync    │ │  System   │ │ │
│  │  │ Manager  │ │  (SQLite)  │ │  Engine  │ │  Integr.  │ │ │
│  │  └──────────┘ └────────────┘ └────┬─────┘ └───────────┘ │ │
│  └───────────────────────────────────┼───────────────────────┘ │
└──────────────────────────────────────┼─────────────────────────┘
                                       │ HTTPS + WSS
                              ┌────────┴────────┐
                              │  同步服务后端     │
                              │  Express + SQLite │
                              │  + WebSocket      │
                              └─────────────────┘
```

### 2.1 进程模型

| 进程 | 职责 |
|------|------|
| **Main Process** | 窗口管理、系统托盘、SSH/PTY 连接管理、本地 SQLite 读写、SFTP 操作、同步引擎、密钥管理、系统集成（URI Scheme / CLI / 自动更新） |
| **Renderer Process** | Vue 3 UI 渲染、用户交互、xterm.js 终端展示、通过 IPC 调用 Main Process 能力 |
| **Sync Worker** | 后台同步线程（Main Process 中的 Worker），负责与服务端的 WebSocket 连接和数据同步 |

### 2.2 IPC 通信架构

Main Process 与 Renderer Process 通过 Electron IPC 通信，按领域划分 Channel：

| Channel 前缀 | 说明 |
|--------------|------|
| `ssh:*` | SSH 连接生命周期（connect / disconnect / data / resize） |
| `pty:*` | 本地终端 PTY（spawn / data / resize / kill） |
| `sftp:*` | SFTP 文件操作（ls / upload / download / mkdir / rm ...） |
| `db:*` | 本地数据库 CRUD |
| `sync:*` | 同步状态与控制 |
| `vault:*` | Vault 加解密操作 |
| `key:*` | SSH 密钥管理 |
| `system:*` | 系统操作（托盘 / 更新 / 深度链接 / 剪贴板） |
| `window:*` | 窗口管理（新窗口 / 合并 / 全屏） |
| `log:*` | 会话日志录制控制 |

---

## 3. 前端架构

### 3.1 项目目录结构

```
src/
├── main/                          # Electron Main Process
│   ├── index.ts                   # 入口，创建窗口，平台适配
│   ├── ipc/                       # IPC Handler 注册
│   │   ├── index.ts               # registerAllHandlers 汇总
│   │   ├── ssh.handler.ts         # ✅ SSH 连接（connect/data/resize/disconnect）
│   │   ├── pty.handler.ts         # ✅ 本地 PTY（spawn/data/resize/kill）
│   │   ├── db.handler.ts          # ✅ 数据库 CRUD
│   │   ├── system.handler.ts      # ✅ 系统操作
│   │   ├── sftp.handler.ts        # 🔲 待实现
│   │   ├── sync.handler.ts        # 🔲 待实现
│   │   ├── vault.handler.ts       # 🔲 待实现
│   │   ├── key.handler.ts         # 🔲 待实现
│   │   ├── window.handler.ts      # 🔲 待实现
│   │   └── log.handler.ts         # 🔲 待实现
│   ├── services/                  # 主进程核心服务
│   │   ├── db.ts                  # ✅ SQLite 数据库访问层
│   │   ├── ssh-manager.ts         # 🔲 SSH 连接池管理
│   │   ├── pty-manager.ts         # 🔲 本地 PTY 进程管理
│   │   ├── sftp-manager.ts        # 🔲 SFTP 会话管理
│   │   ├── sync-engine.ts         # 🔲 同步引擎
│   │   ├── crypto.ts              # 🔲 加密/解密工具
│   │   ├── vault-service.ts       # 🔲 Vault 服务
│   │   ├── key-manager.ts         # 🔲 SSH 密钥管理
│   │   ├── ssh-agent.ts           # 🔲 内置 SSH Agent
│   │   ├── known-hosts.ts         # 🔲 Known Hosts 管理
│   │   ├── logger.ts              # 🔲 会话日志录制
│   │   ├── auto-complete.ts       # 🔲 命令补全引擎
│   │   ├── backup.ts              # 🔲 备份/恢复
│   │   ├── updater.ts             # 🔲 自动更新
│   │   └── tray.ts                # 系统托盘
│   ├── database/
│   │   ├── migrations/            # 数据库迁移脚本
│   │   └── schema.ts              # 建表 SQL
│   └── utils/
│       ├── platform.ts            # 平台检测工具
│       └── paths.ts               # 应用路径常量
│
├── renderer/                      # Vue 3 Renderer Process
│   ├── App.vue
│   ├── main.ts                    # Vue 入口
│   ├── router/
│   │   └── index.ts
│   ├── stores/                    # Pinia Stores
│   │   ├── auth.store.ts          # ✅ 登录/注册/OAuth 状态
│   │   ├── hosts.store.ts         # ✅ 主机列表/分组/标签
│   │   ├── terminals.store.ts     # ✅ 本地终端配置
│   │   ├── sessions.store.ts      # ✅ 活跃终端会话（标签页/分屏/终端池）
│   │   ├── snippets.store.ts      # ✅ 命令片段
│   │   ├── settings.store.ts      # ✅ 全局设置
│   │   ├── ui.store.ts            # ✅ UI 状态（侧边栏/主题/布局）
│   │   ├── port-forward.store.ts  # 🔲 端口转发规则
│   │   ├── vault.store.ts         # 🔲 Vault 凭据
│   │   ├── keys.store.ts          # 🔲 SSH 密钥
│   │   ├── known-hosts.store.ts   # 🔲 已知主机
│   │   ├── sync.store.ts          # 🔲 同步状态
│   │   ├── logs.store.ts          # 🔲 日志管理
│   │   └── transfer.store.ts      # 🔲 SFTP 传输队列
│   ├── views/                     # 页面级组件
│   │   ├── workspace/             # 01-主工作区
│   │   │   └── WorkspaceView.vue
│   │   ├── auth/                  # 07/08-登录注册
│   │   │   ├── LoginView.vue
│   │   │   └── RegisterView.vue
│   │   └── settings/              # 09-16 设置/管理页
│   │       ├── SettingsLayout.vue
│   │       ├── AccountSettings.vue
│   │       ├── TerminalSettings.vue
│   │       ├── AppearanceSettings.vue
│   │       ├── KeyManagement.vue
│   │       ├── KnownHosts.vue
│   │       ├── VaultManagement.vue
│   │       ├── LogsAudit.vue
│   │       └── DataManagement.vue
│   ├── components/                # 可复用组件
│   │   ├── sidebar/               # 侧边栏相关
│   │   │   └── AppSidebar.vue     # ✅ 主机列表+本地终端+分组（合一组件）
│   │   ├── terminal/              # 终端相关
│   │   │   ├── TerminalTabs.vue   # ✅ 标签栏（滚动/重命名/固定）
│   │   │   ├── TerminalPane.vue   # ✅ 终端池+分屏树+关闭按钮（核心）
│   │   │   ├── TerminalConfigDialog.vue  # ✅ 本地终端配置弹窗
│   │   │   ├── TerminalSearch.vue # 🔲 待实现
│   │   │   └── BroadcastIndicator.vue    # 🔲 待实现
│   │   ├── host/                  # 主机相关
│   │   │   └── HostConfigDialog.vue  # ✅ 主机配置弹窗
│   │   ├── common/                # 通用组件
│   │   │   └── CommandPalette.vue # ✅ 命令面板
│   │   └── toolbar/
│   │       └── AppToolbar.vue     # ✅ 工具栏（分屏/平台适配）
│   ├── composables/               # Vue Composables
│   │   ├── useIpc.ts              # ✅ IPC 调用封装（invoke/on/off + 自动清理）
│   │   ├── useTerminal.ts         # 🔲 xterm.js 实例管理
│   │   ├── useSsh.ts              # 🔲 SSH 连接生命周期
│   │   ├── useSftp.ts             # 🔲 SFTP 操作
│   │   ├── useShortcuts.ts        # 🔲 快捷键注册
│   │   ├── useTheme.ts            # 🔲 主题切换
│   │   ├── useDragSort.ts         # 拖拽排序
│   │   └── usePing.ts             # 主机 Ping 检测
│   ├── themes/                    # 终端主题定义
│   │   ├── index.ts
│   │   ├── sterminal-dark.ts
│   │   ├── sterminal-light.ts
│   │   ├── monokai.ts
│   │   ├── dracula.ts
│   │   └── ...                    # 其余 14 个内置主题
│   ├── i18n/                      # 国际化
│   │   ├── index.ts
│   │   ├── zh-CN.json
│   │   ├── zh-TW.json
│   │   ├── en.json
│   │   └── ja.json
│   └── styles/
│       ├── variables.scss         # CSS 变量（主题 token）
│       ├── global.scss
│       └── element-overrides.scss # Element Plus 样式覆盖
│
├── shared/                        # 主进程与渲染进程共享
│   ├── types/                     # TypeScript 类型定义
│   │   ├── host.ts
│   │   ├── terminal.ts
│   │   ├── snippet.ts
│   │   ├── port-forward.ts
│   │   ├── vault.ts
│   │   ├── key.ts
│   │   ├── settings.ts
│   │   ├── sync.ts
│   │   └── ipc-channels.ts       # IPC Channel 常量
│   ├── constants/
│   │   ├── defaults.ts            # 各配置项默认值
│   │   └── enums.ts               # 枚举值
│   └── utils/
│       ├── ssh-config-parser.ts   # OpenSSH config 解析
│       ├── csv-parser.ts          # CSV 导入导出
│       └── validators.ts          # 共享校验逻辑
│
├── preload/
│   └── index.ts                   # contextBridge API 暴露
│
└── cli/                           # CLI 工具
    └── index.ts                   # sterminal 命令行入口
```

### 3.2 视图与设计稿映射

| 设计稿编号 | 设计稿名称 | 前端视图/组件 |
|-----------|-----------|-------------|
| 01 | Main App - Terminal Workspace | `WorkspaceView.vue` + `AppSidebar.vue` + `TerminalTabs.vue` + `SplitContainer.vue` |
| 02 | Host Configuration Dialog | `HostConfigDialog.vue`（6 个 Tab：Basic / Auth / SSH / Proxy / Appearance / Notes） |
| 03 | SFTP File Manager | `SftpPanel.vue` + `DirTree.vue` + `FileList.vue` + `TransferQueue.vue` |
| 04 | Quick Connect & Command Palette | `QuickConnect.vue` + `CommandPalette.vue` |
| 05 | Snippets Manager | `SnippetPanel.vue` + `SnippetEditor.vue` |
| 06 | Port Forwarding | `PortForwardPanel.vue`（列表 + 创建表单） |
| 07 | Login Screen | `LoginView.vue` |
| 08 | Register Screen | `RegisterView.vue` |
| 09 | Settings - Account & Sync | `AccountSettings.vue` |
| 10 | Settings - Terminal | `TerminalSettings.vue` |
| 11 | Settings - Appearance & Keys | `AppearanceSettings.vue` |
| 12 | SSH Key Management | `KeyManagement.vue` |
| 13 | Known Hosts | `KnownHosts.vue` |
| 14 | Vault Management | `VaultManagement.vue` |
| 15 | Logs & Audit | `LogsAudit.vue` |
| 16 | Data Management & Update | `DataManagement.vue` |

### 3.3 核心数据流

```
用户操作 → Vue Component → Pinia Store → IPC invoke → Main Process Service
                                                            │
                                                     ┌──────┴──────┐
                                                     │             │
                                                Local SQLite    远程同步
                                                     │          (如已登录)
                                                     ▼
                                              IPC reply → Store 更新 → UI 响应式更新
```

### 3.4 终端会话模型

```typescript
// 标签页内的分屏使用树形结构
interface TabSession {
  id: string;
  label: string;
  color?: string;
  pinned: boolean;
  root: SplitNode;           // 分屏树根节点
}

type SplitNode =
  | { type: 'terminal'; terminalId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical';
      ratio: number; children: [SplitNode, SplitNode] };

interface TerminalInstance {
  id: string;
  type: 'local' | 'ssh';
  // local 类型
  localConfigId?: string;    // 关联的本地终端配置 ID
  shell?: string;
  cwd?: string;
  // ssh 类型
  hostId?: string;           // 关联的主机配置 ID
  sshConnectionId?: string;  // Main Process 中的 SSH 连接 ID
  // 共享
  xtermInstance?: Terminal;   // xterm.js 实例（仅 Renderer 侧）
  recording: boolean;
}
```

### 3.5 终端池模式（Terminal Pool）

xterm.js 实例的生命周期独立于 Vue 组件树，通过模块级 `terminalPool` Map 管理，解决分屏重组和路由切换时终端被销毁的问题：

```
terminalPool: Map<terminalId, PooledTerminal>

PooledTerminal {
  xterm: Terminal          // xterm.js 实例
  fitAddon: FitAddon       // 自适应插件
  container: HTMLElement   // 终端 DOM 容器
  ipcCleanup: Function     // IPC 监听器清理函数
}
```

**生命周期：**
- **组件 mount**：检查 pool → 有则移动 DOM 元素到当前位置；无则创建新终端并连接 PTY/SSH
- **组件 unmount**：检查 `terminalInstances.has(id)` 判断操作类型
  - `true` = 分屏重组 → DOM 移到 offscreen holder，PTY/SSH 保持连接
  - `false` = 真正关闭 → `disposePooledTerminal()` 彻底销毁
- **closeSplitPane 顺序**：先从 `terminalInstances` 删除，再修改分屏树，确保 unmount 走销毁路径
- IPC 监听器直接用 `window.electronAPI.ipc`，不经过 useIpc（避免自动清理干扰）

### 3.6 打包构建

使用 electron-builder 构建三平台安装包：

| 平台 | 格式 | 架构 | 命令 |
|------|------|------|------|
| macOS | .dmg | arm64 + x64 | `npm run client:pack:mac` |
| Windows | .exe (NSIS) | x64 | `npm run client:pack:win` |
| Linux | .AppImage + .deb | x64 | `npm run client:pack:linux` |

配置文件：`packages/client/electron-builder.yml`

原生模块（node-pty、better-sqlite3、ssh2）通过 `asarUnpack` 解包到 asar 外部，确保运行时正常加载。macOS 需要 `entitlements.mac.plist` 授权 JIT 和网络访问。

### 3.7 主题系统

```scss
// CSS 变量驱动，暗色/亮色通过切换 html class 实现
// 配合 Element Plus 的 dark/css-vars.css
html.dark {
  --bg-primary:   #1a1b2e;
  --bg-surface:   #232438;
  --bg-inset:     #16172a;
  --bg-hover:     #2a2b40;
  --bg-input:     #1e1f34;
  --text-primary: #e4e4e8;
  --text-secondary: #8b8d9e;
  --text-tertiary:  #5c5e72;
  --accent:       #6366f1;
  --border:       #2e3048;
  --divider:      #262840;
  --warning:      #f59e0b;
  --error:        #ef4444;
  --success:      #22c55e;
}

:root[data-theme="light"] {
  --bg-primary:   #ffffff;
  --bg-surface:   #f8f9fa;
  // ...
}
```

终端配色主题与应用 UI 主题独立，终端主题仅影响 xterm.js 的 `ITheme` 配置。

---

## 4. 后端架构

### 4.1 项目目录结构

```
server/
├── src/
│   ├── index.ts                   # 入口，启动 Express + WebSocket
│   ├── app.ts                     # Express 应用配置
│   ├── config.ts                  # 环境变量配置
│   ├── routes/                    # 路由定义
│   │   ├── auth.routes.ts         # 认证相关
│   │   ├── user.routes.ts         # 用户管理
│   │   ├── sync.routes.ts         # 数据同步
│   │   └── file.routes.ts         # 头像上传等
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── user.controller.ts
│   │   ├── sync.controller.ts
│   │   └── file.controller.ts
│   ├── services/
│   │   ├── auth.service.ts        # 注册/登录/OAuth/Token
│   │   ├── user.service.ts        # 用户 CRUD
│   │   ├── sync.service.ts        # 同步数据存取
│   │   ├── email.service.ts       # 邮件发送
│   │   └── oauth.service.ts       # GitHub/Google OAuth
│   ├── middleware/
│   │   ├── auth.middleware.ts     # JWT 验证
│   │   ├── rate-limit.ts          # 限流
│   │   ├── validate.ts            # zod 参数校验
│   │   └── error-handler.ts       # 全局错误处理
│   ├── websocket/
│   │   ├── ws-server.ts           # WebSocket 服务
│   │   └── sync-handler.ts        # 同步消息处理
│   ├── database/
│   │   ├── connection.ts          # SQLite 连接
│   │   ├── migrations/            # 迁移脚本
│   │   └── schema.sql
│   ├── validators/                # Zod Schema 定义
│   │   ├── auth.schema.ts
│   │   ├── user.schema.ts
│   │   └── sync.schema.ts
│   └── utils/
│       ├── jwt.ts
│       ├── hash.ts                # Argon2id 封装
│       └── logger.ts
├── uploads/                       # 文件上传目录
├── data/                          # SQLite 数据库文件
├── package.json
└── tsconfig.json
```

### 4.2 中间件链

```
请求 → CORS → Rate Limiter → Body Parser → Auth Middleware → Validate → Controller → Response
                                                                            │
                                                                     Error Handler
```

---

## 5. 数据库设计

### 5.1 后端数据库（服务端 SQLite）

```sql
-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE users (
    id              TEXT PRIMARY KEY,               -- UUID v4
    username        TEXT NOT NULL UNIQUE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,                   -- Argon2id
    avatar_url      TEXT,
    email_verified  INTEGER NOT NULL DEFAULT 0,      -- 0/1
    verify_token    TEXT,
    verify_expires  TEXT,                             -- ISO 8601
    oauth_provider  TEXT,                             -- 'github' | 'google' | NULL
    oauth_id        TEXT,
    encryption_salt TEXT,                             -- 端到端加密盐值（用户首次设置）
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_users_oauth ON users(oauth_provider, oauth_id)
    WHERE oauth_provider IS NOT NULL;

-- ============================================================
-- 会话 / Token 表
-- ============================================================
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,                   -- SHA256(JWT)
    device_name     TEXT,
    ip_address      TEXT,
    remember        INTEGER NOT NULL DEFAULT 1,
    expires_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ============================================================
-- 密码重置表
-- ============================================================
CREATE TABLE password_resets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,
    expires_at      TEXT NOT NULL,
    used            INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- 登录失败记录（限流锁定用）
-- ============================================================
CREATE TABLE login_attempts (
    id              TEXT PRIMARY KEY,
    email           TEXT NOT NULL,
    ip_address      TEXT,
    success         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email, created_at);

-- ============================================================
-- 同步数据存储（所有同步数据的统一存储）
-- ============================================================
CREATE TABLE sync_entities (
    id              TEXT NOT NULL,                   -- 实体 UUID
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,                   -- 'host'|'host_group'|'local_terminal'|'snippet'|'snippet_group'|'port_forward'|'key'|'known_host'|'vault_entry'|'tag'|'settings'|'terminal_theme'
    data            TEXT NOT NULL,                   -- JSON (敏感字段已由客户端 E2EE 加密)
    version         INTEGER NOT NULL DEFAULT 1,      -- 乐观锁版本号
    deleted         INTEGER NOT NULL DEFAULT 0,      -- 软删除
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, entity_type, id)
);

CREATE INDEX idx_sync_entities_updated ON sync_entities(user_id, updated_at);
CREATE INDEX idx_sync_entities_type ON sync_entities(user_id, entity_type);

-- ============================================================
-- 同步版本游标（每个用户每个设备的同步位点）
-- ============================================================
CREATE TABLE sync_cursors (
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id       TEXT NOT NULL,
    last_sync_at    TEXT NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    PRIMARY KEY (user_id, device_id)
);
```

### 5.2 客户端本地数据库（桌面端 SQLite）

```sql
-- ============================================================
-- 主机配置
-- ============================================================
CREATE TABLE hosts (
    id              TEXT PRIMARY KEY,
    label           TEXT,                            -- 别名
    address         TEXT NOT NULL,
    port            INTEGER NOT NULL DEFAULT 22,
    protocol        TEXT NOT NULL DEFAULT 'ssh',     -- ssh | mosh | telnet
    -- 认证
    username        TEXT,
    auth_type       TEXT DEFAULT 'password',         -- password | key | password_key | agent | keyboard
    password_enc    TEXT,                            -- AES-256-GCM 加密
    key_id          TEXT REFERENCES keys(id),
    key_passphrase_enc TEXT,
    -- SSH 高级
    startup_command TEXT,
    environment     TEXT,                            -- JSON: {"KEY": "VALUE"}
    encoding        TEXT DEFAULT 'UTF-8',
    keepalive_interval INTEGER DEFAULT 60,
    connect_timeout INTEGER DEFAULT 30,
    heartbeat_timeout INTEGER DEFAULT 15,
    compression     INTEGER DEFAULT 0,
    strict_host_key INTEGER DEFAULT 1,
    ssh_version     TEXT DEFAULT 'auto',
    preferred_kex   TEXT,
    preferred_cipher TEXT,
    preferred_mac   TEXT,
    preferred_host_key_algo TEXT,
    -- 代理
    proxy_jump_id   TEXT REFERENCES hosts(id),
    proxy_command   TEXT,
    socks_proxy     TEXT,
    http_proxy      TEXT,
    proxy_username  TEXT,
    proxy_password_enc TEXT,
    -- 外观覆盖
    terminal_theme  TEXT,                            -- NULL = 跟随全局
    font_family     TEXT,
    font_size       INTEGER,
    cursor_style    TEXT,
    cursor_blink    INTEGER,
    -- 元数据
    notes           TEXT,
    group_id        TEXT REFERENCES host_groups(id),
    sort_order      INTEGER DEFAULT 0,
    last_connected  TEXT,
    connect_count   INTEGER DEFAULT 0,
    -- 同步
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 主机分组
-- ============================================================
CREATE TABLE host_groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES host_groups(id),
    icon            TEXT,
    color           TEXT,
    sort_order      INTEGER DEFAULT 0,
    collapsed       INTEGER DEFAULT 0,              -- 折叠状态（仅本地）
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 标签
-- ============================================================
CREATE TABLE tags (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#6366f1',
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE host_tags (
    host_id         TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (host_id, tag_id)
);

-- ============================================================
-- 本地终端配置
-- ============================================================
CREATE TABLE local_terminals (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL DEFAULT '本地终端',
    icon            TEXT,
    color           TEXT,
    shell           TEXT,                            -- 为空则使用系统默认
    shell_args      TEXT,                            -- JSON: ["--login"]
    cwd             TEXT,                            -- 默认工作路径
    startup_script  TEXT,                            -- 多行启动脚本
    startup_command TEXT,                            -- 单行启动命令（与脚本二选一）
    script_line_delay INTEGER DEFAULT 100,           -- 行间延迟 ms
    environment     TEXT,                            -- JSON: {"KEY": "VALUE"}
    login_shell     INTEGER DEFAULT 0,
    -- 外观覆盖
    terminal_theme  TEXT,
    font_family     TEXT,
    font_size       INTEGER,
    cursor_style    TEXT,
    cursor_blink    INTEGER,
    -- 元数据
    group_id        TEXT REFERENCES local_terminal_groups(id),
    sort_order      INTEGER DEFAULT 0,
    is_default      INTEGER DEFAULT 0,              -- 是否为默认终端
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE local_terminal_groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES local_terminal_groups(id),
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SSH 密钥
-- ============================================================
CREATE TABLE keys (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    key_type        TEXT NOT NULL,                   -- rsa | ed25519 | ecdsa
    bits            INTEGER,                         -- RSA: 2048/3072/4096
    curve           TEXT,                            -- ECDSA: nistp256/384/521
    fingerprint     TEXT NOT NULL,                   -- SHA256 指纹
    public_key      TEXT NOT NULL,
    private_key_enc TEXT NOT NULL,                   -- AES-256-GCM 加密的私钥
    passphrase_enc  TEXT,                            -- 加密的密钥口令
    comment         TEXT,
    auto_load_agent INTEGER DEFAULT 0,               -- 是否自动加载到 Agent
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 已知主机
-- ============================================================
CREATE TABLE known_hosts (
    id              TEXT PRIMARY KEY,
    host            TEXT NOT NULL,
    port            INTEGER NOT NULL DEFAULT 22,
    key_type        TEXT NOT NULL,
    fingerprint     TEXT NOT NULL,
    public_key      TEXT NOT NULL,
    first_seen      TEXT DEFAULT (datetime('now')),
    last_seen       TEXT DEFAULT (datetime('now')),
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_known_hosts_unique ON known_hosts(host, port, key_type);

-- ============================================================
-- 命令片段
-- ============================================================
CREATE TABLE snippets (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    content         TEXT NOT NULL,
    description     TEXT,
    group_id        TEXT REFERENCES snippet_groups(id),
    sort_order      INTEGER DEFAULT 0,
    use_count       INTEGER DEFAULT 0,
    last_used_at    TEXT,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE snippet_tags (
    snippet_id      TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    PRIMARY KEY (snippet_id, tag)
);

CREATE TABLE snippet_groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES snippet_groups(id),
    color           TEXT,
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 端口转发
-- ============================================================
CREATE TABLE port_forwards (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    type            TEXT NOT NULL,                   -- local | remote | dynamic
    host_id         TEXT NOT NULL REFERENCES hosts(id),
    -- Local Forward
    local_bind_addr TEXT DEFAULT '127.0.0.1',
    local_port      INTEGER,
    remote_target_addr TEXT,
    remote_target_port INTEGER,
    -- Remote Forward
    remote_bind_addr TEXT DEFAULT '127.0.0.1',
    remote_port     INTEGER,
    local_target_addr TEXT DEFAULT '127.0.0.1',
    local_target_port INTEGER,
    -- 选项
    auto_start      INTEGER DEFAULT 0,              -- 关联主机连接时自动启动
    app_start       INTEGER DEFAULT 0,              -- 随应用启动
    group_id        TEXT,
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Vault 凭据
-- ============================================================
CREATE TABLE vault_entries (
    id              TEXT PRIMARY KEY,
    name_enc        TEXT NOT NULL,                   -- AES-256-GCM 加密
    type            TEXT NOT NULL,                   -- password | ssh_password | api_key | token | certificate | custom
    username_enc    TEXT,
    value_enc       TEXT NOT NULL,                   -- 加密的凭据值
    url_enc         TEXT,
    notes_enc       TEXT,
    tags_enc        TEXT,                            -- 加密的 JSON 标签数组
    expires_at      TEXT,
    group_id        TEXT,
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Vault 主密码验证（仅本地）
CREATE TABLE vault_config (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    master_hash     TEXT NOT NULL,                   -- Argon2id(master_password)
    salt            TEXT NOT NULL,
    lock_timeout    INTEGER DEFAULT 900              -- 秒，默认 15 分钟
);

-- ============================================================
-- 全局设置（KV 存储）
-- ============================================================
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,                   -- JSON 值
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 快速连接历史
-- ============================================================
CREATE TABLE quick_connect_history (
    id              TEXT PRIMARY KEY,
    connection_str  TEXT NOT NULL,                   -- user@host:port
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 命令历史（补全用）
-- ============================================================
CREATE TABLE command_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    command         TEXT NOT NULL,
    host_id         TEXT,                            -- NULL = 本地
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cmd_history_recent ON command_history(created_at DESC);

-- ============================================================
-- 会话日志索引
-- ============================================================
CREATE TABLE session_logs (
    id              TEXT PRIMARY KEY,
    host_id         TEXT,
    local_terminal_id TEXT,
    host_label      TEXT,
    file_path       TEXT NOT NULL,
    format          TEXT DEFAULT 'text',             -- text | asciicast
    file_size       INTEGER DEFAULT 0,
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 同步元数据（本地同步状态跟踪）
-- ============================================================
CREATE TABLE sync_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);
-- 存储: device_id, last_sync_at, sync_enabled, encryption_key_hash 等

-- ============================================================
-- 自定义终端主题
-- ============================================================
CREATE TABLE custom_themes (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'dark',    -- dark | light
    foreground      TEXT NOT NULL,
    background      TEXT NOT NULL,
    cursor          TEXT NOT NULL,
    selection       TEXT NOT NULL,
    ansi_colors     TEXT NOT NULL,                   -- JSON: 16 色数组
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 自定义快捷键
-- ============================================================
CREATE TABLE keybindings (
    action          TEXT PRIMARY KEY,                -- 操作标识
    shortcut        TEXT NOT NULL,                   -- 如 "Ctrl+Shift+T"
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SFTP 书签
-- ============================================================
CREATE TABLE sftp_bookmarks (
    id              TEXT PRIMARY KEY,
    host_id         TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    name            TEXT,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## 6. API 接口设计

### 6.1 通用约定

| 项目 | 说明 |
|------|------|
| 基础路径 | `/api/v1` |
| 认证方式 | `Authorization: Bearer <JWT>` |
| 请求格式 | `application/json` |
| 响应格式 | `{ "code": 0, "data": {...}, "message": "ok" }` |
| 错误格式 | `{ "code": 40001, "data": null, "message": "邮箱已注册" }` |
| 分页 | `?page=1&pageSize=20` → `{ data: { items: [], total: 100 } }` |
| 时间格式 | ISO 8601: `2026-03-20T10:00:00Z` |

### 6.2 错误码

| 范围 | 说明 |
|------|------|
| 0 | 成功 |
| 40000-40099 | 请求参数错误 |
| 40100-40199 | 认证/授权错误 |
| 40400-40499 | 资源不存在 |
| 40900-40999 | 冲突（用户名/邮箱已存在） |
| 42900-42999 | 请求过于频繁 |
| 50000-50099 | 服务端内部错误 |

### 6.3 认证模块 (`/api/v1/auth`)

#### POST /auth/register — 邮箱注册

```
请求体:
{
  "username": "string",          // 3-32 字符
  "email": "string",             // 合法邮箱
  "password": "string"           // >= 8 位，含大小写+数字
}

响应 201:
{
  "code": 0,
  "data": {
    "user": { "id", "username", "email", "emailVerified": false, "createdAt" },
    "token": "jwt-string",
    "expiresAt": "ISO8601"
  }
}

错误:
- 40000: 参数校验失败
- 40900: 用户名已被占用
- 40901: 邮箱已注册
```

#### POST /auth/login — 邮箱登录

```
请求体:
{
  "email": "string",
  "password": "string",
  "remember": true,              // 是否记住，影响 token 有效期
  "deviceName": "MacBook Pro"    // 设备名
}

响应 200:
{
  "code": 0,
  "data": {
    "user": { "id", "username", "email", "emailVerified", "avatarUrl", "createdAt" },
    "token": "jwt-string",
    "expiresAt": "ISO8601"
  }
}

错误:
- 40100: 邮箱或密码错误
- 42900: 账户已锁定，请 N 分钟后重试
```

#### POST /auth/oauth/github — GitHub OAuth 登录

```
请求体:
{
  "code": "github-oauth-code",
  "deviceName": "MacBook Pro"
}

响应 200: (同 login 响应)
```

#### POST /auth/oauth/google — Google OAuth 登录

```
请求体:
{
  "credential": "google-id-token",
  "deviceName": "MacBook Pro"
}

响应 200: (同 login 响应)
```

#### POST /auth/logout — 注销

```
Headers: Authorization: Bearer <token>

响应 200:
{ "code": 0, "data": null, "message": "已注销" }
```

#### POST /auth/verify-email — 验证邮箱

```
请求体:
{ "token": "verify-token-string" }

响应 200:
{ "code": 0, "data": null, "message": "邮箱验证成功" }

错误:
- 40001: Token 无效或已过期
```

#### POST /auth/resend-verification — 重发验证邮件

```
Headers: Authorization: Bearer <token>

响应 200:
{ "code": 0, "data": null, "message": "验证邮件已发送" }

错误:
- 42900: 请 60 秒后重试
```

#### POST /auth/forgot-password — 忘记密码

```
请求体:
{ "email": "string" }

响应 200:
{ "code": 0, "data": null, "message": "如果该邮箱已注册，重置链接已发送" }
```

#### POST /auth/reset-password — 重置密码

```
请求体:
{
  "token": "reset-token",
  "newPassword": "string"
}

响应 200:
{ "code": 0, "data": null, "message": "密码已重置" }
```

#### POST /auth/refresh — 刷新 Token

```
Headers: Authorization: Bearer <token>

响应 200:
{
  "code": 0,
  "data": {
    "token": "new-jwt-string",
    "expiresAt": "ISO8601"
  }
}
```

### 6.4 用户模块 (`/api/v1/user`)

#### GET /user/profile — 获取个人信息

```
Headers: Authorization: Bearer <token>

响应 200:
{
  "code": 0,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "emailVerified": true,
    "avatarUrl": "string|null",
    "oauthProvider": "github|google|null",
    "createdAt": "ISO8601",
    "updatedAt": "ISO8601"
  }
}
```

#### PATCH /user/profile — 修改个人信息

```
请求体 (部分字段):
{
  "username": "new-username"     // 可选
}

响应 200:
{ "code": 0, "data": { ...updatedProfile } }

错误:
- 40900: 用户名已被占用
```

#### PATCH /user/email — 修改邮箱

```
请求体:
{
  "newEmail": "new@example.com",
  "password": "current-password"
}

响应 200:
{ "code": 0, "data": null, "message": "验证邮件已发送到新邮箱" }
```

#### PATCH /user/password — 修改密码

```
请求体:
{
  "currentPassword": "string",
  "newPassword": "string"
}

响应 200:
{ "code": 0, "data": null, "message": "密码已修改" }

错误:
- 40100: 当前密码错误
```

#### POST /user/avatar — 上传头像

```
Content-Type: multipart/form-data
字段: avatar (file, JPG/PNG, max 2MB)

响应 200:
{ "code": 0, "data": { "avatarUrl": "/uploads/avatars/uuid.jpg" } }
```

#### DELETE /user/account — 删除账户

```
请求体:
{ "password": "string" }

响应 200:
{ "code": 0, "data": null, "message": "账户已删除" }
```

#### GET /user/sessions — 获取活跃会话列表

```
响应 200:
{
  "code": 0,
  "data": [
    { "id", "deviceName", "ipAddress", "createdAt", "expiresAt", "current": true }
  ]
}
```

#### DELETE /user/sessions/:sessionId — 吊销指定会话

```
响应 200:
{ "code": 0, "data": null }
```

### 6.5 同步模块 (`/api/v1/sync`)

#### POST /sync/push — 推送变更到服务端

```
Headers: Authorization: Bearer <token>

请求体:
{
  "deviceId": "device-uuid",
  "changes": [
    {
      "id": "entity-uuid",
      "entityType": "host",          // host | host_group | local_terminal | snippet | ...
      "data": "encrypted-json-string", // 客户端 E2EE 加密后的数据
      "version": 2,                  // 客户端当前版本
      "deleted": false,
      "updatedAt": "ISO8601"
    }
  ]
}

响应 200:
{
  "code": 0,
  "data": {
    "accepted": ["entity-uuid-1", "entity-uuid-2"],
    "conflicts": [
      {
        "id": "entity-uuid-3",
        "entityType": "host",
        "serverVersion": 3,
        "serverData": "encrypted-json",
        "serverUpdatedAt": "ISO8601"
      }
    ],
    "serverTime": "ISO8601"
  }
}
```

#### POST /sync/pull — 拉取服务端变更

```
请求体:
{
  "deviceId": "device-uuid",
  "lastSyncAt": "ISO8601",         // 上次同步时间
  "entityTypes": ["host", "snippet"] // 可选，为空则拉取全部类型
}

响应 200:
{
  "code": 0,
  "data": {
    "changes": [
      {
        "id": "entity-uuid",
        "entityType": "host",
        "data": "encrypted-json",
        "version": 2,
        "deleted": false,
        "updatedAt": "ISO8601"
      }
    ],
    "serverTime": "ISO8601",
    "hasMore": false                 // 数据量大时分页
  }
}
```

#### POST /sync/full — 全量同步（首次同步或重置后）

```
请求体:
{
  "deviceId": "device-uuid"
}

响应 200:
{
  "code": 0,
  "data": {
    "entities": {
      "host": [ { id, data, version, updatedAt } ],
      "host_group": [ ... ],
      "local_terminal": [ ... ],
      "snippet": [ ... ],
      "snippet_group": [ ... ],
      "port_forward": [ ... ],
      "key": [ ... ],
      "known_host": [ ... ],
      "vault_entry": [ ... ],
      "tag": [ ... ],
      "settings": [ ... ],
      "terminal_theme": [ ... ],
      "keybinding": [ ... ],
      "sftp_bookmark": [ ... ]
    },
    "serverTime": "ISO8601"
  }
}
```

#### POST /sync/reset — 重置同步数据

```
请求体:
{
  "password": "string"               // 需验证密码
}

响应 200:
{ "code": 0, "data": null, "message": "同步数据已清除" }
```

#### POST /sync/encryption — 设置/修改加密口令

```
请求体:
{
  "encryptionSalt": "base64-salt",
  "verifyHash": "hash-of-test-string" // 用于验证口令正确性
}

响应 200:
{ "code": 0, "data": null }
```

### 6.6 文件模块 (`/api/v1/file`)

#### GET /file/avatar/:userId — 获取头像

```
响应: 图片二进制流
```

### 6.7 WebSocket 同步协议 (`wss://host/ws/sync`)

连接时通过 URL 参数传递认证:

```
wss://host/ws/sync?token=<JWT>&deviceId=<device-uuid>
```

#### 消息格式

```typescript
// 客户端 → 服务端
interface WsClientMessage {
  type: 'push' | 'ping';
  requestId: string;              // 用于关联响应
  payload?: SyncPushPayload;
}

// 服务端 → 客户端
interface WsServerMessage {
  type: 'push_ack' | 'change' | 'pong' | 'error';
  requestId?: string;
  payload?: any;
}
```

#### 消息类型

| 方向 | type | 说明 |
|------|------|------|
| C → S | `push` | 推送本地变更 |
| S → C | `push_ack` | 推送确认（含冲突列表） |
| S → C | `change` | 服务端推送其他设备的变更 |
| C → S | `ping` | 心跳 |
| S → C | `pong` | 心跳响应 |
| S → C | `error` | 错误消息 |

---

## 7. 云同步协议

### 7.1 同步流程

```
客户端 A                          服务端                         客户端 B
    │                               │                               │
    ├── WebSocket 连接 ─────────────►                               │
    │                               │◄── WebSocket 连接 ────────────┤
    │                               │                               │
    │  用户修改主机配置              │                               │
    ├── push(change) ───────────────►                               │
    │                               ├── 存储 + 检查冲突              │
    │◄── push_ack(accepted) ────────┤                               │
    │                               ├── change(notification) ───────►
    │                               │                               │
    │                               │               客户端 B 收到推送
    │                               │◄── pull(lastSyncAt) ──────────┤
    │                               ├── changes ────────────────────►
```

### 7.2 冲突解决策略

1. **乐观锁**: 每个实体维护 `version` 字段
2. **Last-Write-Wins**: `updatedAt` 较新者获胜
3. **冲突上报**: 服务端返回 `conflicts` 数组，客户端决定是否覆盖

### 7.3 端到端加密流程

```
用户设置加密口令
    │
    ▼
PBKDF2(口令, salt, 100000 iterations) → 256-bit 派生密钥
    │
    ▼
本地保存: salt + 密钥校验哈希
服务端保存: salt（用于新设备恢复）
    │
    ▼
上传数据时: AES-256-GCM(派生密钥, plaintext) → ciphertext
下载数据时: AES-256-GCM-Decrypt(派生密钥, ciphertext) → plaintext
```

**加密字段范围**:
- hosts: `password_enc`, `key_passphrase_enc`, `proxy_password_enc`
- keys: `private_key_enc`, `passphrase_enc`
- vault_entries: 全部字段（整条记录加密）
- 其他非敏感字段以明文同步（便于服务端检索和冲突处理）

---

## 8. 安全架构

### 8.1 认证安全

| 机制 | 说明 |
|------|------|
| 密码存储 | Argon2id, memoryCost=64MB, timeCost=3, parallelism=1 |
| JWT 签名 | RS256 (RSA 2048-bit) |
| Token 有效期 | 记住登录: 30 天，不记住: 24 小时 |
| Token 吊销 | sessions 表 + token_hash，支持单会话吊销 |
| 登录锁定 | 5 次失败锁定 15 分钟，基于 login_attempts 表 |
| OAuth | Authorization Code Flow + PKCE |

### 8.2 传输安全

| 机制 | 说明 |
|------|------|
| HTTPS | TLS 1.3，HSTS 启用 |
| WebSocket | WSS (TLS) |
| 证书固定 | 客户端可选开启 Certificate Pinning |

### 8.3 本地数据安全

| 机制 | 说明 |
|------|------|
| 密码/密钥加密 | AES-256-GCM，密钥由本地主密码派生 |
| Vault 保护 | 独立 Argon2id 主密码 + 自动锁定 |
| 内存清理 | 敏感 Buffer 使用后 `.fill(0)` 清零 |
| 剪贴板 | 复制密码后 N 秒自动清除 |
| SQLite | 数据库文件权限 600 (仅用户可读写) |

### 8.4 API 安全

| 机制 | 说明 |
|------|------|
| 限流 | 登录/注册: 5 次/分钟; 通用 API: 100 次/分钟; 同步: 30 次/分钟 |
| CORS | 仅允许桌面客户端 Origin |
| 输入校验 | zod Schema 严格校验所有请求参数 |
| SQL 注入 | Knex.js 参数化查询 |
| 文件上传 | 白名单 MIME + 大小限制 + 文件内容检测 |

---

## 9. 部署架构

### 9.1 单机部署（推荐初期方案）

```
┌──────────────────────────────────┐
│  Linux Server (2C 4G)            │
│                                  │
│  ┌────────────────────────────┐  │
│  │   Nginx (反向代理 + TLS)    │  │
│  │   :443 → :3000              │  │
│  │   :443/ws → :3000/ws        │  │
│  └────────────┬───────────────┘  │
│               │                  │
│  ┌────────────▼───────────────┐  │
│  │   Node.js Express + WS     │  │
│  │   :3000                     │  │
│  │   PM2 进程守护              │  │
│  └────────────┬───────────────┘  │
│               │                  │
│  ┌────────────▼───────────────┐  │
│  │   SQLite 数据库文件         │  │
│  │   /data/sterminal.db        │  │
│  └────────────────────────────┘  │
│                                  │
│  ┌────────────────────────────┐  │
│  │   uploads/                  │  │
│  │   头像等文件存储             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 9.2 环境变量配置

```env
# 服务
PORT=3000
NODE_ENV=production
BASE_URL=https://sync.sterminal.app

# 数据库
DB_PATH=/data/sterminal.db

# JWT
JWT_PRIVATE_KEY_PATH=/etc/sterminal/jwt-private.pem
JWT_PUBLIC_KEY_PATH=/etc/sterminal/jwt-public.pem

# 邮件
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=noreply@sterminal.app
SMTP_PASS=xxx
MAIL_FROM="STerminal <noreply@sterminal.app>"

# OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# 文件
UPLOAD_DIR=/data/uploads
MAX_AVATAR_SIZE=2097152

# 限流
RATE_LIMIT_AUTH=5
RATE_LIMIT_API=100
RATE_LIMIT_SYNC=30
```

### 9.3 客户端自动更新

| 平台 | 更新机制 |
|------|---------|
| macOS | electron-updater, DMG 分发, 自动更新服务 |
| Windows | electron-updater, NSIS 安装包, 自动更新服务 |
| Linux | AppImage + electron-updater, 另提供 deb/rpm |

更新检查接口:

#### GET /api/v1/update/check

```
Query: ?platform=darwin&arch=arm64&currentVersion=1.0.0

响应 200:
{
  "code": 0,
  "data": {
    "hasUpdate": true,
    "version": "1.1.0",
    "channel": "stable",
    "releaseNotes": "...",
    "downloadUrl": "https://...",
    "sha256": "abc123...",
    "publishedAt": "ISO8601"
  }
}
```

---

## 附录 A: IPC Channel 详细定义

### A.1 SSH 相关

| Channel | 方向 | 参数 | 返回 |
|---------|------|------|------|
| `ssh:connect` | R→M | `{ hostId, hostConfig }` | `{ connectionId }` |
| `ssh:disconnect` | R→M | `{ connectionId }` | `void` |
| `ssh:data` | 双向 | `{ connectionId, data: Uint8Array }` | - |
| `ssh:resize` | R→M | `{ connectionId, cols, rows }` | `void` |
| `ssh:status` | M→R | `{ connectionId, status: 'connected'\|'disconnected'\|'reconnecting' }` | - |
| `ssh:error` | M→R | `{ connectionId, error: string }` | - |
| `ssh:host-verify` | M→R | `{ host, port, fingerprint, keyType }` | `{ accept: boolean }` |

### A.2 PTY 相关（本地终端）

| Channel | 方向 | 参数 | 返回 |
|---------|------|------|------|
| `pty:spawn` | R→M | `{ shell, args, cwd, env, cols, rows }` | `{ ptyId }` |
| `pty:data` | 双向 | `{ ptyId, data: Uint8Array }` | - |
| `pty:resize` | R→M | `{ ptyId, cols, rows }` | `void` |
| `pty:kill` | R→M | `{ ptyId }` | `void` |
| `pty:exit` | M→R | `{ ptyId, exitCode }` | - |

### A.3 SFTP 相关

| Channel | 方向 | 参数 | 返回 |
|---------|------|------|------|
| `sftp:open` | R→M | `{ connectionId }` | `{ sftpId }` |
| `sftp:list` | R→M | `{ sftpId, path }` | `FileInfo[]` |
| `sftp:stat` | R→M | `{ sftpId, path }` | `FileStat` |
| `sftp:mkdir` | R→M | `{ sftpId, path }` | `void` |
| `sftp:rm` | R→M | `{ sftpId, path, recursive }` | `void` |
| `sftp:rename` | R→M | `{ sftpId, oldPath, newPath }` | `void` |
| `sftp:chmod` | R→M | `{ sftpId, path, mode, recursive }` | `void` |
| `sftp:chown` | R→M | `{ sftpId, path, uid, gid }` | `void` |
| `sftp:upload` | R→M | `{ sftpId, localPath, remotePath, transferId }` | `void` |
| `sftp:download` | R→M | `{ sftpId, remotePath, localPath, transferId }` | `void` |
| `sftp:transfer-progress` | M→R | `{ transferId, bytesTransferred, totalBytes, speed }` | - |
| `sftp:transfer-complete` | M→R | `{ transferId, success, error? }` | - |
| `sftp:transfer-cancel` | R→M | `{ transferId }` | `void` |
| `sftp:read-file` | R→M | `{ sftpId, path, maxSize }` | `{ content: string, encoding }` |
| `sftp:write-file` | R→M | `{ sftpId, path, content }` | `void` |

### A.4 数据库 CRUD

| Channel | 方向 | 说明 |
|---------|------|------|
| `db:hosts:list` | R→M | 查询主机列表（支持过滤/排序） |
| `db:hosts:get` | R→M | 获取单个主机详情 |
| `db:hosts:create` | R→M | 创建主机 |
| `db:hosts:update` | R→M | 更新主机 |
| `db:hosts:delete` | R→M | 删除主机 |
| `db:hosts:batch-move` | R→M | 批量移动主机到分组 |
| `db:hosts:batch-tag` | R→M | 批量添加/移除标签 |
| `db:host-groups:*` | R→M | 主机分组 CRUD |
| `db:local-terminals:*` | R→M | 本地终端配置 CRUD |
| `db:snippets:*` | R→M | 命令片段 CRUD |
| `db:snippet-groups:*` | R→M | 片段分组 CRUD |
| `db:port-forwards:*` | R→M | 端口转发 CRUD |
| `db:keys:*` | R→M | SSH 密钥 CRUD |
| `db:known-hosts:*` | R→M | 已知主机 CRUD |
| `db:vault:*` | R→M | Vault CRUD（需先解锁） |
| `db:tags:*` | R→M | 标签 CRUD |
| `db:settings:get` | R→M | 获取设置值 |
| `db:settings:set` | R→M | 设置值 |
| `db:settings:reset` | R→M | 重置所有设置 |
| `db:themes:*` | R→M | 自定义主题 CRUD |
| `db:keybindings:*` | R→M | 快捷键 CRUD |
| `db:quick-history:*` | R→M | 快速连接历史 |
| `db:cmd-history:*` | R→M | 命令历史 |
| `db:logs:*` | R→M | 日志索引 CRUD |
| `db:sftp-bookmarks:*` | R→M | SFTP 书签 CRUD |

### A.5 其他

| Channel | 方向 | 说明 |
|---------|------|------|
| `vault:unlock` | R→M | 输入主密码解锁 Vault |
| `vault:lock` | R→M | 锁定 Vault |
| `vault:setup` | R→M | 首次设置主密码 |
| `vault:generate-password` | R→M | 生成随机密码 |
| `key:generate` | R→M | 生成 SSH 密钥对 |
| `key:import` | R→M | 导入密钥文件 |
| `key:deploy` | R→M | 部署公钥到远程主机 |
| `key:agent-load` | R→M | 加载密钥到内置 Agent |
| `key:agent-unload` | R→M | 从 Agent 卸载密钥 |
| `sync:start` | R→M | 启动同步 |
| `sync:stop` | R→M | 停止同步 |
| `sync:status` | M→R | 同步状态变更推送 |
| `sync:set-encryption` | R→M | 设置加密口令 |
| `log:start` | R→M | 开始录制会话 |
| `log:stop` | R→M | 停止录制 |
| `log:replay` | R→M | 获取 asciicast 回放数据 |
| `system:tray-action` | M→R | 托盘菜单操作 |
| `system:deep-link` | M→R | 深度链接触发 |
| `system:check-update` | R→M | 检查更新 |
| `system:install-update` | R→M | 安装更新 |
| `system:get-shell-list` | R→M | 获取系统可用 Shell 列表 |
| `system:clipboard-clear` | R→M | 延时清除剪贴板 |
| `system:open-external` | R→M | 打开外部链接/文件 |
| `window:new` | R→M | 打开新窗口 |
| `window:merge` | R→M | 合并窗口 |
| `system:import-hosts` | R→M | 导入主机配置文件 |
| `system:export-hosts` | R→M | 导出主机配置文件 |
| `system:backup` | R→M | 创建完整备份 |
| `system:restore` | R→M | 从备份恢复 |
| `system:ping` | R→M | Ping 检测主机 |

---

## 附录 B: 设置项 Key 清单

以下为 `settings` 表中所有 key 及其默认值，前端设置页面直接映射:

```typescript
const DEFAULT_SETTINGS = {
  // === 终端外观 ===
  'terminal.theme':              'sterminal-dark',
  'terminal.fontFamily':         '"JetBrains Mono", "Fira Code", "Menlo", monospace',
  'terminal.fontSize':           14,
  'terminal.fontWeight':         'normal',
  'terminal.lineHeight':         1.2,
  'terminal.letterSpacing':      0,
  'terminal.fontLigatures':      true,
  'terminal.cursorStyle':        'block',
  'terminal.cursorBlink':        true,
  'terminal.scrollback':         5000,
  'terminal.padding':            8,
  'terminal.backgroundOpacity':  100,
  'terminal.backgroundBlur':     false,
  'terminal.gpuAcceleration':    true,

  // === 终端行为 ===
  'terminal.rightClickAction':   'contextMenu',    // 'paste' | 'contextMenu'
  'terminal.copyOnSelect':       false,
  'terminal.copyWithFormat':     false,
  'terminal.trimTrailingSpaces': true,
  'terminal.pasteWarning':       true,
  'terminal.trimPasteNewlines':  false,
  'terminal.wordSeparators':     ' .;:\'"~!@#$%^&*()+-=[]{}\\|,.<>?/',
  'terminal.bell':               'none',           // 'sound' | 'visual' | 'none'
  'terminal.focusFollowMouse':   false,
  'terminal.linkModifier':       'ctrl',           // 'ctrl' | 'meta' (auto by platform)
  'terminal.scrollSensitivity':  3,

  // === Shell 集成 ===
  'shell.default':               '',               // 空 = 系统默认
  'shell.defaultCwd':            '',               // 空 = 家目录
  'shell.inheritEnv':            true,
  'shell.customEnv':             '{}',             // JSON
  'shell.loginShell':            false,            // macOS 默认 true
  'shell.termEnv':               'xterm-256color',

  // === 应用外观 ===
  'app.theme':                   'system',         // 'light' | 'dark' | 'system'
  'app.accentColor':             '#6366f1',
  'app.sidebarPosition':         'left',
  'app.sidebarWidth':            260,
  'app.sidebarAutoHide':         false,
  'app.compactMode':             false,
  'app.tabBarPosition':          'top',
  'app.showToolbar':             true,
  'app.showMenuBar':             true,
  'app.titleBarStyle':           'custom',         // 'native' | 'custom'
  'app.windowOpacity':           100,
  'app.language':                'system',
  'app.zoomLevel':               100,

  // === 同步 ===
  'sync.enabled':                true,
  'sync.autoSync':               true,

  // === 通知 ===
  'notification.system':         true,
  'notification.sound':          false,
  'notification.events':         '["disconnect","transferComplete"]', // JSON

  // === SFTP ===
  'sftp.panelPosition':          'tab',            // 'sidebar' | 'bottom' | 'tab'
  'sftp.defaultView':            'list',
  'sftp.showHidden':             false,
  'sftp.defaultLocalDir':        '',
  'sftp.defaultRemoteDir':       '~',
  'sftp.concurrency':            3,
  'sftp.conflictStrategy':       'ask',            // 'overwrite'|'skip'|'rename'|'ask'
  'sftp.uploadSpeedLimit':       0,
  'sftp.downloadSpeedLimit':     0,
  'sftp.preserveMtime':          true,

  // === 会话 ===
  'session.restoreOnStartup':    true,
  'session.autoReconnect':       true,
  'session.maxReconnectAttempts': 10,

  // === 日志 ===
  'log.autoRecord':              false,
  'log.format':                  'text',           // 'text' | 'asciicast'
  'log.directory':               '',               // 空 = 默认路径
  'log.fileNameTemplate':        '{host}_{datetime}.log',
  'log.maxFileSize':             52428800,          // 50MB
  'log.autoClean':               false,
  'log.retainDays':              90,
  'log.timestamp':               false,
  'log.excludePasswords':        false,

  // === 补全 ===
  'autocomplete.enabled':        true,
  'autocomplete.trigger':        'auto',           // 'auto' | 'tab'
  'autocomplete.delay':          300,
  'autocomplete.maxSuggestions': 10,
  'autocomplete.sources':        '["history","path","command","snippet"]',

  // === Ping ===
  'ping.enabled':                false,
  'ping.interval':               300,
  'ping.timeout':                3000,
  'ping.method':                 'tcp',            // 'icmp' | 'tcp'

  // === Vault ===
  'vault.clipboardClearTime':    30,               // 秒
  'vault.lockTimeout':           900,              // 秒，15 分钟

  // === 备份 ===
  'backup.auto':                 false,
  'backup.interval':             'weekly',         // 'daily'|'weekly'|'monthly'
  'backup.retainCount':          5,
  'backup.directory':            '',

  // === 系统 ===
  'system.minimizeToTray':       true,
  'system.startOnBoot':          false,
  'system.startHidden':          false,

  // === 更新 ===
  'update.checkFrequency':       'startup',        // 'startup'|'daily'|'weekly'|'never'
  'update.autoDownload':         false,
  'update.channel':              'stable',          // 'stable' | 'beta'
};
```

---

## 附录 C: 数据实体类型定义

```typescript
// ===== shared/types/host.ts =====
export interface Host {
  id: string;
  label?: string;
  address: string;
  port: number;
  protocol: 'ssh' | 'mosh' | 'telnet';
  username?: string;
  authType: 'password' | 'key' | 'password_key' | 'agent' | 'keyboard';
  password?: string;           // 解密后的明文（仅内存）
  keyId?: string;
  keyPassphrase?: string;
  startupCommand?: string;
  environment?: Record<string, string>;
  encoding: string;
  keepaliveInterval: number;
  connectTimeout: number;
  heartbeatTimeout: number;
  compression: boolean;
  strictHostKey: boolean;
  sshVersion: 'auto' | '2';
  preferredKex?: string;
  preferredCipher?: string;
  preferredMac?: string;
  preferredHostKeyAlgo?: string;
  proxyJumpId?: string;
  proxyCommand?: string;
  socksProxy?: string;
  httpProxy?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  terminalTheme?: string;
  fontFamily?: string;
  fontSize?: number;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  notes?: string;
  groupId?: string;
  sortOrder: number;
  tagIds: string[];
  lastConnected?: string;
  connectCount: number;
}

// ===== shared/types/terminal.ts =====
export interface LocalTerminalConfig {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  shell?: string;
  shellArgs?: string[];
  cwd?: string;
  startupScript?: string;
  startupCommand?: string;
  scriptLineDelay: number;
  environment?: Record<string, string>;
  loginShell: boolean;
  terminalTheme?: string;
  fontFamily?: string;
  fontSize?: number;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
  groupId?: string;
  sortOrder: number;
  isDefault: boolean;
}

// ===== shared/types/snippet.ts =====
export interface Snippet {
  id: string;
  name: string;
  content: string;
  description?: string;
  tags: string[];
  groupId?: string;
  sortOrder: number;
  useCount: number;
  lastUsedAt?: string;
}

// ===== shared/types/port-forward.ts =====
export interface PortForwardRule {
  id: string;
  name?: string;
  type: 'local' | 'remote' | 'dynamic';
  hostId: string;
  localBindAddr: string;
  localPort?: number;
  remoteTargetAddr?: string;
  remoteTargetPort?: number;
  remoteBindAddr?: string;
  remotePort?: number;
  localTargetAddr?: string;
  localTargetPort?: number;
  autoStart: boolean;
  appStart: boolean;
  groupId?: string;
  sortOrder: number;
}

// ===== shared/types/vault.ts =====
export interface VaultEntry {
  id: string;
  name: string;
  type: 'password' | 'ssh_password' | 'api_key' | 'token' | 'certificate' | 'custom';
  username?: string;
  value: string;
  url?: string;
  notes?: string;
  tags: string[];
  expiresAt?: string;
  groupId?: string;
  sortOrder: number;
}

// ===== shared/types/key.ts =====
export interface SshKey {
  id: string;
  name: string;
  keyType: 'rsa' | 'ed25519' | 'ecdsa';
  bits?: number;
  curve?: string;
  fingerprint: string;
  publicKey: string;
  privateKey?: string;         // 解密后（仅内存）
  passphrase?: string;
  comment?: string;
  autoLoadAgent: boolean;
}
```

---

*文档结束。本文档作为 STerminal 项目的技术架构蓝图，供前后端开发人员对照实施。*
