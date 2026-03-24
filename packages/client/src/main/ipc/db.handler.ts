// 数据库 IPC Handler 注册
// 处理渲染进程对本地 SQLite 数据库的 CRUD 请求

import { ipcMain } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { dbAll, dbGet, dbRun } from '../services/db'
import { IPC_DB } from '../../shared/types/ipc-channels'
import { DEFAULT_SETTINGS } from '../../shared/constants/defaults'
import { syncEngine } from '../services/sync-engine'
import { vaultService } from '../services/vault-service'

/**
 * 数据变更后防抖触发同步（5 秒内多次变更只触发一次）
 */
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleSyncAfterChange(): void {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer)
  syncDebounceTimer = setTimeout(() => {
    syncEngine.syncNow().catch(() => {})
  }, 5000)
}

/**
 * 记录实体删除到 sync_deletes 表（供同步引擎推送）
 */
function trackDelete(entityType: string, entityId: string): void {
  dbRun(
    `INSERT OR REPLACE INTO sync_deletes (entity_type, entity_id, deleted_at, synced)
     VALUES (?, ?, datetime('now'), 0)`,
    [entityType, entityId]
  )
  scheduleSyncAfterChange()
}

/**
 * 注册所有数据库相关的 IPC handlers
 */
export function registerDbHandlers(): void {
  registerSettingsHandlers()
  registerLocalTerminalsHandlers()
  registerLocalTerminalGroupsHandlers()
  registerHostsHandlers()
  registerHostGroupsHandlers()
  registerTagsHandlers()
  registerSnippetsHandlers()
  registerSnippetGroupsHandlers()
  registerPortForwardsHandlers()
  registerSftpBookmarksHandlers()
  registerKeysHandlers()
  registerVaultHandlers()
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
  // 不触发同步的本地设置 key
  const LOCAL_ONLY_SETTINGS = ['window.bounds', 'sidebar.collapsedSections']

  ipcMain.handle(IPC_DB.SETTINGS_SET, (_event, key: string, value: unknown) => {
    const jsonValue = JSON.stringify(value)
    dbRun(
      `INSERT INTO settings (key, value, sync_updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
      [key, jsonValue]
    )
    if (!LOCAL_ONLY_SETTINGS.includes(key)) scheduleSyncAfterChange()
    return true
  })

  // 重置所有设置
  ipcMain.handle(IPC_DB.SETTINGS_RESET, () => {
    dbRun('DELETE FROM settings')
    scheduleSyncAfterChange()
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
    // 设为默认时，先清除其他终端的默认标记
    if (data.isDefault) {
      dbRun('UPDATE local_terminals SET is_default = 0 WHERE is_default = 1')
    }
    dbRun(
      `INSERT INTO local_terminals (id, name, shell, cwd, startup_command, environment, login_shell, is_default, sort_order, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.groupId ?? null,
      ]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])
  })

  // 更新本地终端配置
  // 同主机 UPDATE：只更新显式传入的字段，避免意外清空 group_id 等
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    // 设为默认时，先清除其他终端的默认标记
    if (data.isDefault) {
      dbRun('UPDATE local_terminals SET is_default = 0 WHERE is_default = 1 AND id != ?', [id])
    }

    const sets: string[] = []
    const params: unknown[] = []

    if ('name' in data) { sets.push('name = COALESCE(?, name)'); params.push(data.name ?? null) }
    if ('sortOrder' in data) { sets.push('sort_order = COALESCE(?, sort_order)'); params.push(data.sortOrder ?? null) }
    if ('loginShell' in data) { sets.push('login_shell = ?'); params.push(data.loginShell ? 1 : 0) }
    if ('isDefault' in data) { sets.push('is_default = ?'); params.push(data.isDefault ? 1 : 0) }

    // 可为 null 的字段
    const nullableFields: [string, string][] = [
      ['shell', 'shell'], ['cwd', 'cwd'],
      ['startup_command', 'startupCommand'], ['group_id', 'groupId'],
    ]
    for (const [col, key] of nullableFields) {
      if (key in data) {
        sets.push(`${col} = ?`)
        params.push(data[key] ?? null)
      }
    }
    if ('environment' in data) {
      sets.push('environment = ?')
      params.push(data.environment ? JSON.stringify(data.environment) : null)
    }

    if (sets.length === 0) return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])

    sets.push("updated_at = datetime('now'), sync_updated_at = datetime('now'), sync_version = sync_version + 1")
    params.push(id)
    dbRun(`UPDATE local_terminals SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])
  })

  // 删除本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM local_terminals WHERE id = ?', [id])
    trackDelete('local_terminal', id)
    return true
  })
}

// ===== 本地终端分组 =====

function registerLocalTerminalGroupsHandlers(): void {
  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_LIST, () => {
    return dbAll('SELECT * FROM local_terminal_groups ORDER BY sort_order ASC')
  })

  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      'INSERT INTO local_terminal_groups (id, name, parent_id, sort_order) VALUES (?, ?, ?, ?)',
      [id, data.name, data.parentId ?? null, data.sortOrder ?? 0]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM local_terminal_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE local_terminal_groups SET
        name = COALESCE(?, name),
        parent_id = ?,
        sort_order = COALESCE(?, sort_order),
        sync_updated_at = datetime('now'), sync_version = sync_version + 1
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.sortOrder ?? null, id]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM local_terminal_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_DELETE, (_event, id: string) => {
    // 将该分组下的终端移到未分组
    dbRun('UPDATE local_terminals SET group_id = NULL WHERE group_id = ?', [id])
    dbRun('DELETE FROM local_terminal_groups WHERE id = ?', [id])
    trackDelete('local_terminal_group', id)
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
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM hosts WHERE id = ?', [id])
  })

  // 更新主机
  // 注意：group_id 等可为 null 的字段，只有显式传入时才更新，
  // 避免只更新 sortOrder 时意外清空 group_id
  ipcMain.handle(IPC_DB.HOSTS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const params: unknown[] = []

    // COALESCE 字段：未传时保持原值
    const coalesceFields: [string, string][] = [
      ['label', 'label'], ['address', 'address'], ['port', 'port'],
      ['protocol', 'protocol'], ['username', 'username'],
      ['auth_type', 'authType'], ['password_enc', 'password'],
      ['encoding', 'encoding'], ['keepalive_interval', 'keepaliveInterval'],
      ['connect_timeout', 'connectTimeout'], ['ssh_version', 'sshVersion'],
      ['sort_order', 'sortOrder'],
    ]
    for (const [col, key] of coalesceFields) {
      if (key in data) {
        sets.push(`${col} = COALESCE(?, ${col})`)
        params.push(data[key] ?? null)
      }
    }

    // 布尔字段
    if ('compression' in data) { sets.push('compression = ?'); params.push(data.compression ? 1 : 0) }
    if ('strictHostKey' in data) { sets.push('strict_host_key = ?'); params.push(data.strictHostKey ? 1 : 0) }

    // 可为 null 的字段：只有显式传入时才更新（允许设为 null）
    const nullableFields: [string, string][] = [
      ['key_id', 'keyId'], ['key_passphrase_enc', 'keyPassphrase'],
      ['startup_command', 'startupCommand'], ['notes', 'notes'],
      ['group_id', 'groupId'], ['proxy_jump_id', 'proxyJumpId'],
      ['socks_proxy', 'socksProxy'], ['http_proxy', 'httpProxy'],
    ]
    for (const [col, key] of nullableFields) {
      if (key in data) {
        sets.push(`${col} = ?`)
        params.push(data[key] ?? null)
      }
    }

    if (sets.length === 0) return dbGet('SELECT * FROM hosts WHERE id = ?', [id])

    sets.push("updated_at = datetime('now'), sync_updated_at = datetime('now'), sync_version = sync_version + 1")
    params.push(id)
    dbRun(`UPDATE hosts SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM hosts WHERE id = ?', [id])
  })

  // 删除主机
  ipcMain.handle(IPC_DB.HOSTS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM hosts WHERE id = ?', [id])
    trackDelete('host', id)
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
    scheduleSyncAfterChange()
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
        collapsed = COALESCE(?, collapsed),
        sync_updated_at = datetime('now'), sync_version = sync_version + 1
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.icon ?? null, data.color ?? null, data.sortOrder ?? null, data.collapsed !== undefined ? (data.collapsed ? 1 : 0) : null, id]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM host_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.HOST_GROUPS_DELETE, (_event, id: string) => {
    dbRun('UPDATE hosts SET group_id = NULL WHERE group_id = ?', [id])
    dbRun('DELETE FROM host_groups WHERE id = ?', [id])
    trackDelete('host_group', id)
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
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM tags WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.TAGS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color), sync_updated_at = datetime('now'), sync_version = sync_version + 1 WHERE id = ?`,
      [data.name ?? null, data.color ?? null, id]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM tags WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.TAGS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM tags WHERE id = ?', [id])
    dbRun('DELETE FROM host_tags WHERE tag_id = ?', [id])
    trackDelete('tag', id)
    return true
  })
}

// ===== 命令片段 =====

function registerSnippetsHandlers(): void {
  // 查询所有片段（含标签，单次查询避免 N+1）
  ipcMain.handle(IPC_DB.SNIPPETS_LIST, () => {
    const rows = dbAll<Record<string, unknown>>(
      'SELECT * FROM snippets ORDER BY sort_order ASC, created_at ASC'
    )
    // 一次性加载所有标签，按 snippet_id 分组
    const allTags = dbAll<{ snippet_id: string; tag: string }>('SELECT snippet_id, tag FROM snippet_tags')
    const tagMap = new Map<string, string[]>()
    for (const t of allTags) {
      const arr = tagMap.get(t.snippet_id)
      if (arr) arr.push(t.tag)
      else tagMap.set(t.snippet_id, [t.tag])
    }
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      content: row.content,
      description: row.description || '',
      groupId: row.group_id || null,
      sortOrder: row.sort_order ?? 0,
      useCount: row.use_count ?? 0,
      lastUsedAt: row.last_used_at || null,
      tags: tagMap.get(row.id as string) || [],
    }))
  })

  // 创建片段
  ipcMain.handle(IPC_DB.SNIPPETS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO snippets (id, name, content, description, group_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name || '',
        data.content || '',
        data.description ?? null,
        data.groupId ?? null,
        data.sortOrder ?? 0,
      ]
    )
    // 插入标签
    const tags = (data.tags as string[]) || []
    for (const tag of tags) {
      dbRun('INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)', [id, tag])
    }
    // 返回完整对象
    const row = dbGet<Record<string, unknown>>('SELECT * FROM snippets WHERE id = ?', [id])
    scheduleSyncAfterChange()
    return row ? { id: row.id, name: row.name, content: row.content, description: row.description || '', groupId: row.group_id || null, sortOrder: row.sort_order ?? 0, useCount: 0, lastUsedAt: null, tags } : null
  })

  // 更新片段
  ipcMain.handle(IPC_DB.SNIPPETS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const params: unknown[] = []

    const coalesceFields: [string, string][] = [
      ['name', 'name'], ['content', 'content'], ['sort_order', 'sortOrder'],
    ]
    for (const [col, key] of coalesceFields) {
      if (key in data) {
        sets.push(`${col} = COALESCE(?, ${col})`)
        params.push(data[key] ?? null)
      }
    }
    const nullableFields: [string, string][] = [
      ['description', 'description'], ['group_id', 'groupId'],
    ]
    for (const [col, key] of nullableFields) {
      if (key in data) {
        sets.push(`${col} = ?`)
        params.push(data[key] ?? null)
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now'), sync_updated_at = datetime('now'), sync_version = sync_version + 1")
      params.push(id)
      dbRun(`UPDATE snippets SET ${sets.join(', ')} WHERE id = ?`, params)
    }

    // 更新标签（如果传入了 tags）
    if ('tags' in data) {
      dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
      const tags = (data.tags as string[]) || []
      for (const tag of tags) {
        dbRun('INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)', [id, tag])
      }
    }

    // 返回更新后的完整对象
    const row = dbGet<Record<string, unknown>>('SELECT * FROM snippets WHERE id = ?', [id])
    if (!row) return null
    const tagRows = dbAll<{ tag: string }>('SELECT tag FROM snippet_tags WHERE snippet_id = ?', [id])
    scheduleSyncAfterChange()
    return {
      id: row.id, name: row.name, content: row.content, description: row.description || '',
      groupId: row.group_id || null, sortOrder: row.sort_order ?? 0,
      useCount: row.use_count ?? 0, lastUsedAt: row.last_used_at || null,
      tags: tagRows.map(t => t.tag),
    }
  })

  // 删除片段
  ipcMain.handle(IPC_DB.SNIPPETS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
    dbRun('DELETE FROM snippets WHERE id = ?', [id])
    trackDelete('snippet', id)
    return true
  })

  // 使用次数递增
  ipcMain.handle(IPC_DB.SNIPPETS_INCREMENT_USE, (_event, id: string) => {
    dbRun(
      `UPDATE snippets SET use_count = use_count + 1, last_used_at = datetime('now'), updated_at = datetime('now'), sync_updated_at = datetime('now'), sync_version = sync_version + 1 WHERE id = ?`,
      [id]
    )
    const row = dbGet<Record<string, unknown>>('SELECT use_count, last_used_at FROM snippets WHERE id = ?', [id])
    return row ? { useCount: row.use_count, lastUsedAt: row.last_used_at } : null
  })
}

// ===== 命令片段分组 =====

function registerSnippetGroupsHandlers(): void {
  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_LIST, () => {
    return dbAll('SELECT * FROM snippet_groups ORDER BY sort_order ASC').map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id || null,
      color: row.color || null,
      sortOrder: row.sort_order ?? 0,
    }))
  })

  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      'INSERT INTO snippet_groups (id, name, parent_id, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      [id, data.name, data.parentId ?? null, data.color ?? null, data.sortOrder ?? 0]
    )
    const row = dbGet<Record<string, unknown>>('SELECT * FROM snippet_groups WHERE id = ?', [id])
    scheduleSyncAfterChange()
    return row ? { id: row.id, name: row.name, parentId: row.parent_id || null, color: row.color || null, sortOrder: row.sort_order ?? 0 } : null
  })

  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE snippet_groups SET
        name = COALESCE(?, name),
        parent_id = ?,
        color = ?,
        sort_order = COALESCE(?, sort_order),
        sync_updated_at = datetime('now'), sync_version = sync_version + 1
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.color ?? null, data.sortOrder ?? null, id]
    )
    const row = dbGet<Record<string, unknown>>('SELECT * FROM snippet_groups WHERE id = ?', [id])
    scheduleSyncAfterChange()
    return row ? { id: row.id, name: row.name, parentId: row.parent_id || null, color: row.color || null, sortOrder: row.sort_order ?? 0 } : null
  })

  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_DELETE, (_event, id: string) => {
    // 将该分组下的片段移到未分组
    dbRun('UPDATE snippets SET group_id = NULL WHERE group_id = ?', [id])
    dbRun('DELETE FROM snippet_groups WHERE id = ?', [id])
    trackDelete('snippet_group', id)
    return true
  })
}

// ===== 端口转发 =====

function mapPortForwardRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name || null,
    type: row.type,
    hostId: row.host_id,
    localBindAddr: row.local_bind_addr || '127.0.0.1',
    localPort: row.local_port ?? null,
    remoteTargetAddr: row.remote_target_addr || null,
    remoteTargetPort: row.remote_target_port ?? null,
    remoteBindAddr: row.remote_bind_addr || '127.0.0.1',
    remotePort: row.remote_port ?? null,
    localTargetAddr: row.local_target_addr || '127.0.0.1',
    localTargetPort: row.local_target_port ?? null,
    autoStart: !!(row.auto_start),
    appStart: !!(row.app_start),
    groupId: row.group_id || null,
    sortOrder: row.sort_order ?? 0,
  }
}

function registerPortForwardsHandlers(): void {
  ipcMain.handle(IPC_DB.PORT_FORWARDS_LIST, (_event, hostId?: string) => {
    const rows = hostId
      ? dbAll<Record<string, unknown>>('SELECT * FROM port_forwards WHERE host_id = ? ORDER BY sort_order ASC', [hostId])
      : dbAll<Record<string, unknown>>('SELECT * FROM port_forwards ORDER BY sort_order ASC, created_at ASC')
    return rows.map(mapPortForwardRow)
  })

  ipcMain.handle(IPC_DB.PORT_FORWARDS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO port_forwards (id, name, type, host_id, local_bind_addr, local_port, remote_target_addr, remote_target_port, remote_bind_addr, remote_port, local_target_addr, local_target_port, auto_start, app_start, group_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name ?? null,
        data.type || 'local',
        data.hostId,
        data.localBindAddr ?? '127.0.0.1',
        data.localPort ?? null,
        data.remoteTargetAddr ?? null,
        data.remoteTargetPort ?? null,
        data.remoteBindAddr ?? '127.0.0.1',
        data.remotePort ?? null,
        data.localTargetAddr ?? '127.0.0.1',
        data.localTargetPort ?? null,
        data.autoStart ? 1 : 0,
        data.appStart ? 1 : 0,
        data.groupId ?? null,
        data.sortOrder ?? 0,
      ]
    )
    const row = dbGet<Record<string, unknown>>('SELECT * FROM port_forwards WHERE id = ?', [id])
    scheduleSyncAfterChange()
    return row ? mapPortForwardRow(row) : null
  })

  ipcMain.handle(IPC_DB.PORT_FORWARDS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const params: unknown[] = []

    const coalesceFields: [string, string][] = [
      ['name', 'name'], ['type', 'type'], ['host_id', 'hostId'],
      ['local_bind_addr', 'localBindAddr'], ['local_port', 'localPort'],
      ['remote_target_addr', 'remoteTargetAddr'], ['remote_target_port', 'remoteTargetPort'],
      ['remote_bind_addr', 'remoteBindAddr'], ['remote_port', 'remotePort'],
      ['local_target_addr', 'localTargetAddr'], ['local_target_port', 'localTargetPort'],
      ['sort_order', 'sortOrder'],
    ]
    for (const [col, key] of coalesceFields) {
      if (key in data) {
        sets.push(`${col} = COALESCE(?, ${col})`)
        params.push(data[key] ?? null)
      }
    }
    if ('autoStart' in data) { sets.push('auto_start = ?'); params.push(data.autoStart ? 1 : 0) }
    if ('appStart' in data) { sets.push('app_start = ?'); params.push(data.appStart ? 1 : 0) }
    const nullableFields: [string, string][] = [['group_id', 'groupId']]
    for (const [col, key] of nullableFields) {
      if (key in data) { sets.push(`${col} = ?`); params.push(data[key] ?? null) }
    }

    if (sets.length === 0) {
      const row = dbGet<Record<string, unknown>>('SELECT * FROM port_forwards WHERE id = ?', [id])
      return row ? mapPortForwardRow(row) : null
    }

    sets.push("sync_updated_at = datetime('now')", 'sync_version = sync_version + 1')
    params.push(id)
    dbRun(`UPDATE port_forwards SET ${sets.join(', ')} WHERE id = ?`, params)
    const row = dbGet<Record<string, unknown>>('SELECT * FROM port_forwards WHERE id = ?', [id])
    scheduleSyncAfterChange()
    return row ? mapPortForwardRow(row) : null
  })

  ipcMain.handle(IPC_DB.PORT_FORWARDS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM port_forwards WHERE id = ?', [id])
    trackDelete('port_forward', id)
    return true
  })
}

// ===== SFTP 书签 =====

function registerSftpBookmarksHandlers(): void {
  // 按 host_id 查询书签
  ipcMain.handle(IPC_DB.SFTP_BOOKMARKS_LIST, (_event, hostId?: string) => {
    if (hostId) {
      return dbAll('SELECT * FROM sftp_bookmarks WHERE host_id = ? ORDER BY name ASC', [hostId])
    }
    return dbAll('SELECT * FROM sftp_bookmarks ORDER BY name ASC')
  })

  // 创建书签
  ipcMain.handle(IPC_DB.SFTP_BOOKMARKS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      'INSERT INTO sftp_bookmarks (id, host_id, path, name) VALUES (?, ?, ?, ?)',
      [id, data.hostId, data.path, data.name ?? null]
    )
    scheduleSyncAfterChange()
    return dbGet('SELECT * FROM sftp_bookmarks WHERE id = ?', [id])
  })

  // 删除书签
  ipcMain.handle(IPC_DB.SFTP_BOOKMARKS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM sftp_bookmarks WHERE id = ?', [id])
    trackDelete('sftp_bookmark', id)
    return true
  })
}

// ===== SSH 密钥 =====

function mapKeyRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    keyType: row.key_type,
    bits: row.bits ?? null,
    curve: row.curve ?? null,
    fingerprint: row.fingerprint,
    publicKey: row.public_key,
    privateKeyEnc: row.private_key_enc,
    passphraseEnc: row.passphrase_enc ?? null,
    comment: row.comment ?? null,
    autoLoadAgent: !!(row.auto_load_agent),
    createdAt: row.created_at,
  }
}

function registerKeysHandlers(): void {
  ipcMain.handle(IPC_DB.KEYS_LIST, () => {
    const rows = dbAll<Record<string, unknown>>('SELECT * FROM keys ORDER BY created_at DESC')
    return rows.map(mapKeyRow)
  })

  ipcMain.handle(IPC_DB.KEYS_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO keys (id, name, key_type, bits, curve, fingerprint, public_key, private_key_enc, passphrase_enc, comment, auto_load_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, data.name, data.keyType,
        data.bits ?? null, data.curve ?? null,
        data.fingerprint, data.publicKey, data.privateKeyEnc,
        data.passphraseEnc ?? null, data.comment ?? null,
        data.autoLoadAgent ? 1 : 0,
      ]
    )
    scheduleSyncAfterChange()
    const row = dbGet<Record<string, unknown>>('SELECT * FROM keys WHERE id = ?', [id])
    return row ? mapKeyRow(row) : null
  })

  ipcMain.handle(IPC_DB.KEYS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const params: unknown[] = []
    const fields: [string, string][] = [
      ['name', 'name'], ['comment', 'comment'],
      ['passphrase_enc', 'passphraseEnc'],
    ]
    for (const [col, key] of fields) {
      if (key in data) { sets.push(`${col} = ?`); params.push(data[key] ?? null) }
    }
    if ('autoLoadAgent' in data) {
      sets.push('auto_load_agent = ?'); params.push(data.autoLoadAgent ? 1 : 0)
    }
    if (sets.length === 0) {
      const row = dbGet<Record<string, unknown>>('SELECT * FROM keys WHERE id = ?', [id])
      return row ? mapKeyRow(row) : null
    }
    sets.push("sync_updated_at = datetime('now'), sync_version = sync_version + 1")
    params.push(id)
    dbRun(`UPDATE keys SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSyncAfterChange()
    const row = dbGet<Record<string, unknown>>('SELECT * FROM keys WHERE id = ?', [id])
    return row ? mapKeyRow(row) : null
  })

  ipcMain.handle(IPC_DB.KEYS_DELETE, (_event, id: string) => {
    // 检查是否有主机引用此密钥
    const refs = dbAll('SELECT id FROM hosts WHERE key_id = ?', [id])
    if (refs.length > 0) {
      throw new Error(`此密钥被 ${refs.length} 个主机引用，请先取消关联`)
    }
    dbRun('DELETE FROM keys WHERE id = ?', [id])
    trackDelete('key', id)
    return true
  })
}

// ===== Vault 条目 =====

// Vault 辅助：加密字段（前端传明文，handler 负责加密存储）
function vaultEncrypt(val: unknown): string | null {
  if (val == null || val === '') return null
  if (!vaultService.isUnlocked()) return String(val)
  return vaultService.encrypt(String(val))
}

function vaultDecrypt(val: unknown): string | null {
  if (val == null || val === '') return null
  if (!vaultService.isUnlocked()) return String(val)
  try { return vaultService.decrypt(String(val)) } catch { return String(val) }
}

function mapVaultRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: vaultDecrypt(row.name_enc) ?? '',
    type: row.type,
    username: vaultDecrypt(row.username_enc),
    value: vaultDecrypt(row.value_enc) ?? '',
    url: vaultDecrypt(row.url_enc),
    notes: vaultDecrypt(row.notes_enc),
    tags: row.tags_enc ? (() => { try { const d = vaultDecrypt(row.tags_enc); return d ? JSON.parse(d) : [] } catch { return [] } })() : [],
    expiresAt: row.expires_at,
    groupId: row.group_id,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function registerVaultHandlers(): void {
  ipcMain.handle(IPC_DB.VAULT_LIST, () => {
    const rows = dbAll<Record<string, unknown>>('SELECT * FROM vault_entries ORDER BY sort_order ASC, created_at ASC')
    return rows.map(mapVaultRow)
  })

  ipcMain.handle(IPC_DB.VAULT_CREATE, (_event, data: Record<string, unknown>) => {
    const id = uuidv4()
    dbRun(
      `INSERT INTO vault_entries (id, name_enc, type, username_enc, value_enc, url_enc, notes_enc, tags_enc, expires_at, group_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        vaultEncrypt(data.name),
        data.type ?? 'password',
        vaultEncrypt(data.username),
        vaultEncrypt(data.value),
        vaultEncrypt(data.url),
        vaultEncrypt(data.notes),
        data.tags ? vaultEncrypt(JSON.stringify(data.tags)) : null,
        data.expiresAt ?? null,
        data.groupId ?? null,
        data.sortOrder ?? 0,
      ]
    )
    scheduleSyncAfterChange()
    const row = dbGet<Record<string, unknown>>('SELECT * FROM vault_entries WHERE id = ?', [id])
    return row ? mapVaultRow(row) : null
  })

  ipcMain.handle(IPC_DB.VAULT_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    const sets: string[] = []
    const params: unknown[] = []
    // 需要加密的字段
    const encFields: [string, string][] = [
      ['name_enc', 'name'], ['username_enc', 'username'],
      ['value_enc', 'value'], ['url_enc', 'url'], ['notes_enc', 'notes'],
    ]
    for (const [col, key] of encFields) {
      if (key in data) { sets.push(`${col} = ?`); params.push(vaultEncrypt(data[key])) }
    }
    if ('tags' in data) {
      sets.push('tags_enc = ?')
      params.push(data.tags ? vaultEncrypt(JSON.stringify(data.tags)) : null)
    }
    // 不需要加密的字段
    const plainFields: [string, string][] = [
      ['type', 'type'], ['expires_at', 'expiresAt'],
      ['group_id', 'groupId'], ['sort_order', 'sortOrder'],
    ]
    for (const [col, key] of plainFields) {
      if (key in data) { sets.push(`${col} = ?`); params.push(data[key] ?? null) }
    }
    if (sets.length === 0) {
      const row = dbGet<Record<string, unknown>>('SELECT * FROM vault_entries WHERE id = ?', [id])
      return row ? mapVaultRow(row) : null
    }
    sets.push("updated_at = datetime('now'), sync_updated_at = datetime('now'), sync_version = sync_version + 1")
    params.push(id)
    dbRun(`UPDATE vault_entries SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSyncAfterChange()
    const row = dbGet<Record<string, unknown>>('SELECT * FROM vault_entries WHERE id = ?', [id])
    return row ? mapVaultRow(row) : null
  })

  ipcMain.handle(IPC_DB.VAULT_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM vault_entries WHERE id = ?', [id])
    trackDelete('vault_entry', id)
    return true
  })
}
