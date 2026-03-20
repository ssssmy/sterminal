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

  // 存储注册的监听器，用于组件卸载时自动清理
  const listeners: Array<{ channel: string; callback: (data: unknown) => void }> = []

  /**
   * 监听主进程推送的事件
   * 组件卸载时自动移除监听器
   */
  function on<T = unknown>(channel: string, callback: (data: T) => void): void {
    if (!ipc) {
      console.warn(`[IPC] on ${channel} - 非 Electron 环境，跳过`)
      return
    }
    const handler = (data: unknown) => callback(data as T)
    ipc.on(channel, handler)
    listeners.push({ channel, callback: handler })
  }

  /**
   * 手动移除事件监听
   */
  function off(channel: string, callback: (data: unknown) => void): void {
    if (!ipc) return
    ipc.removeListener(channel, callback)
  }

  // 组件卸载时自动清理所有监听器
  onUnmounted(() => {
    if (!ipc) return
    listeners.forEach(({ channel, callback }) => {
      ipc.removeListener(channel, callback)
    })
    listeners.length = 0
  })

  return { invoke, on, off }
}
