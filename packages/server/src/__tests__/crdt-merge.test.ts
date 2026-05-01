import { describe, it, expect } from 'vitest'
import {
  mergeCrdt,
  isAlive,
  compareTick,
  parseFieldMeta,
  serializeFieldMeta,
  type CrdtState,
  type Tick,
} from '../services/crdt-merge.js'

const t = (ts: string, did: string): Tick => ({ ts, did })

describe('compareTick', () => {
  it('ts 大者获胜', () => {
    expect(compareTick(t('2026-01-01T00:00:00Z', 'a'), t('2026-01-02T00:00:00Z', 'a'))).toBeLessThan(0)
    expect(compareTick(t('2026-01-02T00:00:00Z', 'a'), t('2026-01-01T00:00:00Z', 'a'))).toBeGreaterThan(0)
  })

  it('ts 相同 → did 字典序决胜', () => {
    expect(compareTick(t('2026-01-01T00:00:00Z', 'a'), t('2026-01-01T00:00:00Z', 'b'))).toBeLessThan(0)
    expect(compareTick(t('2026-01-01T00:00:00Z', 'b'), t('2026-01-01T00:00:00Z', 'a'))).toBeGreaterThan(0)
  })

  it('完全相同 → 0', () => {
    expect(compareTick(t('2026-01-01T00:00:00Z', 'a'), t('2026-01-01T00:00:00Z', 'a'))).toBe(0)
  })
})

describe('mergeCrdt', () => {
  it('local 为 null 时直接采纳 remote（深拷贝）', () => {
    const remote: CrdtState = {
      fields: { label: 'foo' },
      fieldMeta: { label: t('2026-01-01T00:00:00Z', 'a') },
      tombstone: null,
    }
    const merged = mergeCrdt(null, remote)
    expect(merged).toEqual(remote)
    expect(merged.fields).not.toBe(remote.fields)
    expect(merged.fieldMeta).not.toBe(remote.fieldMeta)
  })

  it('字段并发：A 改 label，B 改 port → 合并保留两边', () => {
    const local: CrdtState = {
      fields: { label: 'a-label', port: 22 },
      fieldMeta: {
        label: t('2026-01-02T00:00:00Z', 'A'),
        port: t('2026-01-01T00:00:00Z', 'A'),
      },
      tombstone: null,
    }
    const remote: CrdtState = {
      fields: { label: 'b-label', port: 2222 },
      fieldMeta: {
        label: t('2026-01-01T00:00:00Z', 'B'),
        port: t('2026-01-03T00:00:00Z', 'B'),
      },
      tombstone: null,
    }
    const merged = mergeCrdt(local, remote)
    expect(merged.fields.label).toBe('a-label')   // A 的 label ts 更大
    expect(merged.fields.port).toBe(2222)         // B 的 port ts 更大
  })

  it('同字段 ts 相同 → did 字典序较大者胜', () => {
    const local: CrdtState = {
      fields: { x: 'a' },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'a') },
      tombstone: null,
    }
    const remote: CrdtState = {
      fields: { x: 'b' },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'b') },
      tombstone: null,
    }
    expect(mergeCrdt(local, remote).fields.x).toBe('b')
    expect(mergeCrdt(remote, local).fields.x).toBe('b')
  })

  it('remote 没有的字段保留 local', () => {
    const local: CrdtState = {
      fields: { a: 1, b: 2 },
      fieldMeta: { a: t('2026-01-01T00:00:00Z', 'X'), b: t('2026-01-01T00:00:00Z', 'X') },
      tombstone: null,
    }
    const remote: CrdtState = {
      fields: { a: 99 },
      fieldMeta: { a: t('2026-01-02T00:00:00Z', 'Y') },
      tombstone: null,
    }
    const merged = mergeCrdt(local, remote)
    expect(merged.fields.a).toBe(99)
    expect(merged.fields.b).toBe(2)
  })

  it('tombstone 取较大 tick', () => {
    const local: CrdtState = {
      fields: {},
      fieldMeta: {},
      tombstone: t('2026-01-01T00:00:00Z', 'A'),
    }
    const remote: CrdtState = {
      fields: {},
      fieldMeta: {},
      tombstone: t('2026-01-05T00:00:00Z', 'B'),
    }
    expect(mergeCrdt(local, remote).tombstone).toEqual(t('2026-01-05T00:00:00Z', 'B'))
  })
})

describe('isAlive', () => {
  it('无 tombstone → 存活', () => {
    expect(isAlive({ fields: {}, fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A') }, tombstone: null })).toBe(true)
  })

  it('tombstone 后任意字段都没更新 → 死亡', () => {
    expect(isAlive({
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A') },
      tombstone: t('2026-01-02T00:00:00Z', 'A'),
    })).toBe(false)
  })

  it('tombstone 后有字段更新（ts 更大）→ 复活', () => {
    expect(isAlive({
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-03T00:00:00Z', 'B') },
      tombstone: t('2026-01-02T00:00:00Z', 'A'),
    })).toBe(true)
  })

  it('tombstone 与字段同 ts，did 决胜', () => {
    // 字段 did=z > tombstone did=a → 字段胜，存活
    expect(isAlive({
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'z') },
      tombstone: t('2026-01-01T00:00:00Z', 'a'),
    })).toBe(true)

    // 字段 did=a < tombstone did=z → tombstone 胜，死亡
    expect(isAlive({
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'a') },
      tombstone: t('2026-01-01T00:00:00Z', 'z'),
    })).toBe(false)
  })
})

describe('parseFieldMeta / serializeFieldMeta', () => {
  it('round-trip 等价', () => {
    const meta = { label: t('2026-01-01T00:00:00Z', 'A'), port: t('2026-01-02T00:00:00Z', 'B') }
    expect(parseFieldMeta(serializeFieldMeta(meta))).toEqual(meta)
  })

  it('null/空字符串/非法 JSON → 空对象', () => {
    expect(parseFieldMeta(null)).toEqual({})
    expect(parseFieldMeta(undefined)).toEqual({})
    expect(parseFieldMeta('')).toEqual({})
    expect(parseFieldMeta('not json')).toEqual({})
  })
})

describe('CRDT 端到端场景', () => {
  it('删除胜：A 删除（ts 较新），B 修改（ts 较旧）→ 实体死亡', () => {
    const afterB: CrdtState = {
      fields: { label: 'b-edit' },
      fieldMeta: { label: t('2026-01-01T00:00:00Z', 'B') },
      tombstone: null,
    }
    const afterA: CrdtState = {
      fields: { label: 'orig' },
      fieldMeta: { label: t('2026-01-01T00:00:00Z', 'B') }, // A 看到的字段还是 B 推之前的
      tombstone: t('2026-01-02T00:00:00Z', 'A'),
    }
    const merged = mergeCrdt(afterB, afterA)
    expect(isAlive(merged)).toBe(false)
  })

  it('修改胜：A 删除（ts 较旧），B 修改（ts 较新）→ 实体复活', () => {
    const afterA: CrdtState = {
      fields: {},
      fieldMeta: {},
      tombstone: t('2026-01-01T00:00:00Z', 'A'),
    }
    const afterB: CrdtState = {
      fields: { label: 'b-edit' },
      fieldMeta: { label: t('2026-01-02T00:00:00Z', 'B') },
      tombstone: null,
    }
    const merged = mergeCrdt(afterA, afterB)
    expect(isAlive(merged)).toBe(true)
    expect(merged.fields.label).toBe('b-edit')
    // tombstone 仍保留，但被字段超越
    expect(merged.tombstone).toEqual(t('2026-01-01T00:00:00Z', 'A'))
  })

  it('合并是可交换的（commutative）', () => {
    const a: CrdtState = {
      fields: { x: 1, y: 'a' },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A'), y: t('2026-01-03T00:00:00Z', 'A') },
      tombstone: null,
    }
    const b: CrdtState = {
      fields: { x: 2, y: 'b' },
      fieldMeta: { x: t('2026-01-02T00:00:00Z', 'B'), y: t('2026-01-02T00:00:00Z', 'B') },
      tombstone: null,
    }
    const ab = mergeCrdt(a, b)
    const ba = mergeCrdt(b, a)
    expect(ab.fields).toEqual(ba.fields)
    expect(ab.fieldMeta).toEqual(ba.fieldMeta)
  })

  it('合并是幂等的（idempotent）', () => {
    const s: CrdtState = {
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A') },
      tombstone: t('2026-01-02T00:00:00Z', 'A'),
    }
    const once = mergeCrdt(s, s)
    const twice = mergeCrdt(once, s)
    expect(once.fields).toEqual(twice.fields)
    expect(once.fieldMeta).toEqual(twice.fieldMeta)
    expect(once.tombstone).toEqual(twice.tombstone)
  })

  it('合并是结合的（associative）', () => {
    const a: CrdtState = {
      fields: { x: 1 },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A') },
      tombstone: null,
    }
    const b: CrdtState = {
      fields: { x: 2 },
      fieldMeta: { x: t('2026-01-02T00:00:00Z', 'B') },
      tombstone: null,
    }
    const c: CrdtState = {
      fields: { y: 9 },
      fieldMeta: { y: t('2026-01-03T00:00:00Z', 'C') },
      tombstone: null,
    }
    const lhs = mergeCrdt(mergeCrdt(a, b), c)
    const rhs = mergeCrdt(a, mergeCrdt(b, c))
    expect(lhs.fields).toEqual(rhs.fields)
    expect(lhs.fieldMeta).toEqual(rhs.fieldMeta)
  })
})
