import { describe, it, expect, vi, beforeEach } from 'vitest'

// 模拟 window.electronAPI
const mockIpc = {
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}

vi.stubGlobal('electronAPI', {
  platform: 'darwin',
  homePath: '/Users/test',
  ipc: mockIpc,
  getPathForFile: vi.fn(),
})

// 动态导入避免在 stub 前加载
const { useIpc } = await import('./useIpc')

// useIpc 内部调用了 onUnmounted，需要在 Vue composition context 中运行
// 用 withSetup 工厂简化测试
import { createApp, defineComponent, h } from 'vue'
function withSetup<T>(composable: () => T): T {
  let result!: T
  const app = createApp(defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  }))
  const el = document.createElement('div')
  app.mount(el)
  app.unmount()
  return result
}

describe('useIpc - invoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 ipc.invoke 并返回结果', async () => {
    mockIpc.invoke.mockResolvedValue({ id: 1 })

    const { invoke } = withSetup(() => useIpc())
    const result = await invoke('test:channel', 'arg1')

    expect(mockIpc.invoke).toHaveBeenCalledWith('test:channel', 'arg1')
    expect(result).toEqual({ id: 1 })
  })

  it('非 Electron 环境下返回 undefined', async () => {
    vi.stubGlobal('electronAPI', undefined)

    const { invoke } = withSetup(() => useIpc())
    const result = await invoke('test:channel')
    expect(result).toBeUndefined()

    // 恢复
    vi.stubGlobal('electronAPI', { platform: 'darwin', homePath: '/Users/test', ipc: mockIpc, getPathForFile: vi.fn() })
  })
})

describe('useIpc - on/off', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 模拟 on 存储 _handler
    mockIpc.on.mockImplementation((channel, cb) => {
      cb._handler = cb
    })
  })

  it('注册事件监听', () => {
    const cb = vi.fn()
    const { on } = withSetup(() => useIpc())
    on('ssh:data', cb)
    expect(mockIpc.on).toHaveBeenCalledWith('ssh:data', cb)
  })

  it('off 移除指定监听', () => {
    const cb = vi.fn() as unknown as ((data: unknown) => void) & { _handler?: unknown }
    cb._handler = cb
    const { on, off } = withSetup(() => useIpc())
    on('ssh:data', cb)
    off('ssh:data', cb)
    expect(mockIpc.removeListener).toHaveBeenCalledWith('ssh:data', cb)
  })
})
