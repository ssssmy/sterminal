// PTY（本地终端）IPC Handler
// 集成 node-pty 实现本地 PTY 进程管理

import { ipcMain } from 'electron'
import * as pty from 'node-pty'
import { IPC_PTY } from '../../shared/types/ipc-channels'

// PTY 实例映射表（ptyId → 进程实例）
const ptyProcesses = new Map<string, pty.IPty>()
let idCounter = 0

/**
 * 注册所有 PTY 相关的 IPC handlers
 */
export function registerPtyHandlers(): void {
  // 启动本地 PTY 进程
  ipcMain.handle(IPC_PTY.SPAWN, (event, params: {
    shell?: string
    args?: string[]
    cwd?: string
    env?: Record<string, string>
    cols: number
    rows: number
  }) => {
    const ptyId = `pty_${++idCounter}_${Date.now()}`

    const defaultShell = process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL || '/bin/zsh'

    const ptyProcess = pty.spawn(
      params.shell || defaultShell,
      params.args || [],
      {
        name: 'xterm-256color',
        cols: params.cols || 80,
        rows: params.rows || 24,
        cwd: params.cwd || process.env.HOME || '/',
        env: { ...process.env, ...params.env } as Record<string, string>,
      }
    )

    ptyProcesses.set(ptyId, ptyProcess)

    const webContents = event.sender

    // 监听 PTY 输出数据，转发到渲染进程
    ptyProcess.onData((data: string) => {
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_PTY.DATA, { ptyId, data })
      }
    })

    // 监听 PTY 退出
    ptyProcess.onExit(({ exitCode }) => {
      ptyProcesses.delete(ptyId)
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_PTY.EXIT, { ptyId, exitCode })
      }
    })

    return { ptyId }
  })

  // 写入数据到 PTY（渲染进程输入）
  ipcMain.handle(IPC_PTY.WRITE, (_event, params: { ptyId: string; data: string }) => {
    const proc = ptyProcesses.get(params.ptyId)
    if (proc) {
      proc.write(params.data)
    }
  })

  // 调整 PTY 终端大小
  ipcMain.handle(IPC_PTY.RESIZE, (_event, params: { ptyId: string; cols: number; rows: number }) => {
    const proc = ptyProcesses.get(params.ptyId)
    if (proc) {
      proc.resize(params.cols, params.rows)
    }
  })

  // 终止 PTY 进程
  ipcMain.handle(IPC_PTY.KILL, (_event, params: { ptyId: string }) => {
    const proc = ptyProcesses.get(params.ptyId)
    if (proc) {
      proc.kill()
      ptyProcesses.delete(params.ptyId)
    }
  })
}

/**
 * 清理所有 PTY 进程（应用退出时调用）
 */
export function killAllPty(): void {
  for (const [, proc] of ptyProcesses) {
    proc.kill()
  }
  ptyProcesses.clear()
}
