// CRDT 字段级合并算法（服务端副本）
//
// 与客户端 packages/client/src/main/services/crdt-merge.ts 保持算法一致。
// 服务端在 push 时用此函数合并入库，确保多设备并发写入下的最终一致性。

export interface Tick {
  ts: string;
  did: string;
}

export type FieldMeta = Record<string, Tick>;

export interface CrdtState {
  fields: Record<string, unknown>;
  fieldMeta: FieldMeta;
  tombstone: Tick | null;
}

export function compareTick(a: Tick, b: Tick): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.did === b.did) return 0;
  return a.did < b.did ? -1 : 1;
}

export function mergeCrdt(local: CrdtState | null, remote: CrdtState): CrdtState {
  if (!local) {
    return {
      fields: { ...remote.fields },
      fieldMeta: { ...remote.fieldMeta },
      tombstone: remote.tombstone ? { ...remote.tombstone } : null,
    };
  }

  const merged: CrdtState = {
    fields: { ...local.fields },
    fieldMeta: { ...local.fieldMeta },
    tombstone: local.tombstone ? { ...local.tombstone } : null,
  };

  const allFields = new Set([
    ...Object.keys(local.fieldMeta),
    ...Object.keys(remote.fieldMeta),
  ]);
  for (const f of allFields) {
    const lm = local.fieldMeta[f];
    const rm = remote.fieldMeta[f];
    if (!rm) continue;
    if (!lm || compareTick(rm, lm) > 0) {
      merged.fields[f] = remote.fields[f];
      merged.fieldMeta[f] = rm;
    }
  }

  if (remote.tombstone) {
    if (!merged.tombstone || compareTick(remote.tombstone, merged.tombstone) > 0) {
      merged.tombstone = { ...remote.tombstone };
    }
  }

  return merged;
}

export function isAlive(state: CrdtState): boolean {
  if (!state.tombstone) return true;
  for (const m of Object.values(state.fieldMeta)) {
    if (compareTick(m, state.tombstone) > 0) return true;
  }
  return false;
}

export function parseFieldMeta(raw: string | null | undefined): FieldMeta {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as FieldMeta;
  } catch { /* fall through */ }
  return {};
}

export function serializeFieldMeta(meta: FieldMeta): string {
  return JSON.stringify(meta);
}
