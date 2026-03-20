// 数据库 IPC Handler 注册
// 处理渲染进程对本地 SQLite 数据库的 CRUD 请求

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { dbAll, dbGet, dbRun } from '../services/db'
import { IPC_DB } from '../../shared/types/ipc-channels'
import { DEFAULT_SETTINGS } from '../../shared/constants/defaults'

/**
 * 注册所有数据库相关的 IPC handlers
 */
export function registerDbHandlers(): void {
  registerSettingsHandlers()
  registerLocalTerminalsHandlers()
  registerHostsHandlers()
  registerHostGroupsHandlers()
  registerTagsHandlers()
}

// ===== 设置 =====

function registerSettingsHandlers(): void {
  // 获取设置值，不存在时返回默认值
  ipcMain.handle(IPC_DB.SETTINGS_GET, (_event, key: string) => {
    const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
    if (row) {
      try {
        return JSON.parse(row.value)
      } catch {
        return row.value
      }
    }
    // 返回默认值
    return DEFAULT_SETTINGS[key] ?? null
  })

  // 设置值（UPSERT）
  ipcMain.handle(IPC_DB.SETTINGS_SET, (_event, key: string, value: unknown) => {
    const jsonValue = JSON.stringify(value)
    dbRun(
      `INSERT INTO settings (key, value, sync_updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
      [key, jsonValue]
    )
    return true
  })

  // 重置所有设置
  ipcMain.handle(IPC_DB.SETTINGS_RESET, () => {
    dbRun('DELETE FROM settings')
    return true
  })
}

// ===== 本地终端配置 =====

function registerLocalTerminalsHandlers(): void {
  // 查询所有本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_LIST, () => {
    return dbAll('SELECT * FROM local_terminals ORDER BY sort_order ASC, created_at ASC')
  })

  // 创建本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO local_terminals (id, name, shell, cwd, startup_command, environment, login_shell, is_default, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name || '本地终端',
        data.shell ?? null,
        data.cwd ?? null,
        data.startupCommand ?? null,
        data.environment ? JSON.stringify(data.environment) : null,
        data.loginShell ? 1 : 0,
        data.isDefault ? 1 : 0,
        data.sortOrder ?? 0,
      ]
    )
    return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])
  })

  // 更新本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE local_terminals SET
        name = COALESCE(?, name),
        shell = ?,
        cwd = ?,
        startup_command = ?,
        environment = ?,
        login_shell = COALESCE(?, login_shell),
        is_default = COALESCE(?, is_default),
        sort_order = COALESCE(?, sort_order),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.name ?? null,
        data.shell ?? null,
        data.cwd ?? null,
        data.startupCommand ?? null,
        data.environment ? JSON.stringify(data.environment) : null,
        data.loginShell !== undefined ? (data.loginShell ? 1 : 0) : null,
        data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : null,
        data.sortOrder ?? null,
        id,
      ]
    )
    return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])
  })

  // 删除本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM local_terminals WHERE id = ?', [id])
    return true
  })
}

// ===== 主机配置 =====

function registerHostsHandlers(): void {
  // 查询主机列表（支持按分组过滤）
  ipcMain.handle(IPC_DB.HOSTS_LIST, (_event, groupId?: string) => {
    if (groupId) {
      return dbAll('SELECT * FROM hosts WHERE group_id = ? ORDER BY sort_order ASC', [groupId])
    }
    return dbAll('SELECT * FROM hosts ORDER BY sort_order ASC, created_at ASC')
  })

  // 获取单个主机详情
  ipcMain.handle(IPC_DB.HOSTS_GET, (_event, id: string) => {
    return dbGet('SELECT * FROM hosts WHERE id = ?', [id])
  })

  // 创建主机
  ipcMain.handle(IPC_DB.HOSTS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO hosts (id, label, address, port, protocol, username, auth_type, password_enc, key_id, key_passphrase_enc, startup_command, encoding, keepalive_interval, connect_timeout, compression, strict_host_key, ssh_version, notes, group_id, proxy_jump_id, socks_proxy, http_proxy, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.label ?? null,
        data.address,
        data.port ?? 22,
        data.protocol ?? 'ssh',
        data.username ?? null,
        data.authType ?? 'password',
        data.password ?? null,
        data.keyId ?? null,
        data.keyPassphrase ?? null,
        data.startupCommand ?? null,
        data.encoding ?? 'utf-8',
        data.keepaliveInterval ?? 60,
        data.connectTimeout ?? 10,
        data.compression ? 1 : 0,
        data.strictHostKey ? 1 : 0,
        data.sshVersion ?? 'auto',
        data.notes ?? null,
        data.groupId ?? null,
        data.proxyJumpId ?? null,
        data.socksProxy ?? null,
        data.httpProxy ?? null,
        data.sortOrder ?? 0,
      ]
    )
    return dbGet('SELECT * FROM hosts WHERE id = ?', [id])
  })

  // 更新主机
  ipcMain.handle(IPC_DB.HOSTS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE hosts SET
        label = COALESCE(?, label),
        address = COALESCE(?, address),
        port = COALESCE(?, port),
        protocol = COALESCE(?, protocol),
        username = COALESCE(?, username),
        auth_type = COALESCE(?, auth_type),
        password_enc = COALESCE(?, password_enc),
        key_id = ?,
        key_passphrase_enc = ?,
        startup_command = ?,
        encoding = COALESCE(?, encoding),
        keepalive_interval = COALESCE(?, keepalive_interval),
        connect_timeout = COALESCE(?, connect_timeout),
        compression = COALESCE(?, compression),
        strict_host_key = COALESCE(?, strict_host_key),
        ssh_version = COALESCE(?, ssh_version),
        notes = ?,
        group_id = ?,
        proxy_jump_id = ?,
        socks_proxy = ?,
        http_proxy = ?,
        sort_order = COALESCE(?, sort_order),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.label ?? null,
        data.address ?? null,
        data.port ?? null,
        data.protocol ?? null,
        data.username ?? null,
        data.authType ?? null,
        data.password ?? null,
        data.keyId ?? null,
        data.keyPassphrase ?? null,
        data.startupCommand ?? null,
        data.encoding ?? null,
        data.keepaliveInterval ?? null,
        data.connectTimeout ?? null,
        data.compression !== undefined ? (data.compression ? 1 : 0) : null,
        data.strictHostKey !== undefined ? (data.strictHostKey ? 1 : 0) : null,
        data.sshVersion ?? null,
        data.notes ?? null,
        data.groupId ?? null,
        data.proxyJumpId ?? null,
        data.socksProxy ?? null,
        data.httpProxy ?? null,
        data.sortOrder ?? null,
        id,
      ]
    )
    return dbGet('SELECT * FROM hosts WHERE id = ?', [id])
  })

  // 删除主机
  ipcMain.handle(IPC_DB.HOSTS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM hosts WHERE id = ?', [id])
    return true
  })
}

// ===== 主机分组 =====

function registerHostGroupsHandlers(): void {
  ipcMain.handle(IPC_DB.HOST_GROUPS_LIST, () => {
    return dbAll('SELECT * FROM host_groups ORDER BY sort_order ASC')
  })

  ipcMain.handle(IPC_DB.HOST_GROUPS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO host_groups (id, name, parent_id, icon, color, sort_order, collapsed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.parentId ?? null, data.icon ?? null, data.color ?? null, data.sortOrder ?? 0, data.collapsed ? 1 : 0]
    )
    return dbGet('SELECT * FROM host_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.HOST_GROUPS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE host_groups SET
        name = COALESCE(?, name),
        parent_id = ?,
        icon = ?,
        color = ?,
        sort_order = COALESCE(?, sort_order),
        collapsed = COALESCE(?, collapsed)
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.icon ?? null, data.color ?? null, data.sortOrder ?? null, data.collapsed !== undefined ? (data.collapsed ? 1 : 0) : null, id]
    )
    return dbGet('SELECT * FROM host_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.HOST_GROUPS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM host_groups WHERE id = ?', [id])
    return true
  })
}

// ===== 标签 =====

function registerTagsHandlers(): void {
  ipcMain.handle(IPC_DB.TAGS_LIST, () => {
    return dbAll('SELECT * FROM tags ORDER BY name ASC')
  })

  ipcMain.handle(IPC_DB.TAGS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      'INSERT INTO tags (id, name, color) VALUES (?, ?, ?)',
      [id, data.name, data.color ?? '#6366f1']
    )
    return dbGet('SELECT * FROM tags WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.TAGS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      'UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?',
      [data.name ?? null, data.color ?? null, id]
    )
    return dbGet('SELECT * FROM tags WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.TAGS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM tags WHERE id = ?', [id])
    dbRun('DELETE FROM host_tags WHERE tag_id = ?', [id])
    return true
  })
}
