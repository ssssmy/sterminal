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
  registerLocalTerminalGroupsHandlers()
  registerHostsHandlers()
  registerHostGroupsHandlers()
  registerTagsHandlers()
  registerSnippetsHandlers()
  registerSnippetGroupsHandlers()
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

    sets.push("updated_at = datetime('now')")
    params.push(id)
    dbRun(`UPDATE local_terminals SET ${sets.join(', ')} WHERE id = ?`, params)
    return dbGet('SELECT * FROM local_terminals WHERE id = ?', [id])
  })

  // 删除本地终端配置
  ipcMain.handle(IPC_DB.LOCAL_TERMINALS_DELETE, (_event, id: string) => {
    dbRun('DELETE FROM local_terminals WHERE id = ?', [id])
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
    return dbGet('SELECT * FROM local_terminal_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE local_terminal_groups SET
        name = COALESCE(?, name),
        parent_id = ?,
        sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.sortOrder ?? null, id]
    )
    return dbGet('SELECT * FROM local_terminal_groups WHERE id = ?', [id])
  })

  ipcMain.handle(IPC_DB.LOCAL_TERMINAL_GROUPS_DELETE, (_event, id: string) => {
    // 将该分组下的终端移到未分组
    dbRun('UPDATE local_terminals SET group_id = NULL WHERE group_id = ?', [id])
    dbRun('DELETE FROM local_terminal_groups WHERE id = ?', [id])
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

    sets.push("updated_at = datetime('now')")
    params.push(id)
    dbRun(`UPDATE hosts SET ${sets.join(', ')} WHERE id = ?`, params)
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

// ===== 命令片段 =====

function registerSnippetsHandlers(): void {
  // 查询所有片段（含标签）
  ipcMain.handle(IPC_DB.SNIPPETS_LIST, () => {
    const rows = dbAll<Record<string, unknown>>(
      'SELECT * FROM snippets ORDER BY sort_order ASC, created_at ASC'
    )
    // 为每个 snippet 附加 tags
    return rows.map(row => {
      const tags = dbAll<{ tag: string }>(
        'SELECT tag FROM snippet_tags WHERE snippet_id = ?',
        [row.id as string]
      )
      return {
        id: row.id,
        name: row.name,
        content: row.content,
        description: row.description || '',
        groupId: row.group_id || null,
        sortOrder: row.sort_order ?? 0,
        useCount: row.use_count ?? 0,
        lastUsedAt: row.last_used_at || null,
        tags: tags.map(t => t.tag),
      }
    })
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
      sets.push("updated_at = datetime('now')")
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
    return true
  })

  // 使用次数递增
  ipcMain.handle(IPC_DB.SNIPPETS_INCREMENT_USE, (_event, id: string) => {
    dbRun(
      `UPDATE snippets SET use_count = use_count + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
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
    return row ? { id: row.id, name: row.name, parentId: row.parent_id || null, color: row.color || null, sortOrder: row.sort_order ?? 0 } : null
  })

  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_UPDATE, (_event, id: string, data: Record<string, unknown>) => {
    dbRun(
      `UPDATE snippet_groups SET
        name = COALESCE(?, name),
        parent_id = ?,
        color = ?,
        sort_order = COALESCE(?, sort_order)
       WHERE id = ?`,
      [data.name ?? null, data.parentId ?? null, data.color ?? null, data.sortOrder ?? null, id]
    )
    const row = dbGet<Record<string, unknown>>('SELECT * FROM snippet_groups WHERE id = ?', [id])
    return row ? { id: row.id, name: row.name, parentId: row.parent_id || null, color: row.color || null, sortOrder: row.sort_order ?? 0 } : null
  })

  ipcMain.handle(IPC_DB.SNIPPET_GROUPS_DELETE, (_event, id: string) => {
    // 将该分组下的片段移到未分组
    dbRun('UPDATE snippets SET group_id = NULL WHERE group_id = ?', [id])
    dbRun('DELETE FROM snippet_groups WHERE id = ?', [id])
    return true
  })
}
