#!/bin/sh
# Entrypoint: 以 root 启动，先把挂载进来的数据 / 上传目录改成 app 用户拥有，
# 然后用 runuser 降权到非特权用户跑 node。
#
# 解决的问题：volume 挂载到容器后属主沿用宿主机（通常是 root），
# 容器里的 app 用户写不进去，better-sqlite3 报 SQLITE_CANTOPEN。

set -e

DATA_DIR="$(dirname "${DB_PATH:-/app/packages/server/data/sterminal.db}")"
UPLOAD_DIR="${UPLOAD_DIR:-/app/packages/server/uploads}"

if [ "$(id -u)" = "0" ]; then
    mkdir -p "$DATA_DIR" "$UPLOAD_DIR"
    # 仅 fix 顶层属主即可（递归忽略错误，避免某些 mount 类型 chown 受限时整体失败）
    chown -R app:app "$DATA_DIR" "$UPLOAD_DIR" 2>/dev/null || \
        chown app:app "$DATA_DIR" "$UPLOAD_DIR" 2>/dev/null || true

    exec runuser -u app -- "$@"
fi

# 已经是非 root（例如用户用 docker run --user=... 自定义）：直接执行
exec "$@"
