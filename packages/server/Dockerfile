# syntax=docker/dockerfile:1.6
#
# STerminal 后端 API Docker 镜像（多阶段构建）
#
# 构建命令（必须以仓库根作为 build context，monorepo workspaces 需要根 lockfile）：
#   docker build -f packages/server/Dockerfile -t sterminal-server:latest .
#
# 运行命令：
#   docker run --rm -p 3001:3001 \
#     -v $(pwd)/data:/app/packages/server/data \
#     -v $(pwd)/uploads:/app/packages/server/uploads \
#     -e JWT_SECRET=change-me \
#     sterminal-server:latest
#
# 国内 / 防火墙网络可通过 build arg 切换 apt 镜像源（默认走 Debian 官方）
# 例：--build-arg APT_MIRROR=https://mirrors.aliyun.com  或者
#     --build-arg APT_MIRROR=https://mirrors.tuna.tsinghua.edu.cn
ARG APT_MIRROR=""

# 同样允许切换 npm 镜像（避免国内 npmjs.com 被节流）
ARG NPM_REGISTRY=""

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

ARG APT_MIRROR
ARG NPM_REGISTRY

WORKDIR /repo

# 切 apt 源（如果传了 APT_MIRROR）
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -ri "s#https?://deb\\.debian\\.org/debian-security#${APT_MIRROR}/debian-security#g" /etc/apt/sources.list.d/debian.sources && \
        sed -ri "s#https?://deb\\.debian\\.org/debian#${APT_MIRROR}/debian#g" /etc/apt/sources.list.d/debian.sources; \
    fi

# 切 npm 源（如果传了 NPM_REGISTRY）
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

# 编译 better-sqlite3 / argon2 等原生模块所需的工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

# 1) 先复制 manifest（最大化层缓存：源码改动时不重新装依赖）
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/package.json

# 2) 安装 server 工作区的全部依赖（含 dev，TypeScript 编译要用）
RUN npm ci --workspace=packages/server --include-workspace-root

# 3) 复制源码并编译
COPY packages/server/tsconfig.json packages/server/tsconfig.json
COPY packages/server/src packages/server/src
RUN npm run build --workspace=packages/server

# 4) 重新安装仅生产依赖（保证原生模块为该镜像的 ABI 重新编译，并丢弃 dev 依赖）
RUN rm -rf node_modules packages/server/node_modules \
    && npm ci --workspace=packages/server --omit=dev --include-workspace-root \
    && npm cache clean --force


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Runtime
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ARG APT_MIRROR

# 切 apt 源（如果传了 APT_MIRROR）
RUN if [ -n "$APT_MIRROR" ]; then \
        sed -ri "s#https?://deb\\.debian\\.org/debian-security#${APT_MIRROR}/debian-security#g" /etc/apt/sources.list.d/debian.sources && \
        sed -ri "s#https?://deb\\.debian\\.org/debian#${APT_MIRROR}/debian#g" /etc/apt/sources.list.d/debian.sources; \
    fi

# dumb-init 用于正确转发 PID 1 信号（让 SIGTERM 优雅关闭逻辑生效）
RUN apt-get update && apt-get install -y --no-install-recommends \
        dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app \
    && useradd --system --gid app --home /app --shell /bin/false app

WORKDIR /app

# 仅复制运行时必需的内容（prune 后的 node_modules + 编译产物 + manifest）
COPY --from=builder --chown=app:app /repo/package.json /repo/package-lock.json ./
COPY --from=builder --chown=app:app /repo/node_modules ./node_modules
COPY --from=builder --chown=app:app /repo/packages/server/package.json ./packages/server/package.json
COPY --from=builder --chown=app:app /repo/packages/server/node_modules ./packages/server/node_modules
COPY --from=builder --chown=app:app /repo/packages/server/dist ./packages/server/dist

# 数据 / 上传目录（生产请挂载 volume）
RUN mkdir -p /app/packages/server/data /app/packages/server/uploads \
    && chown -R app:app /app/packages/server

USER app
WORKDIR /app/packages/server

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DB_PATH=/app/packages/server/data/sterminal.db \
    UPLOAD_DIR=/app/packages/server/uploads

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
