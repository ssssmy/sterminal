import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import '../../__tests__/test-setup'
import { mockElectronInvoke } from '../../__tests__/test-setup'
import { useHostsStore } from '../hosts.store'

describe('hosts.store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockElectronInvoke.mockReset()
  })

  describe('mapDbRow', () => {
    it('snake_case 行映射到 camelCase Host 对象', async () => {
      mockElectronInvoke.mockResolvedValueOnce([
        {
          id: 'h1',
          label: 'prod',
          address: '1.2.3.4',
          port: 2222,
          username: 'root',
          auth_type: 'key',
          key_id: 'k1',
          startup_command: 'tmux',
          keepalive_interval: 30,
          connect_timeout: 5,
          strict_host_key: 1,
          ssh_version: '2',
          group_id: 'g1',
          sort_order: 5,
          last_connected: '2026-01-01',
          connect_count: 3,
        },
      ])

      const store = useHostsStore()
      await store.fetchHosts()

      expect(store.hosts.length).toBe(1)
      const host = store.hosts[0]
      expect(host.authType).toBe('key')
      expect(host.keyId).toBe('k1')
      expect(host.startupCommand).toBe('tmux')
      expect(host.keepaliveInterval).toBe(30)
      expect(host.strictHostKey).toBe(true)
      expect(host.sshVersion).toBe('2')
      expect(host.groupId).toBe('g1')
      expect(host.sortOrder).toBe(5)
      expect(host.lastConnected).toBe('2026-01-01')
      expect(host.connectCount).toBe(3)
    })

    it('字段缺失时使用默认值', async () => {
      mockElectronInvoke.mockResolvedValueOnce([
        { id: 'h2', address: '1.1.1.1' },
      ])

      const store = useHostsStore()
      await store.fetchHosts()

      const host = store.hosts[0]
      expect(host.port).toBe(22)
      expect(host.protocol).toBe('ssh')
      expect(host.authType).toBe('password')
      expect(host.encoding).toBe('utf-8')
      expect(host.keepaliveInterval).toBe(60)
      expect(host.connectTimeout).toBe(10)
      expect(host.heartbeatTimeout).toBe(30)
      expect(host.compression).toBe(false)
      expect(host.strictHostKey).toBe(false)
      expect(host.sshVersion).toBe('auto')
      expect(host.tagIds).toEqual([])
      expect(host.connectCount).toBe(0)
    })
  })

  describe('fetchHosts', () => {
    it('IPC 返回 null 时 hosts 设为空数组', async () => {
      mockElectronInvoke.mockResolvedValueOnce(null)

      const store = useHostsStore()
      await store.fetchHosts()

      expect(store.hosts).toEqual([])
    })

    it('loading 切换 true→false', async () => {
      mockElectronInvoke.mockResolvedValueOnce([])

      const store = useHostsStore()
      const p = store.fetchHosts()
      expect(store.loading).toBe(true)
      await p
      expect(store.loading).toBe(false)
    })
  })
})
