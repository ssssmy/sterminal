// CRDT 逻辑时钟（HLC-lite）
//
// 每次本地修改都通过 now() 取一个 (ts, did) 组合作为字段更新印记：
//   - ts: ISO 时间戳，**严格单调递增**——若墙钟回退或同毫秒并发，自动加 1ms 保证单调
//   - did: 当前设备 ID（来自 sync_meta.device_id）
//
// 比较顺序：先比 ts，再比 did 字典序。任意两个 (ts, did) 都可全序比较，
// 因此并发修改不会出现"无法决胜"的情况。
//
// observe(ts) 用于在收到远端时钟时拉高本地 lastTs，避免本地时钟落后于全局已观察时间。
// 这就是经典 HLC 的物理时间部分；省略 logical counter 是因为单调化已能区分同毫秒的本机连续写入。

import { dbGet, dbRun } from './db'
import type { Tick } from './crdt-merge'

export type { Tick } from './crdt-merge'
export { compareTick } from './crdt-merge'

class CrdtClock {
  private deviceId: string | null = null
  private lastTs = 0

  private getDeviceId(): string {
    if (this.deviceId) return this.deviceId
    try {
      const row = dbGet<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'device_id'"
      )
      if (row) {
        this.deviceId = row.value
        return row.value
      }
    } catch { /* sync_meta may not exist yet */ }

    // 初始化：生成一个新的设备 ID 并持久化
    const id = `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
    try {
      dbRun(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('device_id', ?)",
        [id]
      )
    } catch { /* ignore */ }
    this.deviceId = id
    return id
  }

  /**
   * 取一次单调递增的本地时钟读数。
   */
  now(): Tick {
    const wall = Date.now()
    const next = wall > this.lastTs ? wall : this.lastTs + 1
    this.lastTs = next
    return {
      ts: new Date(next).toISOString(),
      did: this.getDeviceId(),
    }
  }

  /**
   * 拉高内部时钟到至少 ts 之后，使得后续 now() 不会落后于已观察到的远端时钟。
   * 在每次接收远端实体的字段时间戳时调用。
   */
  observe(ts: string | undefined | null): void {
    if (!ts) return
    const t = Date.parse(ts)
    if (Number.isFinite(t) && t > this.lastTs) this.lastTs = t
  }

  deviceIdSync(): string {
    return this.getDeviceId()
  }
}

export const crdtClock = new CrdtClock()
