// 客户端本地数据库建表 SQL（来自架构文档 5.2 节）

export const SCHEMA_SQL = `
-- ============================================================
-- 主机配置
-- ============================================================
CREATE TABLE IF NOT EXISTS hosts (
    id              TEXT PRIMARY KEY,
    label           TEXT,
    address         TEXT NOT NULL,
    port            INTEGER NOT NULL DEFAULT 22,
    protocol        TEXT NOT NULL DEFAULT 'ssh',
    username        TEXT,
    auth_type       TEXT DEFAULT 'password',
    password_enc    TEXT,
    key_id          TEXT REFERENCES keys(id),
    key_passphrase_enc TEXT,
    startup_command TEXT,
    environment     TEXT,
    encoding        TEXT DEFAULT 'UTF-8',
    keepalive_interval INTEGER DEFAULT 60,
    connect_timeout INTEGER DEFAULT 10,
    heartbeat_timeout INTEGER DEFAULT 30,
    compression     INTEGER DEFAULT 0,
    strict_host_key INTEGER DEFAULT 0,
    ssh_version     TEXT DEFAULT 'auto',
    preferred_kex   TEXT,
    preferred_cipher TEXT,
    preferred_mac   TEXT,
    preferred_host_key_algo TEXT,
    proxy_jump_id   TEXT REFERENCES hosts(id),
    proxy_command   TEXT,
    socks_proxy     TEXT,
    http_proxy      TEXT,
    proxy_username  TEXT,
    proxy_password_enc TEXT,
    terminal_theme  TEXT,
    font_family     TEXT,
    font_size       INTEGER,
    cursor_style    TEXT,
    cursor_blink    INTEGER,
    notes           TEXT,
    group_id        TEXT REFERENCES host_groups(id),
    sort_order      INTEGER DEFAULT 0,
    last_connected  TEXT,
    connect_count   INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 主机分组
-- ============================================================
CREATE TABLE IF NOT EXISTS host_groups (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES host_groups(id),
    icon            TEXT,
    color           TEXT,
    sort_order      INTEGER DEFAULT 0,
    collapsed       INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 标签
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    color           TEXT NOT NULL DEFAULT '#6366f1',
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS host_tags (
    host_id         TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    tag_id          TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (host_id, tag_id)
);

-- ============================================================
-- 本地终端配置
-- ============================================================
CREATE TABLE IF NOT EXISTS local_terminals (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL DEFAULT '本地终端',
    icon            TEXT,
    color           TEXT,
    shell           TEXT,
    shell_args      TEXT,
    cwd             TEXT,
    startup_script  TEXT,
    startup_command TEXT,
    script_line_delay INTEGER DEFAULT 100,
    environment     TEXT,
    login_shell     INTEGER DEFAULT 0,
    terminal_theme  TEXT,
    font_family     TEXT,
    font_size       INTEGER,
    cursor_style    TEXT,
    cursor_blink    INTEGER,
    group_id        TEXT REFERENCES local_terminal_groups(id),
    sort_order      INTEGER DEFAULT 0,
    is_default      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS local_terminal_groups (
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
CREATE TABLE IF NOT EXISTS keys (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    key_type        TEXT NOT NULL,
    bits            INTEGER,
    curve           TEXT,
    fingerprint     TEXT NOT NULL,
    public_key      TEXT NOT NULL,
    private_key_enc TEXT NOT NULL,
    passphrase_enc  TEXT,
    comment         TEXT,
    auto_load_agent INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 已知主机
-- ============================================================
CREATE TABLE IF NOT EXISTS known_hosts (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_known_hosts_unique ON known_hosts(host, port, key_type);

-- ============================================================
-- 命令片段
-- ============================================================
CREATE TABLE IF NOT EXISTS snippets (
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

CREATE TABLE IF NOT EXISTS snippet_tags (
    snippet_id      TEXT NOT NULL REFERENCES snippets(id) ON DELETE CASCADE,
    tag             TEXT NOT NULL,
    PRIMARY KEY (snippet_id, tag)
);

CREATE TABLE IF NOT EXISTS snippet_groups (
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
CREATE TABLE IF NOT EXISTS port_forwards (
    id              TEXT PRIMARY KEY,
    name            TEXT,
    type            TEXT NOT NULL,
    host_id         TEXT NOT NULL REFERENCES hosts(id),
    local_bind_addr TEXT DEFAULT '127.0.0.1',
    local_port      INTEGER,
    remote_target_addr TEXT,
    remote_target_port INTEGER,
    remote_bind_addr TEXT DEFAULT '127.0.0.1',
    remote_port     INTEGER,
    local_target_addr TEXT DEFAULT '127.0.0.1',
    local_target_port INTEGER,
    auto_start      INTEGER DEFAULT 0,
    app_start       INTEGER DEFAULT 0,
    group_id        TEXT,
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Vault 凭据
-- ============================================================
CREATE TABLE IF NOT EXISTS vault_entries (
    id              TEXT PRIMARY KEY,
    name_enc        TEXT NOT NULL,
    type            TEXT NOT NULL,
    username_enc    TEXT,
    value_enc       TEXT NOT NULL,
    url_enc         TEXT,
    notes_enc       TEXT,
    tags_enc        TEXT,
    expires_at      TEXT,
    group_id        TEXT,
    sort_order      INTEGER DEFAULT 0,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vault_config (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    master_hash     TEXT NOT NULL,
    salt            TEXT NOT NULL,
    lock_timeout    INTEGER DEFAULT 900
);

-- ============================================================
-- 全局设置（KV 存储）
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 快速连接历史
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_connect_history (
    id              TEXT PRIMARY KEY,
    connection_str  TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 命令历史（补全用）
-- ============================================================
CREATE TABLE IF NOT EXISTS command_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    command         TEXT NOT NULL,
    host_id         TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cmd_history_recent ON command_history(created_at DESC);

-- ============================================================
-- 会话日志索引
-- ============================================================
CREATE TABLE IF NOT EXISTS session_logs (
    id              TEXT PRIMARY KEY,
    host_id         TEXT,
    local_terminal_id TEXT,
    host_label      TEXT,
    file_path       TEXT NOT NULL,
    format          TEXT DEFAULT 'text',
    file_size       INTEGER DEFAULT 0,
    started_at      TEXT NOT NULL,
    ended_at        TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 同步元数据
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_meta (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- ============================================================
-- 自定义终端主题
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_themes (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'dark',
    foreground      TEXT NOT NULL,
    background      TEXT NOT NULL,
    cursor          TEXT NOT NULL,
    selection       TEXT NOT NULL,
    ansi_colors     TEXT NOT NULL,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now')),
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 自定义快捷键
-- ============================================================
CREATE TABLE IF NOT EXISTS keybindings (
    action          TEXT PRIMARY KEY,
    shortcut        TEXT NOT NULL,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SFTP 书签
-- ============================================================
CREATE TABLE IF NOT EXISTS sftp_bookmarks (
    id              TEXT PRIMARY KEY,
    host_id         TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    name            TEXT,
    sync_version    INTEGER DEFAULT 1,
    sync_updated_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- 操作审计日志
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id              TEXT PRIMARY KEY,
    event_type      TEXT NOT NULL,
    category        TEXT NOT NULL,
    summary         TEXT NOT NULL,
    detail          TEXT,
    host_id         TEXT,
    host_label      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);

-- ============================================================
-- 同步删除追踪（本地记录已删除实体，等待推送到服务端）
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_deletes (
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    deleted_at      TEXT DEFAULT (datetime('now')),
    synced          INTEGER DEFAULT 0,
    PRIMARY KEY (entity_type, entity_id)
);
`
