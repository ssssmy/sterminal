import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import '../../__tests__/test-setup'
import { useSessionsStore } from '../sessions.store'

describe('sessions.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('createTab', () => {
    it('创建本地终端标签：tabs 增加 1，activeTabId 指向新 tab，terminalInstances 增加 1', () => {
      const store = useSessionsStore()
      const tab = store.createTab('Test', 'local')

      expect(store.tabs.length).toBe(1)
      expect(store.activeTabId).toBe(tab.id)
      expect(store.terminalInstances.size).toBe(1)
      expect(tab.label).toBe('Test')
      expect(tab.root.type).toBe('terminal')
    })

    it('SSH 类型 tab 在 instance 上记录 hostId', () => {
      const store = useSessionsStore()
      const tab = store.createTab('prod', 'ssh', 'host-uuid-1')

      expect(tab.root.type).toBe('terminal')
      const terminalId = (tab.root as { type: 'terminal'; terminalId: string }).terminalId
      const instance = store.terminalInstances.get(terminalId)!
      expect(instance.type).toBe('ssh')
      expect(instance.hostId).toBe('host-uuid-1')
    })

    it('未指定 label 时 fallback 到默认中文文案', () => {
      const store = useSessionsStore()
      const localTab = store.createTab(undefined, 'local')
      const sshTab = store.createTab(undefined, 'ssh', 'host-x')

      expect(localTab.label).toBe('本地终端')
      expect(sshTab.label).toBe('远程主机')
    })
  })

  describe('switchTab', () => {
    it('切换到合法的 tabId 后 activeTabId 更新', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('A')
      const t2 = store.createTab('B')

      expect(store.activeTabId).toBe(t2.id) // 默认指向最新
      store.switchTab(t1.id)
      expect(store.activeTabId).toBe(t1.id)
    })

    it('切换到不存在的 tabId 时不变更', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('A')
      store.switchTab('non-existent')
      expect(store.activeTabId).toBe(t1.id)
    })
  })

  describe('closeTab', () => {
    it('关闭活跃 tab 后切换到相邻 tab', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('A')
      const t2 = store.createTab('B')
      const t3 = store.createTab('C')

      store.switchTab(t2.id)
      store.closeTab(t2.id)

      expect(store.tabs.length).toBe(2)
      // 关闭中间的 tab 后，应切换到 idx=1（即 t3，因为 t1, t3 剩下，t2 在中间被删）
      expect(store.activeTabId).toBe(t3.id)
    })

    it('关闭最后一个 tab 后 activeTabId = null', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('only')
      store.closeTab(t1.id)

      expect(store.tabs.length).toBe(0)
      expect(store.activeTabId).toBeNull()
    })

    it('关闭非活跃 tab 时 activeTabId 不变', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('A')
      const t2 = store.createTab('B')

      store.switchTab(t1.id)
      store.closeTab(t2.id)
      expect(store.activeTabId).toBe(t1.id)
    })

    it('关闭 tab 后清理 terminalInstances', () => {
      const store = useSessionsStore()
      const t1 = store.createTab('A')
      expect(store.terminalInstances.size).toBe(1)

      store.closeTab(t1.id)
      expect(store.terminalInstances.size).toBe(0)
    })
  })

  describe('splitPane', () => {
    it('对单终端 tab 水平分屏：root 变为 split，新 terminalId 加入 instances', () => {
      const store = useSessionsStore()
      const tab = store.createTab('A')
      const sourceId = (tab.root as { type: 'terminal'; terminalId: string }).terminalId

      const newId = store.splitPane(tab.id, sourceId, 'horizontal')

      expect(newId).toBeTruthy()
      expect(newId).not.toBe(sourceId)
      const updated = store.tabs.find(t => t.id === tab.id)!
      expect(updated.root.type).toBe('split')
      expect(store.terminalInstances.size).toBe(2)
    })

    it('分屏后新终端继承源终端的 type / hostId', () => {
      const store = useSessionsStore()
      const tab = store.createTab('ssh', 'ssh', 'host-99')
      const sourceId = (tab.root as { type: 'terminal'; terminalId: string }).terminalId

      const newId = store.splitPane(tab.id, sourceId, 'vertical')
      const newInstance = store.terminalInstances.get(newId)!
      expect(newInstance.type).toBe('ssh')
      expect(newInstance.hostId).toBe('host-99')
    })
  })

  describe('connectedHostIds (computed)', () => {
    it('SSH 实例 sshStatus=connected 时计入 connectedHostIds', () => {
      const store = useSessionsStore()
      const tab = store.createTab('ssh', 'ssh', 'host-A')
      const sshTermId = (tab.root as { type: 'terminal'; terminalId: string }).terminalId
      const instance = store.terminalInstances.get(sshTermId)!
      instance.sshStatus = 'connected'
      // 触发响应式：直接 set 回 Map
      store.terminalInstances.set(sshTermId, { ...instance })

      expect(store.connectedHostIds.has('host-A')).toBe(true)
    })

    it('未连接的 SSH 实例不计入', () => {
      const store = useSessionsStore()
      const tab = store.createTab('ssh', 'ssh', 'host-B')
      // sshStatus 默认未设置（undefined）
      expect(store.connectedHostIds.has('host-B')).toBe(false)
    })
  })

  describe('createSftpTab', () => {
    it('SFTP 标签携带 sftpMeta，contentType=sftp', () => {
      const store = useSessionsStore()
      const tab = store.createSftpTab('host-X', 'prod-server', 'conn-1')

      expect(tab.contentType).toBe('sftp')
      expect(tab.sftpMeta).toEqual({
        connectionId: 'conn-1',
        hostId: 'host-X',
        hostLabel: 'prod-server',
      })
      expect(tab.label).toContain('SFTP:')
    })
  })
})
