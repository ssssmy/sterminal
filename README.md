# STerminal

跨平台桌面终端管理工具，集成 SSH/SFTP 客户端、本地终端多配置管理、分屏、云同步等能力。

## 技术栈

- **桌面端**: Electron + Vue 3 + TypeScript + Element Plus + Pinia
- **终端**: xterm.js + node-pty (本地) + ssh2 (远程)
- **后端**: Express + SQLite (better-sqlite3) + WebSocket
- **认证**: JWT + Argon2id + OAuth (GitHub/Google)
- **加密**: libsodium-wrappers-sumo (端对端加密云同步，Argon2id 密钥派生)

## 项目结构

```
sterminal/
├── packages/
│   ├── client/          # Electron 桌面客户端
│   │   ├── src/
│   │   │   ├── main/        # Electron 主进程 (IPC, PTY, SSH, DB)
│   │   │   ├── preload/     # contextBridge 预加载脚本
│   │   │   ├── renderer/    # Vue 渲染进程 (views, components, stores)
│   │   │   └── shared/      # 共享类型和常量
│   │   └── vite.config.ts
│   └── server/          # 同步服务后端
│       └── src/
│           ├── controllers/
│           ├── services/
│           ├── middleware/
│           ├── routes/
│           ├── websocket/
│           └── database/
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

Vite 开发服务器将启动在 `http://localhost:5173`，Electron 窗口会自动打开。

### 4. 启动后端服务 (可选，用于云同步)

```bash
# 配置环境变量
cp packages/server/.env.example packages/server/.env
# 按需修改 .env 中的 JWT_SECRET、SMTP、OAuth 等配置

# 启动服务
npm run server:dev
```

后端服务默认运行在 `http://localhost:3000`。

> 支持官方云服务或自托管：后端代码完全开源，可部署到任意服务器。在客户端设置页配置服务器地址即可切换。

## 构建打包

```bash
# 前端类型检查 + 构建
npm run client:build

# 后端编译
npm run server:build
```

## 生产部署 (PM2)

```bash
cd packages/server
npm run build
npm run pm2:start    # 使用 PM2 启动服务
npm run pm2:stop     # 停止服务
npm run pm2:restart  # 重启服务
npm run pm2:logs     # 查看日志
```

## 已实现功能

### P0 MVP
- 登录 / 注册 (前端 UI + 后端 API)
- 本地终端 (node-pty, 多配置管理, 默认终端互斥)
- SSH 连接 (密码 / 密钥 / Agent / 交互式认证)
- 主机管理 (CRUD, 分组, 拖拽排序, 30+ 配置字段, 标签唯一性+地址去重校验)
- 多标签页 (新建 / 关闭 / 切换 / 重命名 / 固定)
- 分屏 (水平 / 垂直, 递归嵌套, 拖拽调整比例)
- 侧边栏 (主机树 + 本地终端列表 + 搜索过滤 + 五区域折叠持久化)
- 工具栏 (分屏 / 广播 / 录制 / 搜索 / 全屏)
- 命令面板 (Ctrl+P)
- 暗色 / 亮色主题

### P0+ 增强
- 广播模式 (输入同步到当前标签页所有终端)
- 会话录制 (asciicast v2 格式, 开始/停止/文件管理)
- 终端内搜索 (Ctrl+F, 支持正则/大小写/全字匹配)
- 远端 OS 检测 (SSH 连接后通过 `uname` 检测, 标签页显示 macOS/Windows/Linux 图标)
- 侧边栏折叠持久化 (五个区域的展开/折叠状态保存到数据库)

### P1 核心增强
- SFTP 文件管理 (双栏浏览器, 递归目录上传下载, 传输队列)
  - 远程文件浏览 (排序/多选/重命名/右键菜单/面包屑导航)
  - 远程文本文件编辑器 (在线编辑保存)
  - 传输进度实时显示 + 取消
- 命令片段 (CRUD, 分组, 标签, 拖拽排序, 双击执行, 搜索过滤)
  - 变量占位符 (`${name}` / `${name:default}` / `${name:A|B|C}` / `${!password}`)
  - 内置变量 (`${date}` / `${time}` / `${datetime}` / `${timestamp}`)
  - 变量填写对话框 (实时预览, 密码遮蔽, 值记忆)
- 端口转发 (Local -L / Remote -R, 完整隧道管理)
  - SSH 连接复用 + 专用连接自动建立
  - 隧道迁移 (关闭终端时自动切换到同主机其他连接)
  - 自动启动 (主机连接时自动启动绑定规则)
  - 状态指示 (绿色活跃 / 灰色停止 / 红色错误)
  - 等效 SSH 命令预览 + 一键复制
- SSH 已知主机验证 (首次连接确认指纹, 指纹变更警告, 管理页)
- 设置页面 (终端/外观/日志/已知主机，全部实时生效)
  - 终端：字体/字号/行高/光标/滚动/右键粘贴/响铃/焦点跟随
  - 外观：主题/语言/缩放/紧凑模式
  - 日志：自动录制/格式/目录/文件名模板/大小上限/自动清理
- 完整国际化 (简体中文 / English / 繁體中文，即时切换)
- 命令面板 (Ctrl+P 搜索主机/片段/终端/端口转发/设置/命令，分组显示)
- 会话回放器 (asciicast v2 播放，倍速/进度条/跳转)
- 10 个预设终端主题 (Dracula/Monokai/Nord/Solarized/One Dark/Gruvbox/Tokyo Night 等)
- 用户注册 / 登录 / JWT 自动续期
- 账户管理 (资料编辑 / 修改密码 / 注销账户)
- 端对端加密云同步 (主机 / 片段 / 设置 / 端口转发 / 密钥 / Vault 等，跨设备同步)
- 可配置服务器 (官方云服务或自托管后端，客户端设置页切换服务器地址)

### P2 进阶功能（部分完成）
- SSH 密钥管理 (生成 Ed25519/RSA/ECDSA 密钥对，导入，复制公钥，部署到远程主机)
- Vault 密钥库 (password / API key / token 条目管理，密码生成器，复制后自动清除剪贴板)
- 主机配置集成：SSH 认证密钥从密钥库选择，登录密码从 Vault 填充

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+T` | 新建标签页 |
| `Ctrl+W` | 关闭当前标签页 |
| `Ctrl+P` / `Cmd+P` | 打开命令面板 |
| `Ctrl+F` / `Cmd+F` | 终端内搜索 |

## 开发路线

| 阶段 | 内容 | 状态 |
|------|------|------|
| P0 MVP | 本地终端、SSH、主机管理、多标签/分屏 | 已完成 |
| P0+ | 广播模式、会话录制、终端搜索、远端OS检测、侧边栏折叠 | 已完成 |
| P1 | SFTP、命令片段、端口转发、设置、i18n、已知主机、真实认证、账户管理、云同步 | 大部分完成 |
| P2 | 密钥管理、Vault、审计日志 | 部分完成（密钥管理+Vault已实现，剩日志审计） |
| P3 | 自动补全、快捷键自定义、数据导入导出 | 计划中 |

详见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## License

MIT
