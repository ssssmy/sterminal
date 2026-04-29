import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import '../../__tests__/test-setup'
import { mockElectronInvoke } from '../../__tests__/test-setup'
import { useSnippetsStore } from '../snippets.store'
import type { Snippet } from '@shared/types/snippet'

/** 测试用 Snippet 工厂：填齐必填字段，可覆盖 */
function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'id-' + Math.random().toString(36).slice(2, 8),
    name: 'snippet',
    content: 'echo hi',
    tags: [],
    sortOrder: 0,
    useCount: 0,
    ...overrides,
  }
}

describe('snippets.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronInvoke.mockReset()
  })

  describe('fetchSnippets', () => {
    it('调用 IPC 后填充 snippets，loading 切换 true→false', async () => {
      mockElectronInvoke.mockResolvedValueOnce([
        makeSnippet({ id: '1', name: 'a', content: 'echo a', sortOrder: 0 }),
        makeSnippet({ id: '2', name: 'b', content: 'echo b', sortOrder: 1 }),
      ])

      const store = useSnippetsStore()
      const promise = store.fetchSnippets()
      expect(store.loading).toBe(true)
      await promise
      expect(store.loading).toBe(false)
      expect(store.snippets.length).toBe(2)
    })

    it('IPC 返回 null/undefined 时 snippets 设为空数组', async () => {
      mockElectronInvoke.mockResolvedValueOnce(null)
      const store = useSnippetsStore()
      await store.fetchSnippets()
      expect(store.snippets).toEqual([])
    })
  })

  describe('createSnippet', () => {
    it('成功创建后追加到 snippets', async () => {
      const created = makeSnippet({ id: 'new', name: 'new', content: 'echo' })
      mockElectronInvoke.mockResolvedValueOnce(created)

      const store = useSnippetsStore()
      const result = await store.createSnippet({ name: 'new', content: 'echo' })

      expect(result).toEqual(created)
      expect(store.snippets.length).toBe(1)
      expect(store.snippets[0]).toEqual(created)
    })
  })

  describe('updateSnippet', () => {
    it('更新已存在片段时替换数组中的旧值', async () => {
      const original = makeSnippet({ id: '1', name: 'old', content: 'a' })
      const updated: Snippet = { ...original, name: 'new' }

      const store = useSnippetsStore()
      store.snippets.push(original)
      mockElectronInvoke.mockResolvedValueOnce(updated)

      await store.updateSnippet('1', { name: 'new' })
      expect(store.snippets[0].name).toBe('new')
    })
  })

  describe('snippetsByGroup (computed)', () => {
    it('按 groupId 分组，每组按 sortOrder 升序', () => {
      const store = useSnippetsStore()
      store.snippets.push(
        makeSnippet({ id: '1', name: 'b', content: '', groupId: 'g1', sortOrder: 1 }),
        makeSnippet({ id: '2', name: 'a', content: '', groupId: 'g1', sortOrder: 0 }),
        makeSnippet({ id: '3', name: 'c', content: '' }),
      )

      const map = store.snippetsByGroup
      expect(map.get('g1')!.map(s => s.id)).toEqual(['2', '1'])
      expect(map.get(null)!.map(s => s.id)).toEqual(['3'])
    })
  })

  describe('ungroupedSnippets (computed)', () => {
    it('返回所有 groupId 为空/null 的片段', () => {
      const store = useSnippetsStore()
      store.snippets.push(
        makeSnippet({ id: '1', name: 'x', content: '', groupId: 'g' }),
        makeSnippet({ id: '2', name: 'y', content: '' }),
      )

      expect(store.ungroupedSnippets.map(s => s.id)).toEqual(['2'])
    })
  })
})
