// 系统操作 IPC Handler
// 处理剪贴板、外部链接、Shell 列表等系统级操作

import { ipcMain, shell, clipboard, dialog, BrowserWindow } from 'electron'
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { IPC_SYSTEM } from '../../shared/types/ipc-channels'
import { assertUnderHome } from '../utils/platform'
import { dbAll, dbRun, dbGet } from '../services/db'
import { parseSshConfig } from '../services/ssh-config-parser'

/**
 * 注册系统操作相关的 IPC handlers
 */
export function registerSystemHandlers(): void {
  // 获取系统可用 Shell 列表
  ipcMain.handle(IPC_SYSTEM.GET_SHELL_LIST, () => {
    return getAvailableShells()
  })

  // 打开外部链接或文件
  ipcMain.handle(IPC_SYSTEM.OPEN_EXTERNAL, async (_event, target: string) => {
    await shell.openExternal(target)
  })

  // 用系统文件管理器打开指定路径（跨平台：Finder / Explorer / Files）
  ipcMain.handle(IPC_SYSTEM.OPEN_PATH, async (_event, targetPath: string) => {
    const resolved = assertUnderHome(targetPath)
    await shell.openPath(resolved)
  })

  // 延时清除剪贴板（用于密码自动清除功能）
  ipcMain.handle(IPC_SYSTEM.CLIPBOARD_CLEAR, (_event, delayMs: number) => {
    setTimeout(() => {
      clipboard.writeText('')
    }, delayMs)
  })

  // ===== 数据导入 =====
  ipcMain.handle(IPC_SYSTEM.IMPORT_HOSTS, async (_event, params: { type: string; content?: string }) => {
    if (params.type === 'ssh_config') {
      // 自动读取或使用传入内容
      let content = params.content
      if (!content) {
        const homeDir = app.getPath('home')
        const configPath = path.join(homeDir, '.ssh', 'config')
        if (!fs.existsSync(configPath)) throw new Error('~/.ssh/config not found')
        content = fs.readFileSync(configPath, 'utf-8')
      }
      const parsed = parseSshConfig(content)
      let imported = 0
      for (const host of parsed) {
        // 按 address+port+username 去重
        const exists = dbGet(
          'SELECT id FROM hosts WHERE address = ? AND port = ? AND username = ?',
          [host.address, host.port, host.username ?? '']
        )
        if (exists) continue
        const id = uuidv4()
        dbRun(
          `INSERT INTO hosts (id, label, address, port, username, auth_type) VALUES (?, ?, ?, ?, ?, ?)`,
          [id, host.label, host.address, host.port, host.username ?? null, host.identityFile ? 'key' : 'password']
        )
        imported++
      }
      return { total: parsed.length, imported, skipped: parsed.length - imported }
    }

    if (params.type === 'sterminal_json') {
      if (!params.content) throw new Error('No content provided')
      const data = JSON.parse(params.content)
      if (data.app !== 'STerminal' || !data.data) throw new Error('Invalid STerminal export file')
      let imported = 0
      const tables: Array<{ key: string; table: string; idField: string }> = [
        { key: 'hostGroups', table: 'host_groups', idField: 'id' },
        { key: 'hosts', table: 'hosts', idField: 'id' },
        { key: 'localTerminalGroups', table: 'local_terminal_groups', idField: 'id' },
        { key: 'localTerminals', table: 'local_terminals', idField: 'id' },
        { key: 'snippetGroups', table: 'snippet_groups', idField: 'id' },
        { key: 'snippets', table: 'snippets', idField: 'id' },
        { key: 'portForwards', table: 'port_forwards', idField: 'id' },
        { key: 'tags', table: 'tags', idField: 'id' },
        { key: 'keys', table: 'keys', idField: 'id' },
        { key: 'vaultEntries', table: 'vault_entries', idField: 'id' },
        { key: 'customThemes', table: 'custom_themes', idField: 'id' },
      ]
      for (const { key, table, idField } of tables) {
        const rows = data.data[key] as Record<string, unknown>[] | undefined
        if (!rows || !Array.isArray(rows)) continue
        for (const row of rows) {
          const id = row[idField] as string
          if (!id) continue
          const exists = dbGet(`SELECT ${idField} FROM ${table} WHERE ${idField} = ?`, [id])
          if (exists) continue
          const cols = Object.keys(row)
          const placeholders = cols.map(() => '?').join(', ')
          const values = cols.map(c => {
            const v = row[c]
            return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : v
          })
          try {
            dbRun(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`, values)
            imported++
          } catch { /* skip invalid rows */ }
        }
      }
      // Settings
      const settings = data.data.settings as Array<{ key: string; value: string }> | undefined
      if (settings) {
        for (const s of settings) {
          dbRun(
            `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [s.key, s.value]
          )
          imported++
        }
      }
      return { imported }
    }

    throw new Error(`Unsupported import type: ${params.type}`)
  })

  // ===== 数据导出 =====
  ipcMain.handle(IPC_SYSTEM.EXPORT_HOSTS, (_event, options?: { includeSensitive?: boolean }) => {
    const includeSensitive = options?.includeSensitive ?? true
    const exportData: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'STerminal',
      data: {
        hosts: dbAll('SELECT * FROM hosts').map((h: Record<string, unknown>) => {
          if (!includeSensitive) {
            return { ...h, password_enc: null, key_passphrase_enc: null, proxy_password_enc: null }
          }
          return h
        }),
        hostGroups: dbAll('SELECT * FROM host_groups'),
        localTerminals: dbAll('SELECT * FROM local_terminals'),
        localTerminalGroups: dbAll('SELECT * FROM local_terminal_groups'),
        snippets: dbAll('SELECT * FROM snippets'),
        snippetGroups: dbAll('SELECT * FROM snippet_groups'),
        portForwards: dbAll('SELECT * FROM port_forwards'),
        tags: dbAll('SELECT * FROM tags'),
        keys: dbAll('SELECT * FROM keys').map((k: Record<string, unknown>) => {
          if (!includeSensitive) {
            return { ...k, private_key_enc: null, passphrase_enc: null }
          }
          return k
        }),
        vaultEntries: includeSensitive ? dbAll('SELECT * FROM vault_entries') : [],
        customThemes: dbAll('SELECT * FROM custom_themes'),
        settings: dbAll('SELECT * FROM settings'),
      },
    }
    return JSON.stringify(exportData, null, 2)
  })

  // ===== 清除数据 =====
  ipcMain.handle(IPC_SYSTEM.BACKUP, (_event, options?: { keepSettings?: boolean }) => {
    // 先关闭外键约束，避免删除顺序问题
    dbRun('PRAGMA foreign_keys = OFF')
    const tables = [
      'host_tags', 'snippet_tags',
      'hosts', 'host_groups', 'tags',
      'local_terminals', 'local_terminal_groups',
      'snippets', 'snippet_groups',
      'port_forwards', 'keys', 'vault_entries', 'vault_config',
      'known_hosts', 'custom_themes', 'keybindings', 'sftp_bookmarks',
      'quick_connect_history', 'command_history', 'session_logs',
      'sync_deletes', 'sync_meta',
    ]
    if (!options?.keepSettings) tables.push('settings')
    for (const table of tables) {
      try { dbRun(`DELETE FROM ${table}`) } catch { /* table may not exist */ }
    }
    dbRun('PRAGMA foreign_keys = ON')
    return true
  })
}

let cachedShells: string[] | null = null

/**
 * 获取系统可用的 Shell 列表（结果缓存，应用生命周期内不变）
 */
function getAvailableShells(): string[] {
  if (cachedShells) return cachedShells
  const platform = process.platform

  if (platform === 'win32') {
    cachedShells = ['cmd.exe', 'powershell.exe', 'pwsh.exe'].filter(sh => {
      try {
        execSync(`where ${sh}`, { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    })
    return cachedShells
  }

  // macOS / Linux: 读取 /etc/shells
  try {
    const content = fs.readFileSync('/etc/shells', 'utf-8')
    cachedShells = content
      .split('\n')
      .filter((line: string) => line.startsWith('/'))
      .map((line: string) => line.trim())
  } catch {
    cachedShells = ['/bin/bash', '/bin/zsh', '/bin/sh']
  }
  return cachedShells
}
