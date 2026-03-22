// Electron 预加载脚本
// 通过 contextBridge 向渲染进程安全暴露 IPC API

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// 暴露给渲染进程的 electronAPI
const electronAPI = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  homePath: process.env.HOME || process.env.USERPROFILE || '',

  ipc: {
    /**
     * 向主进程发送请求并等待响应（invoke/handle 模式）
     */
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      return ipcRenderer.invoke(channel, ...args)
    },

    /**
     * 监听主进程推送的事件（on 模式）
     */
    on(channel: string, callback: (data: unknown) => void): void {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on(channel, handler)
      // 将 handler 引用存储到回调函数上，以便后续移除
      ;(callback as { _handler?: typeof handler })._handler = handler
    },

    /**
     * 移除主进程事件监听
     */
    removeListener(channel: string, callback: (data: unknown) => void): void {
      const handler = (callback as { _handler?: (...args: unknown[]) => void })._handler
      if (handler) {
        ipcRenderer.removeListener(channel, handler)
      }
    },
  },
}

// 通过 contextBridge 安全暴露 API（不暴露 Node.js 内置模块）
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// TypeScript 类型声明，供渲染进程使用
export type ElectronAPI = typeof electronAPI
