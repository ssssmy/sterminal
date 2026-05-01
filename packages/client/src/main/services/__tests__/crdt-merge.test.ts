// 客户端 crdt-merge 纯函数单元测试。算法应当与服务端副本完全等价。
import { describe, it, expect } from 'vitest'
import {
  mergeCrdt,
  isAlive,
  bumpFieldMeta,
  parseFieldMeta,
  serializeFieldMeta,
  compareTick,
  type CrdtState,
  type FieldMeta,
  type Tick,
} from '../crdt-merge'

const t = (ts: string, did: string): Tick => ({ ts, did })

describe('compareTick', () => {
  it('严格全序：先比 ts 再比 did 字典序', () => {
    expect(compareTick(t('A', 'a'), t('B', 'a'))).toBeLessThan(0)
    expect(compareTick(t('A', 'a'), t('A', 'b'))).toBeLessThan(0)
    expect(compareTick(t('A', 'a'), t('A', 'a'))).toBe(0)
    expect(compareTick(t('B', 'a'), t('A', 'b'))).toBeGreaterThan(0)
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

  it('字段并发：A 改 label，B 改 port → 合并保留两边修改', () => {
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
    expect(merged.fields.label).toBe('a-label')
    expect(merged.fields.port).toBe(2222)
  })

  it('同字段同 ts → did 字典序较大者胜', () => {
    const a: CrdtState = {
      fields: { x: 'a' },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'a') },
      tombstone: null,
    }
    const b: CrdtState = {
      fields: { x: 'b' },
      fieldMeta: { x: t('2026-01-01T00:00:00Z', 'b') },
      tombstone: null,
    }
    expect(mergeCrdt(a, b).fields.x).toBe('b')
    expect(mergeCrdt(b, a).fields.x).toBe('b')
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
    expect(isAlive({ fields: {}, fieldMeta: { x: t('A', 'A') }, tombstone: null })).toBe(true)
  })

  it('tombstone 后字段都更旧 → 死亡', () => {
    expect(
      isAlive({
        fields: { x: 1 },
        fieldMeta: { x: t('2026-01-01T00:00:00Z', 'A') },
        tombstone: t('2026-01-02T00:00:00Z', 'A'),
      })
    ).toBe(false)
  })

  it('tombstone 后有字段更新（ts 更大）→ 复活', () => {
    expect(
      isAlive({
        fields: { x: 1 },
        fieldMeta: { x: t('2026-01-03T00:00:00Z', 'B') },
        tombstone: t('2026-01-02T00:00:00Z', 'A'),
      })
    ).toBe(true)
  })
})

describe('bumpFieldMeta', () => {
  it('只更新 changedFields，未变更字段保留原 tick', () => {
    const old: FieldMeta = {
      a: t('2026-01-01T00:00:00Z', 'X'),
      b: t('2026-01-01T00:00:00Z', 'X'),
    }
    const next = bumpFieldMeta(old, ['a'], t('2026-01-02T00:00:00Z', 'Y'))
    expect(next.a).toEqual(t('2026-01-02T00:00:00Z', 'Y'))
    expect(next.b).toEqual(t('2026-01-01T00:00:00Z', 'X'))
    // 不可变：原对象未被修改
    expect(old.a).toEqual(t('2026-01-01T00:00:00Z', 'X'))
  })
})

describe('parseFieldMeta / serializeFieldMeta', () => {
  it('round-trip', () => {
    const meta: FieldMeta = { label: t('2026-01-01T00:00:00Z', 'A') }
    expect(parseFieldMeta(serializeFieldMeta(meta))).toEqual(meta)
  })
  it('null/undefined/非法 JSON → 空对象', () => {
    expect(parseFieldMeta(null)).toEqual({})
    expect(parseFieldMeta(undefined)).toEqual({})
    expect(parseFieldMeta('!')).toEqual({})
  })
})

describe('CRDT 代数性质', () => {
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
  const c: CrdtState = {
    fields: { y: 'c' },
    fieldMeta: { y: t('2026-01-04T00:00:00Z', 'C') },
    tombstone: null,
  }

  it('交换律：merge(a,b) = merge(b,a)', () => {
    const ab = mergeCrdt(a, b)
    const ba = mergeCrdt(b, a)
    expect(ab.fields).toEqual(ba.fields)
    expect(ab.fieldMeta).toEqual(ba.fieldMeta)
  })

  it('幂等：merge(s,s) = s', () => {
    const s = mergeCrdt(a, b)
    const ss = mergeCrdt(s, s)
    expect(ss).toEqual(s)
  })

  it('结合律：merge(merge(a,b), c) = merge(a, merge(b,c))', () => {
    const lhs = mergeCrdt(mergeCrdt(a, b), c)
    const rhs = mergeCrdt(a, mergeCrdt(b, c))
    expect(lhs.fields).toEqual(rhs.fields)
    expect(lhs.fieldMeta).toEqual(rhs.fieldMeta)
  })
})

describe('删除 vs 修改场景', () => {
  it('A 删除（ts 较新）vs B 修改（ts 较旧）→ 实体死亡', () => {
    const afterB: CrdtState = {
      fields: { label: 'b-edit' },
      fieldMeta: { label: t('2026-01-01T00:00:00Z', 'B') },
      tombstone: null,
    }
    const afterA: CrdtState = {
      fields: { label: 'orig' },
      fieldMeta: { label: t('2026-01-01T00:00:00Z', 'B') },
      tombstone: t('2026-01-02T00:00:00Z', 'A'),
    }
    expect(isAlive(mergeCrdt(afterB, afterA))).toBe(false)
  })

  it('A 删除（ts 较旧）vs B 修改（ts 较新）→ 实体复活，字段为 B 的值', () => {
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
    expect(merged.tombstone).toEqual(t('2026-01-01T00:00:00Z', 'A')) // 仍保留但被字段超越
  })
})
