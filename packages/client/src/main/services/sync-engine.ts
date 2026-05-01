// 同步引擎
// 管理本地数据与服务端的双向同步，CRDT 字段级 LWW + tombstone 复活

import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { dbAll, dbGet, dbRun } from './db'
import { e2eCrypto } from './crypto'
import { api } from './server-api'
import { getServerUrl } from './server-url-service'
import { deriveWsUrl } from '../../shared/utils/server-url'
import type { SyncStatus } from '../../shared/types/sync'
import { crdtClock, compareTick, type Tick } from './crdt-clock'
import {
  mergeCrdt,
  isAlive,
  parseFieldMeta,
  serializeFieldMeta,
  type CrdtState,
  type FieldMeta,
} from './crdt-merge'

export type { SyncState, SyncStatus } from '../../shared/types/sync'

// 同步实体的线缆表示（push / pull 共用）
interface SyncEntityWire {
  id: string
  entityType: string
  fields: Record<string, unknown>
  fieldMeta: FieldMeta
  tombstone: Tick | null
  updatedAt: string
}

interface PushResult {
  accepted: number
}

interface PullEntity {
  id: string
  entity_type: string
  fields: Record<string, unknown>
  field_meta: FieldMeta
  tombstone_ts: string | null
  tombstone_did: string | null
  updated_at: string
}

interface PullResult {
  entities: PullEntity[]
  hasMore: boolean
  nextSince: string
}

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
  { table: 'keys', entityType: 'key', idField: 'id' },
  { table: 'vault_entries', entityType: 'vault_entry', idField: 'id' },
]

// 这些列不参与 CRDT 字段合并（属于同步元数据或本地派生）
const NON_CRDT_COLUMNS = new Set([
  'sync_version',
  'sync_updated_at',
  'created_at',
  'field_meta',
])

const HOST_SENSITIVE_FIELDS = ['password_enc', 'key_passphrase_enc', 'proxy_password_enc']

const LEGACY_DID = 'legacy' // 没有 field_meta 时合成 tick 用的占位 did

function toISODateTime(dt: string | null | undefined): string {
  if (!dt) return new Date().toISOString()
  if (dt.includes('T')) return dt
  return dt.replace(' ', 'T') + '.000Z'
}

function toSqliteDateTime(dt: string | null | undefined): string {
  if (!dt) return '1970-01-01 00:00:00'
  return dt.replace('T', ' ').replace(/\.\d{3}Z$/, '').replace('Z', '')
}

function maxFieldTs(meta: FieldMeta): string {
  let max = '1970-01-01T00:00:00.000Z'
  for (const m of Object.values(meta)) {
    if (m.ts > max) max = m.ts
  }
  return max
}

/**
 * 拼出实体的 CrdtState（用于合并）。fields 与 fieldMeta 已剔除同步元数据。
 */
function rowToCrdt(row: Record<string, unknown>): { fields: Record<string, unknown>; fieldMeta: FieldMeta } {
  const fields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (NON_CRDT_COLUMNS.has(k)) continue
    fields[k] = v
  }
  const stored = parseFieldMeta((row.field_meta as string | null | undefined) ?? null)
  // 兼容旧行：未打过 stamp 的列用 sync_updated_at 合成 tick
  const fallback: Tick = {
    ts: toISODateTime((row.sync_updated_at as string | null | undefined) ?? null),
    did: LEGACY_DID,
  }
  const fieldMeta: FieldMeta = { ...stored }
  for (const f of Object.keys(fields)) {
    if (!fieldMeta[f]) fieldMeta[f] = fallback
  }
  return { fields, fieldMeta }
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
    } catch { /* sync_meta table might not exist yet */ }

    const id = uuidv4()
    try {
      dbRun(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('device_id', ?)",
        [id]
      )
    } catch { /* ignore */ }
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

    this.loadAutoSyncInterval()
    this.connectWs()
    this.schedulePeriodicSync()
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

  resetCursor(): void {
    this.lastSyncAt = null
    try {
      dbRun("DELETE FROM sync_meta WHERE key = 'last_sync_at'")
    } catch { /* ignore */ }
    if (this.token) {
      this.updateStatus({ state: 'idle', lastSyncAt: undefined })
    }
  }

  async syncNow(): Promise<void> {
    if (this.isSyncing || !this.token) {
      if (this.isSyncing) this.pendingSyncRequest = true
      return
    }

    this.isSyncing = true
    this.pendingSyncRequest = false
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
      console.error('[Sync] Error:', message, err)
      this.updateStatus({ state: 'error', message })
      throw err
    } finally {
      this.isSyncing = false
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

    for (let i = 0; i < entities.length; i += 500) {
      const batch = entities.slice(i, i + 500)
      await api.post<PushResult>(
        '/sync/push',
        { deviceId: this.deviceId, entities: batch },
        this.token
      )

      // 标记 tombstones 为已同步
      for (const e of batch) {
        if (e.tombstone) {
          dbRun(
            'UPDATE crdt_tombstones SET synced = 1 WHERE entity_type = ? AND entity_id = ?',
            [e.entityType, e.id]
          )
          // 同时清掉旧的 sync_deletes 记录（兼容期保留）
          dbRun(
            'UPDATE sync_deletes SET synced = 1 WHERE entity_type = ? AND entity_id = ?',
            [e.entityType, e.id]
          )
        }
      }
    }

    // 清理超过 30 天的已同步 tombstone（避免无限膨胀）
    dbRun("DELETE FROM crdt_tombstones WHERE synced = 1 AND ts < datetime('now', '-30 days')")
    dbRun("DELETE FROM sync_deletes WHERE synced = 1 OR deleted_at < datetime('now', '-7 days')")
  }

  private collectDirtyEntities(): SyncEntityWire[] {
    const entities: SyncEntityWire[] = []
    const sinceSqlite = toSqliteDateTime(this.lastSyncAt)
    const seen = new Set<string>() // entityType:id, 防止 tombstone 与活跃行重复推送

    // 1. 收集存活实体
    for (const { table, entityType, idField } of SYNC_TABLES) {
      const rows = dbAll<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE sync_updated_at > ?`,
        [sinceSqlite]
      )

      for (const row of rows) {
        const id = row[idField] as string
        const { fields, fieldMeta } = rowToCrdt(row)

        // snippet 的 tags 单独处理：作为伪字段挂到 _tags
        if (entityType === 'snippet') {
          const tags = dbAll<{ tag: string }>(
            'SELECT tag FROM snippet_tags WHERE snippet_id = ?',
            [id]
          )
          fields._tags = tags.map(t => t.tag)
          // _tags 没有独立 tick，蹭 row 级 tick
          if (!fieldMeta._tags) {
            fieldMeta._tags = {
              ts: toISODateTime((row.sync_updated_at as string | null) ?? null),
              did: LEGACY_DID,
            }
          }
        }

        // 加密敏感字段
        if (entityType === 'host' && e2eCrypto.hasKey()) {
          for (const f of HOST_SENSITIVE_FIELDS) {
            const v = fields[f]
            if (v && typeof v === 'string') {
              fields[f] = e2eCrypto.encrypt(v)
              fields[`${f}_encrypted`] = true
            }
          }
        }

        // 同时附带可能存在的 tombstone（极少见的活+tomb 共存场景）
        const tomb = dbGet<{ ts: string; did: string }>(
          'SELECT ts, did FROM crdt_tombstones WHERE entity_type = ? AND entity_id = ? AND synced = 0',
          [entityType, id]
        )

        entities.push({
          id,
          entityType,
          fields,
          fieldMeta,
          tombstone: tomb ? { ts: tomb.ts, did: tomb.did } : null,
          updatedAt: maxFieldTs(fieldMeta),
        })
        seen.add(`${entityType}:${id}`)
      }
    }

    // 2. 单独收集只剩 tombstone 的删除事件（业务表已无对应行）
    const tombs = dbAll<{ entity_type: string; entity_id: string; ts: string; did: string }>(
      'SELECT entity_type, entity_id, ts, did FROM crdt_tombstones WHERE synced = 0'
    )
    for (const t of tombs) {
      const key = `${t.entity_type}:${t.entity_id}`
      if (seen.has(key)) continue
      entities.push({
        id: t.entity_id,
        entityType: t.entity_type,
        fields: {},
        fieldMeta: {},
        tombstone: { ts: t.ts, did: t.did },
        updatedAt: t.ts,
      })
    }

    // 3. settings / keybinding：仍按单字段实体推送，meta 中只有 value/shortcut
    const settingsRows = dbAll<{ key: string; value: string; sync_updated_at: string }>(
      'SELECT * FROM settings WHERE sync_updated_at > ?',
      [sinceSqlite]
    )
    for (const row of settingsRows) {
      const tick: Tick = { ts: toISODateTime(row.sync_updated_at), did: LEGACY_DID }
      entities.push({
        id: row.key,
        entityType: 'settings',
        fields: { key: row.key, value: row.value },
        fieldMeta: { value: tick },
        tombstone: null,
        updatedAt: tick.ts,
      })
    }

    const kbRows = dbAll<{ action: string; shortcut: string; sync_updated_at: string }>(
      'SELECT * FROM keybindings WHERE sync_updated_at > ?',
      [sinceSqlite]
    )
    for (const row of kbRows) {
      const tick: Tick = { ts: toISODateTime(row.sync_updated_at), did: LEGACY_DID }
      entities.push({
        id: row.action,
        entityType: 'keybinding',
        fields: { action: row.action, shortcut: row.shortcut },
        fieldMeta: { shortcut: tick },
        tombstone: null,
        updatedAt: tick.ts,
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

  private static readonly TABLE_MAP = new Map(SYNC_TABLES.map(t => [t.entityType, t]))

  private getTableInfo(entityType: string): typeof SYNC_TABLES[0] | undefined {
    return SyncEngine.TABLE_MAP.get(entityType)
  }

  private applyEntity(entity: PullEntity): void {
    const { entity_type: entityType, id } = entity

    // 拉高本地时钟
    for (const m of Object.values(entity.field_meta || {})) {
      crdtClock.observe(m.ts)
    }
    if (entity.tombstone_ts) crdtClock.observe(entity.tombstone_ts)

    // settings / keybinding：单字段 LWW
    if (entityType === 'settings') {
      const local = dbGet<{ sync_updated_at: string }>(
        'SELECT sync_updated_at FROM settings WHERE key = ?',
        [id]
      )
      const remoteTs = entity.field_meta?.value?.ts ?? entity.updated_at
      if (local && toISODateTime(local.sync_updated_at) > remoteTs) return
      const value = entity.fields.value as string | undefined
      if (typeof value === 'string') {
        dbRun(
          `INSERT INTO settings (key, value, sync_updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
          [id, value, toSqliteDateTime(remoteTs)]
        )
      }
      return
    }

    if (entityType === 'keybinding') {
      const local = dbGet<{ sync_updated_at: string }>(
        'SELECT sync_updated_at FROM keybindings WHERE action = ?',
        [id]
      )
      const remoteTs = entity.field_meta?.shortcut?.ts ?? entity.updated_at
      if (local && toISODateTime(local.sync_updated_at) > remoteTs) return
      const shortcut = entity.fields.shortcut as string | undefined
      if (typeof shortcut === 'string') {
        dbRun(
          `INSERT INTO keybindings (action, shortcut, sync_updated_at) VALUES (?, ?, ?)
           ON CONFLICT(action) DO UPDATE SET shortcut = excluded.shortcut, sync_updated_at = excluded.sync_updated_at`,
          [id, shortcut, toSqliteDateTime(remoteTs)]
        )
      }
      return
    }

    const tableInfo = this.getTableInfo(entityType)
    if (!tableInfo) return

    // 解密敏感字段（hosts）
    const remoteFields: Record<string, unknown> = { ...entity.fields }
    if (entityType === 'host' && e2eCrypto.hasKey()) {
      for (const f of HOST_SENSITIVE_FIELDS) {
        if (remoteFields[`${f}_encrypted`] && typeof remoteFields[f] === 'string') {
          try {
            remoteFields[f] = e2eCrypto.decrypt(remoteFields[f] as string)
          } catch {
            console.warn(`[Sync] Failed to decrypt ${f} for ${entityType}:${id}`)
          }
          delete remoteFields[`${f}_encrypted`]
        }
      }
    }

    const remoteState: CrdtState = {
      fields: remoteFields,
      fieldMeta: entity.field_meta || {},
      tombstone: entity.tombstone_ts && entity.tombstone_did
        ? { ts: entity.tombstone_ts, did: entity.tombstone_did }
        : null,
    }

    // 读本地状态
    const localRow = dbGet<Record<string, unknown>>(
      `SELECT * FROM ${tableInfo.table} WHERE ${tableInfo.idField} = ?`,
      [id]
    )
    const localTomb = dbGet<{ ts: string; did: string }>(
      'SELECT ts, did FROM crdt_tombstones WHERE entity_type = ? AND entity_id = ?',
      [entityType, id]
    )
    let localState: CrdtState | null = null
    if (localRow) {
      const { fields, fieldMeta } = rowToCrdt(localRow)
      // snippet 把 tags 也并进 fields
      if (entityType === 'snippet') {
        const tags = dbAll<{ tag: string }>(
          'SELECT tag FROM snippet_tags WHERE snippet_id = ?',
          [id]
        )
        fields._tags = tags.map(t => t.tag)
      }
      localState = {
        fields,
        fieldMeta,
        tombstone: localTomb ? { ts: localTomb.ts, did: localTomb.did } : null,
      }
    } else if (localTomb) {
      localState = {
        fields: {},
        fieldMeta: {},
        tombstone: { ts: localTomb.ts, did: localTomb.did },
      }
    }

    const merged = mergeCrdt(localState, remoteState)

    if (isAlive(merged)) {
      this.upsertMerged(tableInfo, id, merged)
    } else {
      // 实体被 tombstone 占据，业务表删除，保留 tombstone（标记 synced=1，避免回推）
      dbRun(`DELETE FROM ${tableInfo.table} WHERE ${tableInfo.idField} = ?`, [id])
      if (entityType === 'snippet') {
        dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
      }
      if (merged.tombstone) {
        dbRun(
          `INSERT INTO crdt_tombstones (entity_type, entity_id, ts, did, synced) VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(entity_type, entity_id) DO UPDATE SET ts = excluded.ts, did = excluded.did, synced = 1`,
          [entityType, id, merged.tombstone.ts, merged.tombstone.did]
        )
      }
    }
  }

  private upsertMerged(
    tableInfo: typeof SYNC_TABLES[0],
    id: string,
    state: CrdtState
  ): void {
    const fields = { ...state.fields }
    let snippetTags: string[] | null = null
    if (tableInfo.entityType === 'snippet' && Array.isArray(fields._tags)) {
      snippetTags = fields._tags as string[]
      delete fields._tags
    }

    // 移除任何残留的同步元数据
    delete fields.sync_version
    delete fields.sync_updated_at
    delete fields.field_meta

    const cols = Object.keys(fields).filter(k => !k.endsWith('_encrypted'))
    if (cols.length === 0) return

    const placeholders = cols.map(() => '?').join(', ')
    const updates = cols
      .filter(c => c !== tableInfo.idField)
      .map(c => `${c} = excluded.${c}`)
      .join(', ')
    const values = cols.map(c => {
      const v = fields[c]
      return v === undefined || v === null
        ? null
        : typeof v === 'object'
          ? JSON.stringify(v)
          : v
    })
    const fieldMetaJson = serializeFieldMeta(state.fieldMeta)

    const sql = `INSERT INTO ${tableInfo.table} (${cols.join(', ')}, field_meta, sync_updated_at, sync_version)
         VALUES (${placeholders}, ?, datetime('now'), 1)
         ON CONFLICT(${tableInfo.idField}) DO UPDATE SET ${updates}, field_meta = excluded.field_meta, sync_updated_at = excluded.sync_updated_at, sync_version = ${tableInfo.table}.sync_version + 1`

    try {
      dbRun(sql, [...values, fieldMetaJson])
    } catch (err) {
      console.error(`[Sync] Failed to upsert ${tableInfo.entityType}:${id}:`, err)
      return
    }

    // tombstone 同步状态：实体存活时，本地 tombstone 标记为已 synced（不再推送）
    if (state.tombstone) {
      dbRun(
        `INSERT INTO crdt_tombstones (entity_type, entity_id, ts, did, synced) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET ts = excluded.ts, did = excluded.did, synced = 1`,
        [tableInfo.entityType, id, state.tombstone.ts, state.tombstone.did]
      )
    }

    if (tableInfo.entityType === 'snippet' && snippetTags) {
      dbRun('DELETE FROM snippet_tags WHERE snippet_id = ?', [id])
      for (const tag of snippetTags) {
        dbRun('INSERT INTO snippet_tags (snippet_id, tag) VALUES (?, ?)', [id, tag])
      }
    }
  }

  // ===== WebSocket =====

  private connectWs(): void {
    if (!this.token) return

    if (this.ws) {
      this.ws.removeAllListeners()
      this.ws.close()
      this.ws = null
    }

    try {
      this.ws = new WebSocket(deriveWsUrl(getServerUrl()))

      this.ws.on('open', () => {
        this.ws?.send(JSON.stringify({
          type: 'auth',
          data: { token: this.token, deviceId: this.deviceId },
        }))
        this.wsReconnectDelay = 1000
        this.wsReconnectAttempts = 0
      })

      this.ws.on('message', (rawData) => {
        try {
          const msg = JSON.parse(rawData.toString())
          if (msg.type === 'sync_notify') {
            this.syncNow().catch(console.error)
          }
        } catch { /* ignore parse errors */ }
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
// 让 IPC 层能调用 compareTick 之类的工具
export { compareTick }
