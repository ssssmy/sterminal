// 同步引擎
// 管理本地数据与服务端的双向同步，支持 E2EE 加密

import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { dbAll, dbGet, dbRun } from './db'
import { e2eCrypto } from './crypto'
import { api } from './server-api'
import { getServerUrl } from './server-url-service'
import { deriveWsUrl } from '../../shared/utils/server-url'
import type { SyncStatus } from '../../shared/types/sync'

export type { SyncState, SyncStatus } from '../../shared/types/sync'

interface SyncEntity {
  id: string
  entityType: string
  data: string
  version: number
  deleted: boolean
  updatedAt: string
}

interface PushResult {
  accepted: number
  conflicts: string[]
}

interface PullResult {
  entities: Array<{
    id: string
    entity_type: string
    data: string
    version: number
    deleted: number
    updated_at: string
  }>
  hasMore: boolean
  nextSince: string
}

// 需要同步的实体表映射
const SYNC_TABLES: Array<{
  table: string
  entityType: string
  idField: string
}> = [
  { table: 'hosts', entityType: 'host', idField: 'id' },
  { table: 'host_groups', entityType: 'host_group', idField: 'id' },
  { table: 'local_terminals', entityType: 'local_terminal', idField: 'id' },
  { table: 'local_terminal_groups', entityType: 'local_terminal_group', idField: 'id' },
  { table: 'snippets', entityType: 'snippet', idField: 'id' },
  { table: 'snippet_groups', entityType: 'snippet_group', idField: 'id' },
  { table: 'port_forwards', entityType: 'port_forward', idField: 'id' },
  { table: 'tags', entityType: 'tag', idField: 'id' },
  { table: 'custom_themes', entityType: 'custom_theme', idField: 'id' },
  { table: 'sftp_bookmarks', entityType: 'sftp_bookmark', idField: 'id' },
]

// 主机表中需要加密的敏感字段
const HOST_SENSITIVE_FIELDS = ['password_enc', 'key_passphrase_enc', 'proxy_password_enc']

/**
 * 将 SQLite datetime 格式 (2024-01-01 00:00:00) 转为 ISO 格式 (2024-01-01T00:00:00.000Z)
 */
function toISODateTime(dt: string | null | undefined): string {
  if (!dt) return new Date().toISOString()
  // 已经是 ISO 格式
  if (dt.includes('T')) return dt
  // SQLite 格式: "2024-01-01 00:00:00" → "2024-01-01T00:00:00.000Z"
  return dt.replace(' ', 'T') + '.000Z'
}

class SyncEngine {
  private token: string | null = null
  private deviceId: string
  private ws: WebSocket | null = null
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private wsReconnectDelay = 1000
  private syncTimer: ReturnType<typeof setTimeout> | null = null
  private autoSyncMinutes = 5
  private isSyncing = false
  private pendingSyncRequest = false
  private wsReconnectAttempts = 0
  private static readonly MAX_WS_RECONNECT_ATTEMPTS = 20
  private lastSyncAt: string | null = null
  private status: SyncStatus = { state: 'stopped' }
  private onStatusChange: ((status: SyncStatus) => void) | null = null

  constructor() {
    this.deviceId = this.loadOrCreateDeviceId()
  }

  private loadOrCreateDeviceId(): string {
    try {
      const row = dbGet<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'device_id'"
      )
      if (row) return row.value
    } catch {
      // sync_meta table might not exist yet
    }

    const id = uuidv4()
    try {
      dbRun(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('device_id', ?)",
        [id]
      )
    } catch {
      // ignore if table doesn't exist
    }
    return id
  }

  private loadAutoSyncInterval(): void {
    try {
      const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['sync.autoInterval'])
      if (row) {
        const val = JSON.parse(row.value)
        if (typeof val === 'number' && val >= 0) this.autoSyncMinutes = val
      }
    } catch { /* use default */ }
  }

  private loadLastSyncAt(): string | null {
    try {
      const row = dbGet<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'last_sync_at'"
      )
      return row?.value ?? null
    } catch {
      return null
    }
  }

  private saveLastSyncAt(time: string): void {
    dbRun(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_sync_at', ?)",
      [time]
    )
    this.lastSyncAt = time
  }

  private updateStatus(status: SyncStatus): void {
    this.status = status
    this.onStatusChange?.(status)
  }

  getStatus(): SyncStatus {
    return { ...this.status, lastSyncAt: this.lastSyncAt ?? this.status.lastSyncAt }
  }

  getToken(): string | null {
    return this.token
  }

  start(token: string, onStatusChange: (status: SyncStatus) => void): void {
    this.token = token
    this.onStatusChange = onStatusChange
    this.lastSyncAt = this.loadLastSyncAt()
    this.updateStatus({ state: 'idle', lastSyncAt: this.lastSyncAt ?? undefined })

    // Load saved auto-sync interval
    this.loadAutoSyncInterval()

    // Connect WebSocket
    this.connectWs()

    // Schedule periodic sync
    this.schedulePeriodicSync()

    // Initial sync
    setTimeout(() => this.syncNow().catch(console.error), 2000)
  }

  stop(): void {
    this.token = null
    this.onStatusChange = null
    this.disconnectWs()

    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }

    this.updateStatus({ state: 'stopped' })
  }

  async syncNow(): Promise<void> {
    if (this.isSyncing || !this.token) {
      if (this.isSyncing) this.pendingSyncRequest = true
      return
    }

    this.isSyncing = true
    this.pendingSyncRequest = false
    // Reset WS reconnect on manual sync (allows retry after max attempts)
    if (this.wsReconnectAttempts > SyncEngine.MAX_WS_RECONNECT_ATTEMPTS && !this.ws) {
      this.wsReconnectAttempts = 0
      this.connectWs()
    }
    this.updateStatus({ state: 'syncing', progress: 'Pushing changes...' })

    try {
      await this.pushChanges()
      this.updateStatus({ state: 'syncing', progress: 'Pulling changes...' })
      await this.pullChanges()
      this.updateStatus({ state: 'idle', lastSyncAt: this.lastSyncAt ?? undefined })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown sync error'
      console.error('[Sync] Error:', message)
      this.updateStatus({ state: 'error', message })
    } finally {
      this.isSyncing = false
      // If a sync was requested while we were busy, run again
      if (this.pendingSyncRequest && this.token) {
        this.pendingSyncRequest = false
        setTimeout(() => this.syncNow().catch(console.error), 1000)
      }
    }
  }

  private async pushChanges(): Promise<void> {
    if (!this.token) return

    const entities = this.collectDirtyEntities()
    if (entities.length === 0) return

    // Batch push (max 500 per request)
    for (let i = 0; i < entities.length; i += 500) {
      const batch = entities.slice(i, i + 500)
      const result = await api.post<PushResult>(
        '/sync/push',
        { deviceId: this.deviceId, entities: batch },
        this.token
      )

      if (result.conflicts.length > 0) {
        console.warn('[Sync] Conflicts:', result.conflicts)
        // On conflict, we'll rely on the pull phase to resolve (LWW)
      }

      // Mark pushed deletes as synced
      const deletedEntities = batch.filter(e => e.deleted)
      for (const entity of deletedEntities) {
        dbRun(
          'UPDATE sync_deletes SET synced = 1 WHERE entity_type = ? AND entity_id = ?',
          [entity.entityType, entity.id]
        )
      }
    }

    // Purge synced deletes to prevent unbounded table growth
    // 清理已同步的删除记录 + 超过 7 天的残留记录
    dbRun("DELETE FROM sync_deletes WHERE synced = 1 OR deleted_at < datetime('now', '-7 days')")
  }

  private collectDirtyEntities(): SyncEntity[] {
    const entities: SyncEntity[] = []
    const since = this.lastSyncAt ?? '1970-01-01T00:00:00.000Z'

    for (const { table, entityType, idField } of SYNC_TABLES) {
      const rows = dbAll<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE sync_updated_at > ?`,
        [since]
      )

      for (const row of rows) {
        let data = { ...row }

        // For snippets, include tags
        if (entityType === 'snippet') {
          const tags = dbAll<{ tag: string }>(
            'SELECT tag FROM snippet_tags WHERE snippet_id = ?',
            [row[idField] as string]
          )
          data = { ...data, _tags: tags.map(t => t.tag) }
        }

        // Encrypt sensitive host fields
        if (entityType === 'host' && e2eCrypto.hasKey()) {
          for (const field of HOST_SENSITIVE_FIELDS) {
            const value = data[field]
            if (value && typeof value === 'string') {
              data[field] = e2eCrypto.encrypt(value)
              data[`${field}_encrypted`] = true
            }
          }
        }

        entities.push({
          id: row[idField] as string,
          entityType,
          data: JSON.stringify(data),
          version: (row.sync_version as number) ?? 1,
          deleted: false,
          updatedAt: toISODateTime(row.sync_updated_at as string),
        })
      }
    }

    // Settings (each key is a separate entity)
    const settingsRows = dbAll<{ key: string; value: string; sync_version: number; sync_updated_at: string }>(
      'SELECT * FROM settings WHERE sync_updated_at > ?',
      [since]
    )
    for (const row of settingsRows) {
      entities.push({
        id: row.key,
        entityType: 'settings',
        data: JSON.stringify({ key: row.key, value: row.value }),
        version: row.sync_version ?? 1,
        deleted: false,
        updatedAt: toISODateTime(row.sync_updated_at),
      })
    }

    // Keybindings
    const keybindingRows = dbAll<{ action: string; shortcut: string; sync_version: number; sync_updated_at: string }>(
      'SELECT * FROM keybindings WHERE sync_updated_at > ?',
      [since]
    )
    for (const row of keybindingRows) {
      entities.push({
        id: row.action,
        entityType: 'keybinding',
        data: JSON.stringify({ action: row.action, shortcut: row.shortcut }),
        version: row.sync_version ?? 1,
        deleted: false,
        updatedAt: toISODateTime(row.sync_updated_at),
      })
    }

    // Tracked deletes
    const deletes = dbAll<{ entity_type: string; entity_id: string; deleted_at: string }>(
      'SELECT * FROM sync_deletes WHERE synced = 0'
    )
    for (const del of deletes) {
      entities.push({
        id: del.entity_id,
        entityType: del.entity_type,
        data: '{}',
        version: 1,
        deleted: true,
        updatedAt: toISODateTime(del.deleted_at),
      })
    }

    return entities
  }

  private async pullChanges(): Promise<void> {
    if (!this.token) return

    let since = toISODateTime(this.lastSyncAt ?? '1970-01-01T00:00:00.000Z')
    let hasMore = true

    while (hasMore) {
      const result = await api.get<PullResult>(
        `/sync/pull?deviceId=${encodeURIComponent(this.deviceId)}&since=${encodeURIComponent(since)}&limit=200`,
        this.token
      )

      for (const entity of result.entities) {
        this.applyEntity(entity)
      }

      hasMore = result.hasMore
      since = result.nextSince
    }

    this.saveLastSyncAt(since)
  }

  private applyEntity(entity: {
    id: string
    entity_type: string
    data: string
    version: number
    deleted: number
    updated_at: string
  }): void {
    const entityType = entity.entity_type

    if (entity.deleted) {
      this.deleteLocalEntity(entityType, entity.id)
      return
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(entity.data)
    } catch {
      console.error('[Sync] Invalid entity data:', entity.id)
      return
    }

    // Decrypt sensitive host fields
    if (entityType === 'host' && e2eCrypto.hasKey()) {
      for (const field of HOST_SENSITIVE_FIELDS) {
        if (data[`${field}_encrypted`] && data[field] && typeof data[field] === 'string') {
          try {
            data[field] = e2eCrypto.decrypt(data[field] as string)
          } catch {
            console.warn(`[Sync] Failed to decrypt ${field} for host ${entity.id}`)
          }
          delete data[`${field}_encrypted`]
        }
      }
    }

    // Check local version - only apply if remote >= local (LWW)
    const tableInfo = this.getTableInfo(entityType)
    if (tableInfo) {
      const local = dbGet<{ sync_version: number }>(
        `SELECT sync_version FROM ${tableInfo.table} WHERE ${tableInfo.idField} = ?`,
        [entity.id]
      )
      if (local && local.sync_version > entity.version) {
        return // Local is newer, skip
      }
    }

    this.upsertEntity(entityType, entity.id, data, entity.version, entity.updated_at)
  }

  private static readonly TABLE_MAP = new Map(SYNC_TABLES.map(t => [t.entityType, t]))

  private getTableInfo(entityType: string) {
    return SyncEngine.TABLE_MAP.get(entityType)
  }

  private deleteLocalEntity(entityType: string, id: string): void {
    const tableInfo = this.getTableInfo(entityType)

    if (entityType === 'settings') {
      dbRun('DELETE FROM settings WHERE key = ?', [id])
    } else if (entityType === 'keybinding') {
      dbRun('DELETE FROM keybindings WHERE action = ?', [id])
    } else if (entityType === 'snippet') {
      dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
      dbRun('DELETE FROM snippets WHERE id = ?', [id])
    } else if (tableInfo) {
      dbRun(`DELETE FROM ${tableInfo.table} WHERE ${tableInfo.idField} = ?`, [id])
    }
  }

  private upsertEntity(
    entityType: string,
    id: string,
    data: Record<string, unknown>,
    version: number,
    updatedAt: string
  ): void {
    if (entityType === 'settings') {
      dbRun(
        `INSERT INTO settings (key, value, sync_version, sync_updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_version = excluded.sync_version, sync_updated_at = excluded.sync_updated_at`,
        [data.key as string, data.value as string, version, updatedAt]
      )
      return
    }

    if (entityType === 'keybinding') {
      dbRun(
        `INSERT INTO keybindings (action, shortcut, sync_version, sync_updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut, sync_version = excluded.sync_version, sync_updated_at = excluded.sync_updated_at`,
        [data.action as string, data.shortcut as string, version, updatedAt]
      )
      return
    }

    const tableInfo = this.getTableInfo(entityType)
    if (!tableInfo) return

    // Handle snippet tags separately
    let snippetTags: string[] = []
    if (entityType === 'snippet' && Array.isArray(data._tags)) {
      snippetTags = data._tags as string[]
      delete data._tags
    }

    // Build UPSERT query
    const columns = Object.keys(data).filter(k => !k.endsWith('_encrypted'))
    const placeholders = columns.map(() => '?').join(', ')
    const updates = columns
      .filter(c => c !== tableInfo.idField)
      .map(c => `${c} = excluded.${c}`)
      .join(', ')

    const values = columns.map(c => {
      const v = data[c]
      return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : v
    })

    try {
      dbRun(
        `INSERT INTO ${tableInfo.table} (${columns.join(', ')}, sync_version, sync_updated_at)
         VALUES (${placeholders}, ?, ?)
         ON CONFLICT(${tableInfo.idField}) DO UPDATE SET ${updates}, sync_version = excluded.sync_version, sync_updated_at = excluded.sync_updated_at`,
        [...values, version, updatedAt]
      )
    } catch (err) {
      console.error(`[Sync] Failed to upsert ${entityType}:${id}:`, err)
      return
    }

    // Handle snippet tags
    if (entityType === 'snippet' && snippetTags.length > 0) {
      dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
      for (const tag of snippetTags) {
        dbRun('INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)', [id, tag])
      }
    }
  }

  // ===== WebSocket =====

  private connectWs(): void {
    if (!this.token) return

    // Clean up existing connection if any
    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }

    try {
      this.ws = new WebSocket(deriveWsUrl(getServerUrl()))

      this.ws.on('open', () => {
        // Send auth message
        this.ws?.send(JSON.stringify({
          type: 'auth',
          data: { token: this.token, deviceId: this.deviceId },
        }))
        this.wsReconnectDelay = 1000
        this.wsReconnectAttempts = 0
        console.log('[Sync] WebSocket connected')
      })

      this.ws.on('message', (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString())
          if (msg.type === 'sync_notify') {
            // Another device pushed data, pull immediately
            this.syncNow().catch(console.error)
          }
        } catch {
          // ignore parse errors
        }
      })

      this.ws.on('close', () => {
        this.ws = null
        if (this.token) {
          this.scheduleWsReconnect()
        }
      })

      this.ws.on('error', (err) => {
        console.error('[Sync] WebSocket error:', err.message)
        this.ws?.close()
      })
    } catch (err) {
      console.error('[Sync] WebSocket connect failed:', err)
      this.scheduleWsReconnect()
    }
  }

  private scheduleWsReconnect(): void {
    this.wsReconnectAttempts++
    if (this.wsReconnectAttempts > SyncEngine.MAX_WS_RECONNECT_ATTEMPTS) {
      console.warn('[Sync] Max WebSocket reconnect attempts reached, giving up')
      return
    }
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer)
    this.wsReconnectTimer = setTimeout(() => {
      this.connectWs()
    }, this.wsReconnectDelay)
    // Exponential backoff: 1s, 2s, 4s, 8s, ... max 60s
    this.wsReconnectDelay = Math.min(this.wsReconnectDelay * 2, 60000)
  }

  private disconnectWs(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  setAutoSyncInterval(minutes: number): void {
    this.autoSyncMinutes = minutes
    // 重新调度
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    if (minutes > 0 && this.token) {
      this.schedulePeriodicSync()
    }
  }

  private schedulePeriodicSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer)
    if (this.autoSyncMinutes <= 0) return
    this.syncTimer = setTimeout(() => {
      this.syncNow().catch(console.error)
      this.schedulePeriodicSync()
    }, this.autoSyncMinutes * 60 * 1000)
  }
}

export const syncEngine = new SyncEngine()
