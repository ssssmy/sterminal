// 终端补全 IPC Handler

import { ipcMain } from 'electron'
import { IPC_COMPLETION } from '../../shared/types/ipc-channels'
import { completionEngine } from '../services/completion/completion-engine'
import { HistoryProvider } from '../services/completion/history-provider'
import type { CompletionRequest } from '../services/completion/types'

export function registerCompletionHandlers(): void {
  // 请求补全建议
  ipcMain.handle(IPC_COMPLETION.REQUEST, (_event, request: CompletionRequest) => {
    return completionEngine.getCompletions(request)
  })

  // 记录已执行的命令到历史
  ipcMain.handle(IPC_COMPLETION.RECORD_CMD, (_event, params: { command: string; hostId?: string }) => {
    HistoryProvider.record(params.command, params.hostId)
    return true
  })
}
