// IPC Channel 常量定义
// R→M: Renderer → Main, M→R: Main → Renderer

// ===== SSH 相关 =====
export const IPC_SSH = {
  CONNECT: 'ssh:connect',
  DISCONNECT: 'ssh:disconnect',
  DATA: 'ssh:data',
  WRITE: 'ssh:write',
  RESIZE: 'ssh:resize',
  STATUS: 'ssh:status',
  ERROR: 'ssh:error',
  HOST_VERIFY: 'ssh:host-verify',
  OS_DETECTED: 'ssh:os-detected',
  HEALTH: 'ssh:health',
  AGENT_CHECK: 'ssh:agent-check',
} as const

// ===== PTY 本地终端 =====
export const IPC_PTY = {
  SPAWN: 'pty:spawn',
  DATA: 'pty:data',
  WRITE: 'pty:write',   // R→M: 渲染进程向 PTY 发送输入数据
  RESIZE: 'pty:resize',
  KILL: 'pty:kill',
  EXIT: 'pty:exit',
} as const

// ===== SFTP 文件操作 =====
export const IPC_SFTP = {
  OPEN: 'sftp:open',
  LIST: 'sftp:list',
  STAT: 'sftp:stat',
  MKDIR: 'sftp:mkdir',
  RM: 'sftp:rm',
  RENAME: 'sftp:rename',
  CHMOD: 'sftp:chmod',
  CHOWN: 'sftp:chown',
  UPLOAD: 'sftp:upload',
  DOWNLOAD: 'sftp:download',
  TRANSFER_PROGRESS: 'sftp:transfer-progress',
  TRANSFER_COMPLETE: 'sftp:transfer-complete',
  TRANSFER_CANCEL: 'sftp:transfer-cancel',
  READ_FILE: 'sftp:read-file',
  WRITE_FILE: 'sftp:write-file',
} as const

export const IPC_LOCAL_FS = {
  LIST: 'local-fs:list',
  HOME: 'local-fs:home',
} as const

// ===== 数据库 CRUD =====
export const IPC_DB = {
  // 主机
  HOSTS_LIST: 'db:hosts:list',
  HOSTS_GET: 'db:hosts:get',
  HOSTS_CREATE: 'db:hosts:create',
  HOSTS_UPDATE: 'db:hosts:update',
  HOSTS_DELETE: 'db:hosts:delete',
  HOSTS_BATCH_MOVE: 'db:hosts:batch-move',
  HOSTS_BATCH_TAG: 'db:hosts:batch-tag',
  // 主机分组
  HOST_GROUPS_LIST: 'db:host-groups:list',
  HOST_GROUPS_CREATE: 'db:host-groups:create',
  HOST_GROUPS_UPDATE: 'db:host-groups:update',
  HOST_GROUPS_DELETE: 'db:host-groups:delete',
  // 本地终端
  LOCAL_TERMINALS_LIST: 'db:local-terminals:list',
  LOCAL_TERMINALS_CREATE: 'db:local-terminals:create',
  LOCAL_TERMINALS_UPDATE: 'db:local-terminals:update',
  LOCAL_TERMINALS_DELETE: 'db:local-terminals:delete',
  // 本地终端分组
  LOCAL_TERMINAL_GROUPS_LIST: 'db:local-terminal-groups:list',
  LOCAL_TERMINAL_GROUPS_CREATE: 'db:local-terminal-groups:create',
  LOCAL_TERMINAL_GROUPS_UPDATE: 'db:local-terminal-groups:update',
  LOCAL_TERMINAL_GROUPS_DELETE: 'db:local-terminal-groups:delete',
  // 命令片段
  SNIPPETS_LIST: 'db:snippets:list',
  SNIPPETS_CREATE: 'db:snippets:create',
  SNIPPETS_UPDATE: 'db:snippets:update',
  SNIPPETS_DELETE: 'db:snippets:delete',
  SNIPPETS_INCREMENT_USE: 'db:snippets:increment-use',
  SNIPPETS_EXPORT: 'db:snippets-export',
  SNIPPETS_IMPORT: 'db:snippets-import',
  // 命令片段分组
  SNIPPET_GROUPS_LIST: 'db:snippet-groups:list',
  SNIPPET_GROUPS_CREATE: 'db:snippet-groups:create',
  SNIPPET_GROUPS_UPDATE: 'db:snippet-groups:update',
  SNIPPET_GROUPS_DELETE: 'db:snippet-groups:delete',
  // 端口转发
  PORT_FORWARDS_LIST: 'db:port-forwards:list',
  PORT_FORWARDS_CREATE: 'db:port-forwards:create',
  PORT_FORWARDS_UPDATE: 'db:port-forwards:update',
  PORT_FORWARDS_DELETE: 'db:port-forwards:delete',
  // SSH 密钥
  KEYS_LIST: 'db:keys:list',
  KEYS_CREATE: 'db:keys:create',
  KEYS_UPDATE: 'db:keys:update',
  KEYS_DELETE: 'db:keys:delete',
  // 已知主机
  KNOWN_HOSTS_LIST: 'db:known-hosts:list',
  KNOWN_HOSTS_CREATE: 'db:known-hosts:create',
  KNOWN_HOSTS_DELETE: 'db:known-hosts:delete',
  // Vault
  VAULT_LIST: 'db:vault:list',
  VAULT_CREATE: 'db:vault:create',
  VAULT_UPDATE: 'db:vault:update',
  VAULT_DELETE: 'db:vault:delete',
  // 标签
  TAGS_LIST: 'db:tags:list',
  TAGS_CREATE: 'db:tags:create',
  TAGS_UPDATE: 'db:tags:update',
  TAGS_DELETE: 'db:tags:delete',
  // 设置
  SETTINGS_GET: 'db:settings:get',
  SETTINGS_GET_ALL: 'db:settings:get-all',
  SETTINGS_SET: 'db:settings:set',
  SETTINGS_RESET: 'db:settings:reset',
  // 自定义主题
  THEMES_LIST: 'db:themes:list',
  THEMES_CREATE: 'db:themes:create',
  THEMES_UPDATE: 'db:themes:update',
  THEMES_DELETE: 'db:themes:delete',
  // 快捷键
  KEYBINDINGS_LIST: 'db:keybindings:list',
  KEYBINDINGS_SET: 'db:keybindings:set',
  // 快速连接历史
  QUICK_HISTORY_LIST: 'db:quick-history:list',
  QUICK_HISTORY_ADD: 'db:quick-history:add',
  // 命令历史
  CMD_HISTORY_LIST: 'db:cmd-history:list',
  CMD_HISTORY_ADD: 'db:cmd-history:add',
  // 日志
  LOGS_LIST: 'db:logs:list',
  LOGS_DELETE: 'db:logs:delete',
  // SFTP 书签
  SFTP_BOOKMARKS_LIST: 'db:sftp-bookmarks:list',
  SFTP_BOOKMARKS_CREATE: 'db:sftp-bookmarks:create',
  SFTP_BOOKMARKS_DELETE: 'db:sftp-bookmarks:delete',
} as const

// ===== Vault =====
export const IPC_VAULT = {
  UNLOCK: 'vault:unlock',
  LOCK: 'vault:lock',
  SETUP: 'vault:setup',
  GENERATE_PASSWORD: 'vault:generate-password',
  IS_SETUP: 'vault:is-setup',
} as const

// ===== SSH 密钥管理 =====
export const IPC_KEY = {
  GENERATE: 'key:generate',
  IMPORT: 'key:import',
  DEPLOY: 'key:deploy',
  AGENT_LOAD: 'key:agent-load',
  AGENT_UNLOAD: 'key:agent-unload',
  AGENT_LIST: 'key:agent-list',
} as const

// ===== 端口转发隧道 =====
export const IPC_PORT_FORWARD = {
  START: 'port-forward:start',
  STOP: 'port-forward:stop',
  STOP_ALL: 'port-forward:stop-all',
  STATUS: 'port-forward:status',
  LIST_ACTIVE: 'port-forward:list-active',
} as const

// ===== 同步 =====
export const IPC_SYNC = {
  START: 'sync:start',
  STOP: 'sync:stop',
  SYNC_NOW: 'sync:sync-now',
  STATUS: 'sync:status',
  STATUS_CHANGED: 'sync:status-changed',
  SET_ENCRYPTION: 'sync:set-encryption',
  CLEAR_ENCRYPTION: 'sync:clear-encryption',
  HAS_ENCRYPTION: 'sync:has-encryption',
  GET_SALT: 'sync:get-salt',
  SET_AUTO_INTERVAL: 'sync:set-auto-interval',
  DATA_CHANGED: 'sync:data-changed',
} as const

// ===== 会话日志 =====
export const IPC_LOG = {
  START: 'log:start',
  STOP: 'log:stop',
  IS_RECORDING: 'log:is-recording',
  LIST: 'log:list',
  DELETE: 'log:delete',
  REPLAY: 'log:replay',
  OPEN_DIRECTORY: 'log:open-directory',
  EXPORT_GIF: 'log:export-gif',
  AUDIT_LIST: 'log:audit-list',
  AUDIT_EXPORT: 'log:audit-export',
  AUDIT_CLEAN: 'log:audit-clean',
  AUDIT_CLEAR: 'log:audit-clear',
} as const

// ===== 系统操作 =====
export const IPC_SYSTEM = {
  TRAY_ACTION: 'system:tray-action',
  DEEP_LINK: 'system:deep-link',
  CHECK_UPDATE: 'system:check-update',
  DOWNLOAD_UPDATE: 'system:download-update',
  INSTALL_UPDATE: 'system:install-update',
  UPDATE_STATUS: 'system:update-status',
  GET_SHELL_LIST: 'system:get-shell-list',
  CLIPBOARD_CLEAR: 'system:clipboard-clear',
  OPEN_EXTERNAL: 'system:open-external',
  OPEN_PATH: 'system:open-path',
  IMPORT_HOSTS: 'system:import-hosts',
  EXPORT_HOSTS: 'system:export-hosts',
  BACKUP: 'system:backup',
  RESTORE: 'system:restore',
  INSTALL_CLI: 'system:install-cli',
  UNINSTALL_CLI: 'system:uninstall-cli',
  CHECK_CLI: 'system:check-cli',
  PING: 'system:ping',
} as const

// ===== 服务器配置 =====
export const IPC_SERVER = {
  GET_URL: 'server:get-url',
  SET_URL: 'server:set-url',
} as const

// ===== 窗口管理 =====
export const IPC_WINDOW = {
  NEW: 'window:new',
  MERGE: 'window:merge',
  SET_TITLE_BAR_OVERLAY: 'window:set-title-bar-overlay',
  SET_ZOOM: 'window:set-zoom',
} as const
