// IPC 调用封装 Composable
// 封装对 window.electronAPI.ipc 的调用，提供类型安全的接口

import { onUnmounted } from 'vue'

// electronAPI 类型声明（由 preload/index.ts 注入到 window）
interface ElectronIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (data: unknown) => void): void
  removeListener(channel: string, callback: (data: unknown) => void): void
}

interface ElectronAPI {
  platform: 'darwin' | 'win32' | 'linux'
  ipc: ElectronIpc
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

/**
 * IPC 调用封装
 * 在非 Electron 环境（如浏览器开发）中提供降级处理
 */
export function useIpc() {
  const ipc = window.electronAPI?.ipc

  /**
   * 向主进程发送请求并等待响应
   */
  async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    if (!ipc) {
      console.warn(`[IPC] invoke ${channel} - 非 Electron 环境，跳过`)
      return undefined as T
    }
    return ipc.invoke(channel, ...args) as Promise<T>
  }

  // 原始回调 → preload 注册的 wrapper 映射，确保 off() 能正确移除
  const callbackMap = new Map<(data: unknown) => void, (data: unknown) => void>()
  // 自动清理列表
  const listeners: Array<{ channel: string; wrapper: (data: unknown) => void }> = []

  /**
   * 监听主进程推送的事件
   * 组件卸载时自动移除监听器
   */
  function on<T = unknown>(channel: string, callback: (data: T) => void): void {
    if (!ipc) {
      console.warn(`[IPC] on ${channel} - 非 Electron 环境，跳过`)
      return
    }
    // 直接传入 callback（不再额外包装），让 preload 的 _handler 机制正常工作
    const wrapper = callback as (data: unknown) => void
    ipc.on(channel, wrapper)
    callbackMap.set(wrapper, wrapper)
    listeners.push({ channel, wrapper })
  }

  /**
   * 手动移除事件监听
   */
  function off(channel: string, callback: (data: unknown) => void): void {
    if (!ipc) return
    ipc.removeListener(channel, callback)
    callbackMap.delete(callback)
    // 同时从自动清理列表中移除，避免 onUnmounted 重复移除
    const idx = listeners.findIndex(l => l.channel === channel && l.wrapper === callback)
    if (idx !== -1) listeners.splice(idx, 1)
  }

  // 组件卸载时自动清理所有监听器
  onUnmounted(() => {
    if (!ipc) return
    listeners.forEach(({ channel, wrapper }) => {
      ipc.removeListener(channel, wrapper)
    })
    listeners.length = 0
    callbackMap.clear()
  })

  return { invoke, on, off }
}
