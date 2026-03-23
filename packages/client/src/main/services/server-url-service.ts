import { ipcMain } from 'electron'
import { dbGet, dbRun } from './db'
import { IPC_SERVER } from '../../shared/types/ipc-channels'
import { normalizeServerUrl, DEFAULT_SERVER_URL } from '../../shared/utils/server-url'

let cachedUrl: string | null = null

export function getServerUrl(): string {
  if (cachedUrl) return cachedUrl
  try {
    const row = dbGet<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['server.url'])
    if (row) {
      const val = JSON.parse(row.value)
      if (typeof val === 'string' && val) {
        cachedUrl = val
        return val
      }
    }
  } catch { /* use default */ }
  return DEFAULT_SERVER_URL
}

export function setServerUrl(url: string): void {
  const normalized = normalizeServerUrl(url)
  dbRun(
    `INSERT INTO settings (key, value, sync_updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, sync_updated_at = excluded.sync_updated_at`,
    ['server.url', JSON.stringify(normalized)]
  )
  cachedUrl = normalized
}

export function registerServerUrlHandlers(): void {
  ipcMain.handle(IPC_SERVER.GET_URL, () => getServerUrl())
  ipcMain.handle(IPC_SERVER.SET_URL, (_event, url: string) => {
    setServerUrl(url)
  })
}
