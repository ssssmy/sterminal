# STerminal 开发进展记录

> 更新日期: 2026-03-26 | 当前阶段: P0 MVP 已完成，P1 核心增强全部完成，P2 进阶功能部分完成（密钥管理+Vault+回放器已实现，剩日志审计）

---

## 一、项目概况

STerminal 是一款面向开发者和运维工程师的跨桌面平台终端管理工具，集成 SSH/SFTP 客户端、本地终端管理、密钥管理、端口转发、命令片段等核心能力，提供免费云同步服务。

- **技术栈**: Electron + Vue 3 + Element Plus + Pinia + xterm.js (前端) / Express + SQLite + WebSocket (后端)
- **仓库结构**: Monorepo (`packages/client` + `packages/server`)
- **设计稿**: `untitled.pen` (16 屏 UI 设计)
- **文档**: `docs/PRD.md` (47K) + `docs/ARCHITECTURE.md` (68K)

---

## 二、分期规划

| 阶段 | 范围 | 状态 |
|------|------|------|
| **P0 MVP** | 登录注册、本地终端(多配置)、SSH连接、主机管理(CRUD/分组)、多标签/分屏 | ✅ 已完成 |
| **P0+** | 广播模式、会话录制、终端内搜索、侧边栏折叠持久化、远端OS检测 | ✅ 已完成 |
| **P1 核心增强** | SFTP文件管理、命令片段、端口转发、设置完善、云同步对接 | ✅ 已完成 |
| **P2 进阶功能** | SSH密钥管理、Vault密钥库、回放器、日志审计、OAuth登录（GitHub/Google） | 🔧 部分完成（密钥管理+Vault+回放器已实现，剩日志审计+OAuth） |
| **P3 体验优化** | 自动补全、命令面板完善、主题自定义、快捷键自定义、数据导入导出、自动更新 | ⏳ 待开发 |
| **P4 基础设施** | 服务端迁移 PostgreSQL/MySQL、订阅付费系统、代码签名与公证 | ⏳ 待开发 |

---

## 三、P0 MVP 已完成功能清单

### 3.1 后端 (packages/server) — 30 个源文件

#### 3.1.1 项目基础设施
| 文件 | 功能 |
|------|------|
| `src/index.ts` | 服务器入口：HTTP Server + WebSocket + 数据库迁移 + 优雅关闭(SIGTERM/SIGINT 10s超时) |
| `src/app.ts` | Express 应用：CORS、JSON解析、路由挂载、错误处理 |
| `src/config.ts` | 环境配置：端口、JWT密钥、数据库路径、邮件配置等 |
| `src/database/connection.ts` | SQLite 连接(better-sqlite3, WAL 模式) |
| `src/database/migrations/001_initial.ts` | 初始迁移：6 张表(users, sessions, password_resets, login_attempts, sync_entities, sync_cursors) |

#### 3.1.2 认证模块 (完整实现)
| 文件 | 功能 |
|------|------|
| `src/services/auth.service.ts` | 注册(Argon2id哈希)、登录(JWT+会话表)、登出、邮箱验证、忘记密码、重置密码 |
| `src/controllers/auth.controller.ts` | 6个端点：register(201), login, logout, verifyEmail, forgotPassword, resetPassword, oauthCallback |
| `src/routes/auth.routes.ts` | POST /api/v1/auth/register, login, logout, forgot-password, reset-password; GET verify-email |
| `src/validators/auth.schema.ts` | Zod 校验：邮箱格式、密码强度(8位+大小写+数字)、用户名3-32字符 |
| `src/middleware/auth.middleware.ts` | JWT Bearer Token 提取 + authMiddleware(必需) + optionalAuthMiddleware(可选) |

#### 3.1.3 用户模块
| 文件 | 功能 |
|------|------|
| `src/services/user.service.ts` | 获取用户信息、更新资料、修改密码、删除账号 |
| `src/controllers/user.controller.ts` | GET /me, PATCH /me, PUT /me/password, DELETE /me |
| `src/routes/user.routes.ts` | 路由定义 |
| `src/validators/user.schema.ts` | 请求参数校验 |

#### 3.1.4 同步模块 (完整实现)
| 文件 | 功能 |
|------|------|
| `src/services/sync.service.ts` | pushSync(乐观锁,version+1)、pullSync(游标分页+since)、getSyncCursors、deleteEntity(软删除) |
| `src/controllers/sync.controller.ts` | POST /sync/push, GET /sync/pull, GET /sync/cursors |
| `src/routes/sync.routes.ts` | 路由定义 |
| `src/validators/sync.schema.ts` | 同步数据校验 |
| `src/websocket/ws-server.ts` | WebSocket 服务(JWT认证握手) |
| `src/websocket/sync-handler.ts` | 实时同步推送处理 |

#### 3.1.5 通用模块
| 文件 | 功能 |
|------|------|
| `src/services/email.service.ts` | Nodemailer 邮件发送(验证邮件、密码重置邮件) |
| `src/services/oauth.service.ts` | GitHub/Google OAuth 策略 |
| `src/middleware/error-handler.ts` | 全局错误处理中间件(AppError类, HTTP状态码映射) |
| `src/middleware/rate-limit.ts` | API 限流(express-rate-limit) |
| `src/middleware/validate.ts` | Zod schema 验证中间件 |
| `src/utils/logger.ts` | Pino 结构化日志 |
| `src/utils/jwt.ts` | JWT 生成/验证工具 |
| `src/utils/hash.ts` | SHA256 哈希工具 |
| `src/controllers/file.controller.ts` | 文件上传控制器(头像等) |
| `src/routes/file.routes.ts` | 文件路由 |

---

### 3.2 前端 (packages/client) — 43 个源文件

#### 3.2.1 Electron 主进程
| 文件 | 功能 |
|------|------|
| `src/main/index.ts` | 应用入口：BrowserWindow(1440x900, 自定义标题栏), IPC注册, DB初始化, 优雅退出(killAllPty+disconnectAllSsh+closeDatabase) |
| `src/main/services/db.ts` | 本地 SQLite 数据库服务 |
| `src/main/database/schema.ts` | 20+ 张表定义：hosts, host_groups, tags, local_terminals, keys, known_hosts, snippets, port_forwards, vault_entries, settings, quick_connect_history, command_history, session_logs, sync_meta, custom_themes, keybindings, sftp_bookmarks 等 |
| `src/main/ipc/index.ts` | IPC Handler 统一注册入口 |
| `src/main/ipc/pty.handler.ts` | **node-pty 完整实现**：spawn(xterm-256color, 跨平台shell检测), write, resize, kill, onData转发, onExit通知, killAllPty()清理 |
| `src/main/ipc/ssh.handler.ts` | **ssh2 完整实现**：5种认证方式(password/key/password_key/agent/keyboard), shell stream, data/stderr转发, resize(setWindow), disconnect, disconnectAllSsh()清理 |
| `src/main/ipc/db.handler.ts` | 数据库CRUD IPC：settings(UPSERT), local_terminals(CRUD), hosts(CRUD+分组过滤) |
| `src/main/ipc/system.handler.ts` | 系统操作 IPC：shell列表(/etc/shells)、外部链接、文件管理器打开路径(路径校验)、剪贴板 |
| `src/main/ipc/log.handler.ts` | 会话录制 IPC：start/stop/isRecording/list/delete/replay/openDirectory |
| `src/main/services/session-recorder.ts` | 会话录制核心：asciicast v2 格式写入、背压感知、流完成回调更新文件大小 |

#### 3.2.2 Preload 层
| 文件 | 功能 |
|------|------|
| `src/preload/index.ts` | contextBridge 安全暴露 electronAPI：invoke(请求响应), on(事件监听), removeListener(取消监听) |

#### 3.2.3 共享类型和常量
| 文件 | 功能 |
|------|------|
| `src/shared/types/terminal.ts` | LocalTerminalConfig, TabSession, SplitNode(递归树), TerminalInstance(含ptyId, remoteOS, recording) |
| `src/shared/types/host.ts` | Host(30+字段含代理/加密/主题), HostGroup, Tag |
| `src/shared/types/ipc-channels.ts` | 180+ IPC Channel 定义：SSH(8含OS_DETECTED), PTY(6), SFTP(16), DB(40+), Vault(4), Key(5), Sync(4), Log(7含录制全流程), System(14含OPEN_PATH), Window(2) |
| `src/shared/types/settings.ts` | 设置类型定义 |
| `src/shared/types/snippet.ts` | 命令片段类型 |
| `src/shared/constants/defaults.ts` | 60+ 默认设置值(终端外观、快捷键、行为等) |

#### 3.2.4 渲染进程 — Stores (状态管理)
| 文件 | 功能 |
|------|------|
| `src/renderer/stores/auth.store.ts` | 认证状态：login/register/logout 对接真实后端 API，JWT 滑动续期（每次启动续期7天），restoreSession，localStorage持久化 |
| `src/renderer/stores/sessions.store.ts` | 会话管理：tabs[], activeTabId, terminalInstances Map, broadcastMode, createTab, closeTab(含清理), switchTab, splitPane(递归树分裂), closeSplitPane, renameTab, togglePinTab, getActiveTabTerminalIds |
| `src/renderer/stores/hosts.store.ts` | 主机管理：hosts[], groups[], tags[], fetchHosts/Groups/Tags, createHost, updateHost, deleteHost |
| `src/renderer/stores/terminals.store.ts` | 终端配置：terminals[], fetchTerminals, createTerminal, updateTerminal, deleteTerminal, getDefault |
| `src/renderer/stores/ui.store.ts` | UI状态：sidebarWidth/Collapsed, theme(dark/light/system), commandPalette, hostConfigDialog, terminalConfigDialog, showTerminalSearch |
| `src/renderer/stores/settings.store.ts` | 设置管理 |
| `src/renderer/stores/snippets.store.ts` | 命令片段管理 |

#### 3.2.5 渲染进程 — Views (页面)
| 文件 | 功能 |
|------|------|
| `src/renderer/views/auth/LoginView.vue` | 登录页：480px卡片、邮箱/密码/记住我/忘记密码、OAuth(GitHub+Google SVG图标)、注册链接 |
| `src/renderer/views/auth/RegisterView.vue` | 注册页：用户名/邮箱/密码/确认密码、**密码强度指示器(3级色条)**、密码规则校验(大小写+数字)、OAuth |
| `src/renderer/views/workspace/WorkspaceView.vue` | 主工作区：Sidebar + Toolbar + TerminalTabs + TerminalPane + CommandPalette + HostConfigDialog、键盘快捷键(Ctrl+T/W/P) |
| `src/renderer/views/settings/SettingsLayout.vue` | 设置页布局 |
| `src/renderer/views/settings/AccountSettings.vue` | 账户设置：资料编辑、修改密码、同步管理、E2EE 加密设置、服务器 URL 显示 |
| `src/renderer/views/settings/TerminalSettings.vue` | 终端设置 |
| `src/renderer/views/settings/AppearanceSettings.vue` | 外观设置 |

#### 3.2.6 渲染进程 — Components (组件)
| 文件 | 功能 |
|------|------|
| `src/renderer/components/sidebar/AppSidebar.vue` | **完整侧边栏**：用户头像+名称、搜索框(过滤主机/终端)、主机分组树(折叠/展开/右键菜单/双击连接/拖拽排序/状态点)、本地终端列表(打开/编辑/复制/删除/拖拽排序)、**五区域统一折叠(主机/终端/片段/端口/密钥库)并持久化到DB**、右侧拖拽调整宽度(180-480px) |
| `src/renderer/components/toolbar/AppToolbar.vue` | 工具栏：SFTP/新终端/水平分屏/垂直分屏/广播模式(左), **录制(真实IPC联动,红色闪烁)**/录制文件夹(shell.openPath)/搜索/全屏(右), -webkit-app-region: drag |
| `src/renderer/components/terminal/TerminalTabs.vue` | 标签栏：滚动溢出箭头、**OS图标(macOS/Windows/Linux SVG,SSH连接后自动检测)**/类型图标、**双击内联重命名**、**录制指示器(红点闪烁)**、固定/关闭、新建按钮、鼠标滚轮水平滚动 |
| `src/renderer/components/terminal/TerminalPane.vue` | **终端面板(核心)**：**模块级终端池(跨实例共享)**、xterm.js+FitAddon+WebLinksAddon+SearchAddon、PTY spawn/write/resize/kill全流程、SSH连接(5种认证+远端OS检测)、**广播模式**、**dirtyWhileHidden滚动修复**、ResizeObserver自动fit + SplitView递归组件(**分屏拖拽调整比例**, mousedown/move/up, ratio 0.1~0.9)。导出搜索API(terminalFindNext/Previous/ClearSearch) |
| `src/renderer/components/terminal/TerminalSearchBar.vue` | **终端内搜索栏**：增量搜索、大小写敏感/全字匹配/正则选项、上下导航(Shift+Enter/Enter)、Esc关闭、tab切换自动重新搜索 |
| `src/renderer/components/icons/Icon{MacOS,Windows,Linux}.vue` | 三个OS图标SVG组件(带颜色：灰/蓝/黄) |
| `src/renderer/components/host/HostConfigDialog.vue` | **主机配置对话框**：el-dialog 3-tab(基本:标签/地址/端口/用户名/认证方式/密码/密钥/分组, 高级:启动命令/编码/keepalive/超时/压缩/主机密钥检查/SSH版本/备注, 代理:跳板机/SOCKS/HTTP), 编辑模式自动加载数据 |
| `src/renderer/components/common/CommandPalette.vue` | 命令面板(骨架) |

#### 3.2.7 渲染进程 — 其他
| 文件 | 功能 |
|------|------|
| `src/renderer/App.vue` | 根组件：RouterView + 主题恢复 |
| `src/renderer/main.ts` | 渲染进程入口：Vue+Pinia+Router+i18n+ElementPlus |
| `src/renderer/router/index.ts` | 路由：/login, /register, /(Workspace), /settings, 404→/ |
| `src/renderer/composables/useIpc.ts` | IPC封装Composable：invoke(类型安全), on(自动清理), off, 非Electron环境降级 |
| `src/renderer/styles/variables.scss` | CSS变量主题Token：暗色+亮色(bg/text/accent/border/terminal/tab等30+变量) |
| `src/renderer/styles/global.scss` | 全局样式：reset, xterm.css导入, 滚动条, Element Plus暗色覆盖, 工具类 |
| `src/renderer/i18n/index.ts` | 国际化配置 |
| `src/renderer/i18n/zh-CN.json` | 中文语言包 |

#### 3.2.8 xterm.js 终端配色方案
```
background: #1a1b2e    foreground: #e2e8f0    cursor: #6366f1
black: #1a1b2e         red: #ef4444           green: #22c55e
yellow: #eab308        blue: #3b82f6          magenta: #a855f7
cyan: #06b6d4          white: #e2e8f0
brightBlack: #64748b   brightRed: #f87171     brightGreen: #4ade80
brightYellow: #facc15   brightBlue: #60a5fa    brightMagenta: #c084fc
brightCyan: #22d3ee     brightWhite: #f8fafc
字体: JetBrains Mono / Fira Code / Cascadia Code / Menlo, 14px, 1.2行高
```

---

### 3.3 配置和构建文件

| 文件 | 说明 |
|------|------|
| `/package.json` | Monorepo 根配置(workspaces: packages/*) |
| `packages/server/package.json` | 后端依赖：express, better-sqlite3, argon2, jsonwebtoken, ws, pino, zod, nodemailer 等 |
| `packages/server/tsconfig.json` | TypeScript 配置 |
| `packages/server/.env.example` | 环境变量模板 |
| `packages/client/package.json` | 前端依赖：vue3, element-plus, pinia, vue-router, @xterm/xterm, @xterm/addon-*, node-pty, ssh2, better-sqlite3, libsodium-wrappers 等 |
| `packages/client/tsconfig.json` | TypeScript 配置 |
| `packages/client/vite.config.ts` | Vite 构建：vue插件, Element Plus按需导入, @/@shared路径别名 |
| `packages/client/electron-builder.yml` | Electron 打包配置 |
| `packages/client/index.html` | HTML 入口 |

---

## 四、P0 已知遗留问题

| 编号 | 问题 | 优先级 | 说明 |
|------|------|--------|------|
| 1 | 后端登录锁定参数不符 PRD | 低 | 代码实现10次/10分钟，PRD 要求5次/15分钟 |
| 2 | 后端错误码粒度不足 | 低 | 直接使用 HTTP 状态码(401/409)，架构文档定义了细粒度码(40100/40900) |
| 3 | 后端缺少部分同步端点 | 中 | /sync/full、/sync/reset、/sync/encryption 未实现 |
| 4 | 后端头像上传未完整 | 低 | file.controller 骨架存在但业务逻辑未实现 |
| 5 | ~~后端 deleteAccount 未完整~~ | ~~低~~ | ✅ 已实现（前后端均完整） |
| 6 | ~~前端 auth.store 使用 mock~~ | ~~中~~ | ✅ 已对接真实后端 API（login/register/logout/delete account） |
| 7 | 前端 CommandPalette 未实现 | 低 | 仅有骨架组件 |
| 8 | ~~system.handler 多数为骨架~~ | ~~低~~ | ✅ 已实现 shell列表、openPath(含路径校验)、openExternal、剪贴板 |

---

## 五、后续阶段工作计划

### P1: 核心增强（预计工作量：中等）

#### 5.1.1 SFTP 文件管理 ✅ 已完成
- [x] `sftp.handler.ts` — 13 个 SFTP IPC handler（open/list/stat/mkdir/rm/rename/chmod/chown/read-file/write-file/upload/download/transfer-cancel）
- [x] `local-fs.handler.ts` — 本地文件系统浏览（list/home）
- [x] `SftpPanel.vue` — 双栏文件浏览器（本地 + 远程），可拖拽调整比例
- [x] `SftpFileList.vue` — 可排序表头、多选、内联重命名、右键菜单
- [x] `SftpPathBar.vue` — 面包屑导航 + 可编辑路径
- [x] `SftpToolbar.vue` — 上传/下载/新建/刷新/隐藏文件/视图切换
- [x] `SftpTransferQueue.vue` — 传输进度条、速度显示、取消
- [x] `SftpFileEditor.vue` — 远程文本文件编辑器（< 1MB）
- [x] 递归目录上传/下载（collectRemoteFiles/collectLocalFiles + mkdirpRemote）
- [x] 传输进度实时推送 + 目录传输可取消
- [x] SFTP 书签 CRUD（db.handler.ts）
- [x] Tab 系统集成：contentType 'sftp'，FolderOpened 图标
- [x] 远程默认路径用 sftp.realpath('.') 获取用户 home
- [x] SSH 已知主机验证（首次连接弹窗确认，指纹变更警告）
- [ ] 拖拽上传（从系统文件管理器拖入）— 延后

#### 5.1.2 命令片段管理 ✅ 已完成
- [x] `SnippetEditDialog.vue` — 片段新建/编辑对话框（名称、多行命令、描述、标签、分组选择）
- [x] 侧边栏片段列表 + 分组展示 + 搜索过滤 + 拖拽排序
- [x] 双击执行到当前活跃终端 + 右键菜单（执行/复制/编辑/删除）
- [x] 变量占位符系统：`${name}` / `${name:默认值}` / `${name:A|B|C}` / `${!password}`
- [x] 变量填写对话框（`SnippetVariableDialog.vue`）：实时命令预览、密码遮蔽、值记忆
- [x] 内置变量：`${date}` / `${time}` / `${datetime}` / `${timestamp}`（自动替换）
- [x] 快捷插入工具栏（点击按钮插入变量模板，自动选中变量名）
- [x] 使用次数统计 + 分组管理（新建/重命名/删除）
- [x] IPC 全链路：db.handler CRUD + snippet_tags 关联 + increment_use
- [ ] 片段导入/导出（延后）
- [ ] 快捷面板 Ctrl+Shift+S（延后）

#### 5.1.3 端口转发 ✅ 已完成
- [x] `PortForwardDialog.vue` — 转发规则配置对话框（主机选择、类型切换、端口输入、等效命令预览+一键复制）
- [x] `port-forward.handler.ts` — 隧道生命周期管理（net.Server + ssh2 forwardOut/forwardIn）
- [x] Local 转发 (-L)：本地端口 → SSH 隧道 → 远程目标
- [x] Remote 转发 (-R)：远程端口 → SSH 隧道 → 本地目标
- [x] SSH 连接复用（优先复用终端 SSH 连接）+ 专用连接（无终端时自动建立）
- [x] 隧道迁移：关闭一个终端时自动迁移到同主机的其他活跃连接
- [x] 自动启动：SSH 连接成功时自动启动 autoStart=true 的规则
- [x] 侧边栏列表：状态指示灯（绿/灰/红）、启停按钮、主机标识（user@addr:port）
- [x] 错误提示：端口占用/权限不足/SSH 连接失败/认证失败等中文提示
- [x] 应用退出清理：stopAllTunnels() + 强制关闭所有 socket
- [x] 主机删除保护：有绑定规则时阻止删除并提示
- [ ] Dynamic 转发 SOCKS5（延后）
- [ ] 流量统计（延后）

#### 5.1.4 设置页面完善 ✅ 已完成
- [x] 终端设置：字体/字号/行高/光标样式/光标闪烁/滚动缓冲区/滚动灵敏度 — 实时预览生效
- [x] 终端行为：右键粘贴/粘贴换行警告/粘贴去尾换行/响铃(AudioContext)/焦点跟随鼠标
- [x] 外观设置：主题切换(暗/亮/跟随系统)/语言切换(中/英/繁)/界面缩放(IPC setZoomFactor)/紧凑模式
- [x] 日志设置：自动录制/录制格式(asciicast/text)/存储目录/文件名模板/时间戳/密码过滤
- [x] 日志清理：单文件大小上限/自动清理/保留天数 + 录制文件列表管理
- [x] 所有设置实时生效（TerminalPane watch settings 变化更新 xterm options）
- [x] 设置启动恢复：缩放/紧凑模式/语言在 App.vue onMounted 中恢复
- [x] 账户设置：资料编辑、修改密码、退出登录、删除账号
- [x] 同步设置：同步状态显示、上次同步时间、手动触发同步、E2EE 加密设置

#### 5.1.6 完整国际化 ✅ 已完成
- [x] 17 个 Vue 组件全部替换为 $t() 调用
- [x] 3 个语言包（zh-CN/en/zh-TW）各约 400 个 key
- [x] 切换语言即时生效，启动时恢复保存的语言

#### 5.1.5 云同步对接 ✅ 已完成
- [x] 前端 `src/renderer/services/api.ts` — HTTP 客户端封装，SaaS + 自托管双模式（可配置服务器 URL）
- [x] `auth.store.ts` 对接真实后端 API（login/register/logout/delete account，替换 mock）
- [x] JWT 滑动续期：每次应用启动时自动续期（7 天滑动窗口）
- [x] 同步引擎客户端：`src/main/services/sync-engine.ts`
  - 增量同步（push/pull，since 游标）
  - 冲突检测与解决（Last-Write-Wins）
  - 删除追踪（软删除同步）
  - 可配置自动同步间隔
- [x] WebSocket 客户端：接收服务端实时推送
- [x] E2EE 加密层：libsodium Argon2id 密钥派生 + XSalsa20-Poly1305 加密同步数据（密码、密钥内容）
- [x] 服务器 URL 配置 UI：登录页服务器设置入口 + 账户设置中服务器切换
- [x] `ecosystem.config.cjs` — PM2 生产部署配置

---

### P2: 进阶功能（预计工作量：大）

#### 5.2.1 SSH 密钥管理 ✅ 已完成
- [x] `key.handler.ts` — 密钥 IPC handler（generate/import/list/delete/deploy）
- [x] `key-manager.ts` — 密钥生成服务（Ed25519/RSA/ECDSA，通过 ssh2 utils）
- [x] `keys.store.ts` — 密钥状态管理（CRUD）
- [x] `KeysSettings.vue` — 密钥管理设置页（列表/生成/导入/复制公钥/复制部署命令/部署到远程主机）
- [x] `shared/types/key.ts` — 密钥类型定义
- [x] 密钥生成：Ed25519 / RSA / ECDSA，可选密码保护
- [x] 密钥导入：文件选择 + 文本粘贴
- [x] 复制公钥到剪贴板
- [x] 一键复制 `ssh-authorized-keys` 部署命令
- [x] 部署到远程主机（ssh-copy-id 逻辑，追加到 ~/.ssh/authorized_keys）
- [x] 主机配置对话框集成：SSH 认证方式可从密钥下拉列表选择
- [x] 密钥随云同步跨设备同步（keys 表纳入同步范围）
- [ ] SSH Agent 集成（加载/卸载密钥到系统 agent）— 延后

#### 5.2.2 已知主机管理
- [ ] `KnownHostsView.vue` — 已知主机指纹列表
- [ ] SSH 连接时主机密钥验证对话框（首次连接、指纹变更警告）
- [ ] 添加/删除已知主机
- [ ] 指纹算法展示（SHA256/MD5）

#### 5.2.3 Vault 密钥库 ✅ 已完成
- [x] `vault.handler.ts` — Vault IPC handler（CRUD + 密码生成）
- [x] `vault-service.ts` — Vault 核心服务
- [x] `vault.store.ts` — Vault 状态管理（CRUD）
- [x] `VaultSettings.vue` — Vault 设置页（条目列表/新建/编辑/删除/复制密码自动清除剪贴板）
- [x] `shared/types/vault.ts` — Vault 类型定义
- [x] 无主密码设计（简化方案，依赖系统账户安全）
- [x] 条目 CRUD：password / API key / token 三种类型，含名称/用户名/密码/备注/关联主机
- [x] 密码生成器：可配置长度、字符集
- [x] 复制密码后自动清除剪贴板（30 秒超时）
- [x] 主机配置对话框集成：密码字段可从 Vault 条目选择填充
- [x] Vault 条目随云同步跨设备同步（vault_entries 表纳入同步范围）
- [x] E2EE 加密：启用端对端加密时 Vault 条目密码字段同样加密传输
- [ ] 自动填充到终端（Ctrl+Shift+V）— 延后

#### 5.2.4 会话录制与回放
- [x] 录制：终端输出流 + 时间戳写入文件（asciicast v2 格式）✅ 已实现
- [x] 录制文件管理（列表、删除、打开文件夹）✅ 已实现
- [x] 实现 `src/main/ipc/log.handler.ts`（7 个 channel：start/stop/isRecording/list/delete/replay/openDirectory）✅ 已实现
- [x] 回放器组件：播放/暂停/倍速(0.5x-10x)/进度条/跳转 ✅ 已实现（SessionReplayDialog.vue）
- [ ] 录制导出

#### 5.2.5 日志与审计
- [ ] `LogsAuditView.vue` — 操作日志列表 + 过滤
- [ ] 记录关键操作（登录、连接、文件传输、配置变更）
- [ ] 日志导出（CSV/JSON）
- [ ] 自动清理策略（保留天数可配置）

---

### P3: 体验优化（预计工作量：中等）

#### 5.3.1 终端自动补全
- [ ] 命令历史补全（上下箭头 + Ctrl+R 搜索）
- [ ] 路径补全（Tab 触发 SFTP ls 查询远程路径）
- [ ] 命令片段内联建议（输入时模糊匹配已保存片段）

#### 5.3.2 命令面板完善 ✅ 已完成
- [x] `CommandPalette.vue` 完整实现（6 类搜索：命令/主机/片段/终端/端口转发/设置）
- [x] 模糊搜索 + 分组显示 + 类别图标 + 键盘导航
- [x] 片段执行（含变量对话框）、主机连接、终端打开、设置跳转
- [x] 最近使用排序（片段按 useCount 降序）

#### 5.3.3 主题自定义 🔧 部分完成
- [x] 10 个预设终端主题（Dracula/Monokai/Nord/Solarized/One Dark/Gruvbox/Tokyo Night 等）
- [x] 设置页主题选择器（颜色色块预览 + 实时切换）
- [ ] 主题编辑器 UI（实时预览）
- [ ] 导入/导出自定义主题（JSON 格式）
- [ ] 终端配色方案独立配置
- [ ] 预设主题库（Dracula, Monokai, Solarized, Nord, One Dark 等）

#### 5.3.4 快捷键自定义
- [ ] 快捷键设置页面
- [ ] 冲突检测
- [ ] 恢复默认
- [ ] 快捷键方案导入/导出

#### 5.3.5 数据管理
- [ ] 数据导入（从 Termius / PuTTY / SecureCRT / OpenSSH config 导入）
- [ ] 数据导出（JSON/加密压缩包）
- [ ] 本地备份/恢复
- [ ] 数据清理（缓存、日志、历史）

#### 5.3.6 应用更新
- [ ] 自动检查更新（electron-updater）
- [ ] 更新提示对话框（版本号、更新日志）
- [ ] 后台下载 + 安装重启
- [ ] 更新频道（稳定版/测试版）

#### 5.3.7 系统集成
- [ ] 系统托盘（最小化到托盘、快速连接菜单）
- [ ] URI Scheme（`sterminal://connect?host=xxx`）
- [ ] CLI 集成（`sterminal ssh user@host`）
- [ ] 深色/浅色模式跟随系统

---

## 六、技术债务清单

| 类别 | 项目 | 优先级 |
|------|------|--------|
| 测试 | 后端 API 单元测试（Vitest） | 高 |
| 测试 | 前端组件测试（Vitest + Vue Test Utils） | 高 |
| 测试 | E2E 测试（Playwright） | 中 |
| 安全 | 后端自定义错误码体系（40100 等） | 中 |
| 安全 | 后端登录锁定参数对齐 PRD（5次/15分钟） | 低 |
| 安全 | CSP (Content Security Policy) 配置 | 中 |
| 安全 | Electron sandbox 模式完善 | 中 |
| 性能 | xterm.js WebGL Addon 启用（GPU加速渲染） | 中 |
| 性能 | 虚拟滚动优化（大量主机/片段列表） | 低 |
| 构建 | Electron 主进程 TypeScript 编译配置 | 高 |
| 构建 | electron-builder 多平台打包 CI/CD | 高 |
| 构建 | node-pty 原生模块预编译（electron-rebuild） | 高 |
| ~~代码~~ | ~~前端 mock 数据替换为真实 IPC 调用~~ | ✅ 已完成 |
| 代码 | TypeScript strict 模式全量启用 | 低 |
| 文档 | API 接口文档（Swagger/OpenAPI） | 中 |
| 文档 | 开发者贡献指南 | 低 |

---

## 七、依赖清单

### 后端 (packages/server)
```
express, better-sqlite3, argon2, jsonwebtoken, passport, passport-github2,
passport-google-oauth20, ws, nodemailer, pino, pino-pretty, zod, cors,
express-rate-limit, multer, uuid
```

### 前端 (packages/client)
```
vue, vue-router, pinia, element-plus, @element-plus/icons-vue,
@xterm/xterm, @xterm/addon-fit, @xterm/addon-search, @xterm/addon-web-links, @xterm/addon-webgl,
node-pty, ssh2, better-sqlite3, libsodium-wrappers-sumo,
uuid, vue-i18n
```

### 开发依赖
```
typescript, vite, @vitejs/plugin-vue, vue-tsc, sass,
electron, electron-builder,
unplugin-auto-import, unplugin-vue-components,
@types/better-sqlite3, @types/ssh2, @types/uuid, @types/node,
@types/libsodium-wrappers
```
