# STerminal

跨平台桌面终端管理工具，集成 SSH/SFTP 客户端、本地终端多配置管理、分屏、云同步等能力。

## 技术栈

- **桌面端**: Electron + Vue 3 + TypeScript + Element Plus + Pinia
- **终端**: xterm.js + node-pty (本地) + ssh2 (远程)
- **后端**: Express + SQLite (better-sqlite3) + WebSocket
- **认证**: JWT + Argon2id + OAuth (GitHub/Google)

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

## 构建打包

```bash
# 前端类型检查 + 构建
npm run client:build

# 后端编译
npm run server:build
```

## 已实现功能

### P0 MVP
- 登录 / 注册 (前端 UI + 后端 API)
- 本地终端 (node-pty, 多配置管理, 默认终端互斥)
- SSH 连接 (密码 / 密钥 / Agent / 交互式认证)
- 主机管理 (CRUD, 分组, 拖拽排序, 30+ 配置字段)
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
| P1 | SFTP、命令片段、端口转发、云同步对接 | 计划中 |
| P2 | 密钥管理、Vault、录制回放器、审计日志 | 计划中 |
| P3 | 自动补全、主题自定义、快捷键自定义、数据导入导出 | 计划中 |

详见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## License

MIT
