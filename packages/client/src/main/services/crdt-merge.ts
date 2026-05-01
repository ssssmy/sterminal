// CRDT 字段级合并算法
//
// 单一实体由 (fields, fieldMeta, tombstone) 组成：
//   - fields:    {字段名 -> 值}
//   - fieldMeta: {字段名 -> {ts, did}}，每个字段最近一次写入的逻辑时钟
//   - tombstone: {ts, did} | null，删除事件的逻辑时钟
//
// 合并规则：
//   1. 对 (local.fieldMeta ∪ remote.fieldMeta) 中每个字段 f，
//      取较大 tick 的一边作为 merged.fields[f] 与 merged.fieldMeta[f]。
//   2. 对 tombstone，取较大 tick 的一边。
//   3. **存活判定**：实体存活 ⇔ 存在某字段 f 使 fieldMeta[f] > tombstone。
//      这意味着"删除后又被写入新字段"会令实体复活；反之"修改在删除前"会被覆盖。
//
// 该模块纯函数、可测试，无外部副作用，客户端 / 服务端共用同一份算法。

export interface Tick {
  ts: string
  did: string
}

/**
 * 比较两个 Tick：a < b 返回负数，a == b 返回 0，a > b 返回正数。
 */
export function compareTick(a: Tick, b: Tick): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
  if (a.did === b.did) return 0
  return a.did < b.did ? -1 : 1
}

export type FieldMeta = Record<string, Tick>

export interface CrdtState {
  fields: Record<string, unknown>
  fieldMeta: FieldMeta
  tombstone: Tick | null
}

/**
 * 对照 local 与 remote 做字段级合并。
 * - local 为 null 时表示本地没有，直接采纳 remote。
 * - 不会修改入参；返回新对象。
 */
export function mergeCrdt(local: CrdtState | null, remote: CrdtState): CrdtState {
  if (!local) {
    return {
      fields: { ...remote.fields },
      fieldMeta: { ...remote.fieldMeta },
      tombstone: remote.tombstone ? { ...remote.tombstone } : null,
    }
  }

  const merged: CrdtState = {
    fields: { ...local.fields },
    fieldMeta: { ...local.fieldMeta },
    tombstone: local.tombstone ? { ...local.tombstone } : null,
  }

  const allFields = new Set([
    ...Object.keys(local.fieldMeta),
    ...Object.keys(remote.fieldMeta),
  ])
  for (const f of allFields) {
    const lm = local.fieldMeta[f]
    const rm = remote.fieldMeta[f]
    if (!rm) continue              // remote 没有该字段，保留 local
    if (!lm || compareTick(rm, lm) > 0) {
      merged.fields[f] = remote.fields[f]
      merged.fieldMeta[f] = rm
    }
  }

  if (remote.tombstone) {
    if (!merged.tombstone || compareTick(remote.tombstone, merged.tombstone) > 0) {
      merged.tombstone = { ...remote.tombstone }
    }
  }

  return merged
}

/**
 * 实体是否存活：
 *   - 没有 tombstone ⇒ 存活
 *   - 有 tombstone：若存在 fieldMeta[f] > tombstone ⇒ 复活
 */
export function isAlive(state: CrdtState): boolean {
  if (!state.tombstone) return true
  for (const m of Object.values(state.fieldMeta)) {
    if (compareTick(m, state.tombstone) > 0) return true
  }
  return false
}

/**
 * 给定旧 fieldMeta 与本次写入的字段集合，返回新 fieldMeta。
 * 调用方必须保证 tick 来自 crdtClock.now()，保证 ts 单调。
 */
export function bumpFieldMeta(
  oldMeta: FieldMeta,
  changedFields: string[],
  tick: Tick
): FieldMeta {
  const next: FieldMeta = { ...oldMeta }
  for (const f of changedFields) {
    next[f] = tick
  }
  return next
}

/**
 * 解析持久化的 field_meta JSON；解析失败返回空对象。
 */
export function parseFieldMeta(raw: string | null | undefined): FieldMeta {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object') return obj as FieldMeta
  } catch { /* fall through */ }
  return {}
}

export function serializeFieldMeta(meta: FieldMeta): string {
  return JSON.stringify(meta)
}
