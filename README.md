# STerminal

跨平台桌面终端管理工具，面向开发者和运维工程师。集成 SSH/SFTP 客户端、本地终端管理、密钥管理、端口转发、命令片段等核心能力，提供免费端对端加密云同步服务。

## 技术栈

- **桌面端**: Electron 33 + Vue 3 + TypeScript + Element Plus + Pinia
- **终端**: xterm.js 5 + node-pty (本地) + ssh2 (远程)
- **后端**: Express + SQLite (better-sqlite3) + WebSocket
- **认证**: JWT + Argon2id + OAuth (GitHub/Google)
- **加密**: libsodium-wrappers-sumo (E2EE 云同步，Argon2id 密钥派生 + XSalsa20-Poly1305)
- **测试**: Vitest + happy-dom + better-sqlite3 内存数据库 (274 个测试)
- **CI/CD**: GitHub Actions (typecheck + test + 三平台构建 + GHCR 镜像发布)

## 功能概览

### 终端管理
- 本地终端 (node-pty，多配置管理，默认终端互斥)
- SSH 连接 (密码 / 密钥 / Agent / 交互式认证，5 种方式)
- 多标签页 (新建 / 关闭 / 切换 / 重命名 / 固定 / 拖拽排序)
- 标签页右键菜单 (重启 / 复制 / 固定 / 关闭 / 关闭右侧所有)
- 分屏 (水平 / 垂直递归嵌套，拖拽调整比例)
- 广播模式 (输入同步到当前标签页所有终端)
- 终端内搜索 (Ctrl+F，正则 / 大小写 / 全字匹配)
- 右键智能操作 (有选中 → 复制，无选中 → 粘贴)
- 终端自动补全 (命令历史 + 片段建议，可扩展 provider 架构)
- SSH 连接动画 (3 点脉冲，连接中 → 连接成功自动消失)
- SSH 健康探测 (延迟显示在侧边栏)
- 环境感知终端边框 (生产服务器红色，staging 黄色)
- 远端 OS 检测 (标签页显示 macOS / Windows / Linux 图标)

### SFTP 文件管理
- 双栏文件浏览器 (本地 + 远程，可拖拽调整比例)
- 递归目录上传 / 下载，传输进度实时显示 + 取消
- 文件排序 / 多选 / 重命名 / 右键菜单 / 面包屑导航
- 远程文本文件在线编辑
- SFTP 书签管理

### 命令片段
- CRUD + 分组 + 标签 + 拖拽排序 + 搜索过滤
- 变量占位符 (`${name}` / `${name:default}` / `${name:A|B|C}` / `${!password}`)
- 内置变量 (`${date}` / `${time}` / `${datetime}` / `${timestamp}`)
- 变量填写对话框 (实时预览，密码遮蔽，值记忆)
- 双击执行到当前终端，使用次数统计

### 端口转发
- Local 转发 (-L) / Remote 转发 (-R)，完整隧道管理
- SSH 连接复用 + 专用连接自动建立
- 隧道迁移 (关闭终端时自动切换到同主机其他连接)
- 自动启动 (主机连接时自动启动绑定规则)
- 状态指示灯 (绿色活跃 / 灰色停止 / 红色错误)
- 等效 SSH 命令预览 + 一键复制

### SSH 密钥管理
- 生成 Ed25519 / RSA / ECDSA 密钥对，可选密码保护
- 密钥导入 (文件选择 + 文本粘贴)
- 复制公钥 / 复制部署命令 / 一键部署到远程主机
- 主机配置集成：SSH 认证密钥从密钥库下拉选择

### Vault 密钥库
- 条目类型：password / API key / token
- 密码生成器 (可配置长度和字符集)
- 复制密码后 30 秒自动清除剪贴板
- 主机配置集成：登录密码从 Vault 条目填充

### 操作审计
- 20 种事件类型：SSH 连接/断开/错误、SFTP 上传/下载/删除/创建目录、主机 CRUD、密钥管理、Vault 操作、设置变更、数据导入导出
- 审计日志设置页 (过滤 / 搜索 / 分页)
- 导出 JSON / CSV
- 自动清理 (可配保留天数)

### 会话录制与回放
- asciicast v2 格式录制 (NDJSON)
- 自动录制 / 手动录制
- 回放器：播放 / 暂停 / 倍速(0.5x-10x) / 进度条 / 跳转
- GIF 导出 (带 STerminal 水印)
- 录制文件管理 (列表 / 删除 / 打开目录)

### 设计系统
- 设计 Token 体系 (颜色 / 间距 / 阴影 / 动效 / 布局 / z-index)
- 主题引擎 (WCAG AA 对比度验证，10+ 预设主题，自定义主题 CRUD)
- 动效系统 (spring curves，`prefers-reduced-motion` 自动降级)
- 自定义强调色 (Element Plus 全套变量动态覆盖，深浅色都生效)
- 首次运行向导 (3 步：导入 SSH 配置 → 选主题 → 开始)
- 功能发现提示 (一次性 tooltip)
- 复制确认微动画 (图标切换替代 toast)

### 快捷键
- 可自定义快捷键 (设置页 + 冲突检测 + 恢复默认)
- 命令面板 (Ctrl+P 搜索主机 / 片段 / 终端 / 端口转发 / 设置 / 命令)
- `CmdOrCtrl` 跨平台支持

### 云同步
- 端对端加密 (libsodium，Argon2id 密钥派生 + XSalsa20-Poly1305)
- 增量同步 (push/pull + 乐观锁 + Last-Write-Wins)
- WebSocket 实时推送
- 同步范围：主机 / 片段 / 设置 / 端口转发 / 密钥 / Vault / 主题 / 快捷键
- 可配置服务器 (官方云服务或自托管后端)

### 系统集成
- 系统托盘 (最小化到托盘，快速连接最近 10 台主机，紫色 S 品牌图标)
- 自动更新 (electron-updater，GitHub Releases，通知栏下载 + 重启安装)
- URI Scheme (`sterminal://connect?name=prod-server` 深度链接，右键主机复制链接)
- CLI 命令行工具 (`sterminal ssh user@host`，设置页一键安装到 PATH)
- 完整国际化 (简体中文 / English / 繁體中文，即时切换)
- 平台适配 (macOS 交通灯 / Windows 标题栏覆盖 / Linux)
- 数据管理 (OpenSSH config 导入 / JSON 备份导出导入 / 清除数据)
- 关于页面 (版本号 + 完整功能概览 + GitHub / 反馈链接)

## 项目结构

```
sterminal/
├── packages/
│   ├── client/          # Electron 桌面客户端
│   │   ├── bin/             # CLI 工具 (sterminal 命令)
│   │   ├── src/
│   │   │   ├── main/        # 主进程 (IPC, PTY, SSH, DB, 审计, 更新, 托盘)
│   │   │   ├── preload/     # contextBridge 预加载脚本
│   │   │   ├── renderer/    # Vue 渲染进程 (views, components, stores)
│   │   │   └── shared/      # 共享类型、常量、工具函数
│   │   ├── vitest.config.ts # 测试配置
│   │   └── vite.config.ts
│   └── server/          # 同步服务后端
│       ├── Dockerfile               # 多阶段镜像（builder + runtime）
│       ├── docker-entrypoint.sh     # entrypoint：chown 挂载卷 + 降权
│       ├── docker-compose.yml       # 开发：本地 build
│       ├── docker-compose.prod.yml  # 生产：拉 GHCR 镜像
│       ├── ecosystem.config.cjs     # PM2 进程配置
│       └── src/
│           ├── controllers/
│           ├── services/
│           ├── middleware/      # auth / validate / rate-limit / error-handler
│           ├── routes/
│           ├── validators/      # Zod schema
│           ├── websocket/
│           ├── database/        # connection + migrations
│           ├── utils/           # error-codes, jwt, hash, logger
│           └── __tests__/       # vitest 单元 + supertest API
├── .github/
│   └── workflows/
│       ├── build.yml    # CI: typecheck (vue + main) + 客户端/服务端测试 + 三平台构建
│       └── release.yml  # 发布: tag 触发 → Electron 安装包 + Docker 镜像（GHCR）
└── docs/
    ├── PRD.md           # 产品需求文档
    ├── ARCHITECTURE.md  # 系统架构文档
    └── PROGRESS.md      # 开发进展记录
```

## 环境要求

- Node.js >= 20.0.0
- npm >= 9.0.0
- Python 3 (node-pty 编译依赖)
- 构建工具链:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Windows: Visual Studio Build Tools (`npm install -g windows-build-tools`)
  - Linux: `build-essential`, `python3`

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/ssssmy/sterminal.git
cd sterminal
```

### 2. 安装依赖

```bash
npm install
```

> node-pty 是原生模块，安装时需要编译。如遇编译错误请确保环境要求中的构建工具链已安装。

### 3. 启动客户端 (开发模式)

```bash
npm run client:dev
```

Vite 开发服务器将启动，Electron 窗口会自动打开。

### 4. 启动后端服务 (可选，用于云同步)

```bash
# 配置环境变量
cp packages/server/.env.example packages/server/.env
# 按需修改 .env 中的 JWT_SECRET、SMTP、OAuth 等配置

# 启动服务
npm run server:dev
```

后端服务默认运行在 `http://localhost:3001`。

> 支持官方云服务或自托管：后端代码完全开源，可部署到任意服务器。在客户端设置页配置服务器地址即可切换。

## 测试

总计 **274 个测试**：客户端 213 + 服务端 61。

```bash
# 客户端
cd packages/client
npm test                    # 全部（含 Electron 主进程集成测试，自动处理 better-sqlite3 ABI 切换）
npm run test:unit           # 仅渲染层单元测试 (无需 rebuild)
npm run typecheck           # 渲染层 vue-tsc
npm run typecheck:main      # Electron 主进程独立 tsc

# 服务端
cd packages/server
npm test                    # auth / sync / API 全部
```

测试覆盖：
- **客户端 213**：单元（快捷键解析、WCAG 对比度、设计 Token、片段变量、SSH 配置解析、服务器 URL、GIF 导出、剪贴板反馈、Pinia stores）+ 集成（Settings / Keybindings / Themes / Hosts / Snippets handler，真实 SQLite 内存数据库）
- **服务端 61**：service 层（auth / sync 含 push / pull / full / reset / encryption）+ API 层（supertest 跑 31 个端点用例，覆盖错误码 40101 / 40901 / 42901 / 40003 / 40004 / 41501 / 40499 等）

## 构建打包

```bash
# 仅编译 (不打安装包)
npm run client:build

# macOS .dmg (arm64 + x64)
npm run client:pack:mac

# Windows .exe 安装版 + .zip 免安装版
npm run client:pack:win

# Linux .AppImage + .deb
npm run client:pack:linux

# 三平台一起构建
npm run client:pack:all
```

安装包输出到 `packages/client/release/`。

## 后端部署

### 方式 A：Docker（推荐）

镜像每次 release tag 自动构建并推送到 [GHCR](https://github.com/users/ssssmy/packages/container/sterminal-server)：`ghcr.io/ssssmy/sterminal-server:{版本号, 0.x, latest}`。

**生产部署（拉镜像，秒级启动）**：

```bash
cd packages/server
cp .env.example .env       # 修改 JWT_SECRET、SMTP、OAuth 等

npm run docker:prod:up     # 拉 latest 镜像 + 启动
npm run docker:prod:logs   # 看日志
npm run docker:prod:upgrade # 一键升级（pull + recreate）
```

线上推荐在 `.env` 锁定版本（`IMAGE_TAG=0.1.2`），避免追 latest 意外升级。

**开发模式（本地 build）**：

```bash
npm run docker:up          # 默认带 --build
npm run docker:logs
npm run docker:down
```

国内 / 防火墙网络可在 `.env` 加镜像源加速 build：
```
APT_MIRROR=http://mirrors.aliyun.com
NPM_REGISTRY=https://registry.npmmirror.com
```

数据持久化卷：`./data`（SQLite）、`./uploads`（头像等）。Healthcheck 走 `/health`，非 root `app` 用户运行（entrypoint 自动 chown 挂载卷）。

### 方式 B：PM2（裸机）

```bash
cd packages/server
npm install
npm run build
npm run pm2:start    # 使用 PM2 启动服务
npm run pm2:stop     # 停止服务
npm run pm2:restart  # 重启服务
npm run pm2:logs     # 查看日志
```

## CLI 命令行工具

安装：设置 → 数据管理 → 命令行工具 → 安装 CLI

```bash
sterminal ssh root@10.0.0.1              # SSH 连接
sterminal ssh deploy@prod.com -p 2222    # 指定端口
sterminal sftp admin@files.com           # SFTP 文件管理
sterminal connect "Production Server"    # 按名称连接已保存主机
sterminal list                           # 打开应用显示主机列表
sterminal open                           # 打开/聚焦窗口
sterminal new                            # 新建本地终端
sterminal version                        # 显示版本
sterminal help                           # 帮助信息
```

## URI Scheme 深度链接

```
sterminal://connect?name=prod-server     # 按名称连接
sterminal://connect?host=10.0.0.1&port=22&user=root  # 按地址连接
sterminal://new-terminal                 # 新建终端
sterminal://open                         # 打开窗口
```

> 在侧边栏右键主机 → "复制连接链接" 可快速获取分享链接。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` / `Cmd+T` | 新建标签页 |
| `Ctrl+W` / `Cmd+W` | 关闭当前标签页 |
| `Ctrl+P` / `Cmd+P` | 打开命令面板 |
| `Ctrl+F` / `Cmd+F` | 终端内搜索 |
| `Ctrl+Shift+D` | 水平分屏 |
| 右键 (有选中) | 复制选中文本 |
| 右键 (无选中) | 从剪贴板粘贴 |

> 所有快捷键可在设置页自定义，支持冲突检测和恢复默认。

## 开发路线

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 MVP | 本地终端、SSH、主机管理、多标签/分屏 | ✅ 已完成 |
| P0+ | 广播模式、会话录制、终端搜索、远端OS检测 | ✅ 已完成 |
| P1 核心增强 | SFTP、命令片段、端口转发、设置、i18n、云同步 | ✅ 已完成 |
| P2 进阶功能 | 密钥管理、Vault、回放器、操作审计（20种事件） | ✅ 已完成 |
| P3 体验优化 | 自动补全、命令面板、主题引擎、快捷键、数据管理、自动更新、系统托盘、CLI、URI Scheme、关于页 | ✅ 已完成 |
| Design-First | 设计 Token、动效系统、首次向导、环境感知边框、复制反馈 | ✅ 已完成 |
| 测试 | 274 个单元 + 集成 + supertest API 测试 | ✅ 已完成 |
| CI/CD | GitHub Actions 三平台构建 + Windows 免安装版 + tag 自动发布 + GHCR 镜像 | ✅ 已完成 |
| 后端部署 | Docker 多阶段镜像 + docker-compose + GHCR 自动发布 | ✅ 已完成 |

详见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## License

MIT
