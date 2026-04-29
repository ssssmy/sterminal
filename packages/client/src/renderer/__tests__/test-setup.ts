/**
 * 渲染层测试通用 setup
 *
 * 在测试文件顶部 import './__tests__/test-setup' 即可获得：
 *   - window.electronAPI mock（platform / ipc.invoke / ipc.on / getPathForFile）
 *   - 默认的 invoke mock（每个测试可通过 mockElectronInvoke 重写）
 *   - i18n stub（vue-i18n 的 useI18n 直接返回身份函数）
 *
 * 测试要求：
 *   - 在每个 beforeEach 调用 setActivePinia(createPinia())，避免跨测试污染
 *   - 调用 IPC 的 store 测试需用 vi.mocked(window.electronAPI.ipc.invoke)
 */
import { vi } from 'vitest'

// ===== window.electronAPI mock =====

const ipcInvoke = vi.fn()
const ipcOn = vi.fn()
const ipcOff = vi.fn()
const ipcRemoveListener = vi.fn()

vi.stubGlobal('electronAPI', {
  platform: 'darwin',
  homePath: '/Users/test',
  appVersion: '0.1.0-test',
  ipc: {
    invoke: ipcInvoke,
    on: ipcOn,
    off: ipcOff,
    removeListener: ipcRemoveListener,
  },
  getPathForFile: vi.fn((file: File) => (file as unknown as { path?: string }).path || ''),
})

export const mockElectronInvoke = ipcInvoke
export const mockElectronOn = ipcOn
export const mockElectronOff = ipcOff
export const mockElectronRemoveListener = ipcRemoveListener

// ===== vue-i18n stub =====
// useI18n() 返回身份化的 t 函数，避免组件因 i18n 未配置报错
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, _params?: Record<string, unknown>) => key,
    locale: { value: 'zh-CN' },
  }),
  createI18n: () => ({ install: () => {} }),
}))

// ===== Element Plus 通知静默 =====
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    }),
    ElMessageBox: {
      confirm: vi.fn().mockResolvedValue(true),
      alert: vi.fn().mockResolvedValue(true),
      prompt: vi.fn().mockResolvedValue({ value: 'ok' }),
    },
    ElNotification: vi.fn(),
  }
})
