// SFTP Store - 管理 SFTP 会话状态和传输队列

import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { IPC_SFTP, IPC_LOCAL_FS } from '@shared/types/ipc-channels'

const _ipc = window.electronAPI?.ipc
function ipcInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!_ipc) return Promise.resolve(undefined as T)
  return _ipc.invoke(channel, ...args) as Promise<T>
}
function ipcOn(channel: string, callback: (data: unknown) => void): void {
  _ipc?.on(channel, callback)
}
import type { SftpFileInfo, SftpTabState, SftpTransferItem } from '@shared/types/sftp'

export const useSftpStore = defineStore('sftp', () => {

  // 每个 SFTP tab（以 tabId 为 key）的状态（reactive 对象，属性修改自动触发更新）
  const sessions = reactive<Record<string, SftpTabState>>({})
  // 全局传输队列
  const transfers = ref<SftpTransferItem[]>([])

  // ===== 传输事件监听（全局，只注册一次）=====

  ipcOn(IPC_SFTP.TRANSFER_PROGRESS, (raw: unknown) => {
    const data = raw as { transferId: string; transferredBytes: number; totalBytes: number; speed: number }
    const item = transfers.value.find(t => t.transferId === data.transferId)
    if (item) {
      item.transferredBytes = data.transferredBytes
      item.totalBytes = data.totalBytes
      item.speed = data.speed ?? 0
      item.status = 'active'
    }
  })

  ipcOn(IPC_SFTP.TRANSFER_COMPLETE, (raw: unknown) => {
    const data = raw as { transferId: string; success: boolean; error?: string }
    const item = transfers.value.find(t => t.transferId === data.transferId)
    if (item) {
      item.status = data.success ? 'completed' : 'failed'
      item.error = data.error
      item.speed = 0
    }
  })

  // ===== 会话管理 =====

  /**
   * 打开 SFTP 会话，连接后列出初始目录
   */
  async function openSession(tabId: string, connectionId: string): Promise<void> {
    try {
      const result = await ipcInvoke<{ sftpId: string; homePath: string }>(IPC_SFTP.OPEN, { connectionId })
      if (!result) return

      const localHome = (await ipcInvoke<string>(IPC_LOCAL_FS.HOME)) || '/'
      const remoteHome = result.homePath || '/'

      const state: SftpTabState = {
        sftpId: result.sftpId,
        remoteCwd: remoteHome,
        localCwd: localHome,
        remoteFiles: [],
        localFiles: [],
        loading: false,
        remoteLoading: false,
        localLoading: false,
        showHidden: false,
        viewMode: 'list',
      }
      // 先设置 session 再加载目录（否则 navigate 找不到 session）
      sessions[tabId] = state

      // 并行加载初始目录
      await Promise.all([
        navigateRemote(tabId, remoteHome),
        navigateLocal(tabId, localHome),
      ])
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const state = sessions[tabId]
      if (state) {
        state.error = errMsg
      }
    }
  }

  /**
   * 关闭 SFTP 会话，清理状态
   */
  function closeSession(tabId: string): void {
    delete sessions[tabId]
  }

  /**
   * 导航到远程目录
   */
  async function navigateRemote(tabId: string, path: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    state.remoteLoading = true
    state.error = undefined
    try {
      const files = await ipcInvoke<SftpFileInfo[]>(IPC_SFTP.LIST, { sftpId: state.sftpId, path })
      state.remoteFiles = files || []
      state.remoteCwd = path
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err)
    } finally {
      state.remoteLoading = false
    }
  }

  /**
   * 导航到本地目录
   */
  async function navigateLocal(tabId: string, path: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    state.localLoading = true
    state.error = undefined
    try {
      const files = await ipcInvoke<SftpFileInfo[]>(IPC_LOCAL_FS.LIST, { path })
      state.localFiles = files || []
      state.localCwd = path
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err)
    } finally {
      state.localLoading = false
    }
  }

  /**
   * 刷新远程目录
   */
  async function refreshRemote(tabId: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return
    await navigateRemote(tabId, state.remoteCwd)
  }

  /**
   * 刷新本地目录
   */
  async function refreshLocal(tabId: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return
    await navigateLocal(tabId, state.localCwd)
  }

  /**
   * 上传本地文件到远程
   */
  async function uploadFiles(tabId: string, localPaths: string[]): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    for (const localPath of localPaths) {
      const fileName = localPath.split('/').pop() || localPath.split('\\').pop() || localPath
      const remotePath = state.remoteCwd.endsWith('/')
        ? state.remoteCwd + fileName
        : state.remoteCwd + '/' + fileName
      const transferId = uuidv4()

      const item: SftpTransferItem = {
        transferId,
        sftpId: state.sftpId,
        direction: 'upload',
        localPath,
        remotePath,
        fileName,
        totalBytes: 0,
        transferredBytes: 0,
        status: 'queued',
        speed: 0,
      }
      transfers.value.push(item)

      ipcInvoke(IPC_SFTP.UPLOAD, {
        sftpId: state.sftpId,
        localPath,
        remotePath,
        fileName,
        totalBytes: 0,
        transferId,
      }).then(() => {
        refreshRemote(tabId)
      }).catch((err: unknown) => {
        const transferItem = transfers.value.find(t => t.transferId === transferId)
        if (transferItem) {
          transferItem.status = 'failed'
          transferItem.error = err instanceof Error ? err.message : String(err)
        }
      })
    }
  }

  /**
   * 下载远程文件到本地
   */
  async function downloadFiles(tabId: string, remotePaths: string[]): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    for (const remotePath of remotePaths) {
      const fileName = remotePath.split('/').pop() || remotePath
      const localPath = state.localCwd.endsWith('/')
        ? state.localCwd + fileName
        : state.localCwd + '/' + fileName
      const transferId = uuidv4()

      const item: SftpTransferItem = {
        transferId,
        sftpId: state.sftpId,
        direction: 'download',
        localPath,
        remotePath,
        fileName,
        totalBytes: 0,
        transferredBytes: 0,
        status: 'queued',
        speed: 0,
      }
      transfers.value.push(item)

      ipcInvoke(IPC_SFTP.DOWNLOAD, {
        sftpId: state.sftpId,
        remotePath,
        localPath,
        fileName,
        totalBytes: 0,
        transferId,
      }).then(() => {
        refreshLocal(tabId)
      }).catch((err: unknown) => {
        const transferItem = transfers.value.find(t => t.transferId === transferId)
        if (transferItem) {
          transferItem.status = 'failed'
          transferItem.error = err instanceof Error ? err.message : String(err)
        }
      })
    }
  }

  /**
   * 创建远程目录
   */
  async function mkdirRemote(tabId: string, dirName: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    const path = state.remoteCwd.endsWith('/')
      ? state.remoteCwd + dirName
      : state.remoteCwd + '/' + dirName
    await ipcInvoke(IPC_SFTP.MKDIR, { sftpId: state.sftpId, path })
    await refreshRemote(tabId)
  }

  /**
   * 删除远程文件或目录
   */
  async function deleteRemote(tabId: string, paths: string[], recursive = true): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    for (const path of paths) {
      await ipcInvoke(IPC_SFTP.RM, { sftpId: state.sftpId, path, recursive })
    }
    await refreshRemote(tabId)
  }

  /**
   * 重命名远程文件
   */
  async function renameRemote(tabId: string, oldPath: string, newName: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return

    const dir = oldPath.substring(0, oldPath.lastIndexOf('/') + 1)
    const newPath = dir + newName
    await ipcInvoke(IPC_SFTP.RENAME, { sftpId: state.sftpId, oldPath, newPath })
    await refreshRemote(tabId)
  }

  /**
   * 读取远程文件内容（文本）
   */
  async function readRemoteFile(tabId: string, path: string): Promise<string> {
    const state = sessions[tabId]
    if (!state) return ''
    const result = await ipcInvoke<string>(IPC_SFTP.READ_FILE, { sftpId: state.sftpId, path })
    return result || ''
  }

  /**
   * 写入远程文件内容
   */
  async function writeRemoteFile(tabId: string, path: string, content: string): Promise<void> {
    const state = sessions[tabId]
    if (!state) return
    await ipcInvoke(IPC_SFTP.WRITE_FILE, { sftpId: state.sftpId, path, content })
    await refreshRemote(tabId)
  }

  /**
   * 取消传输
   */
  async function cancelTransfer(transferId: string): Promise<void> {
    await ipcInvoke(IPC_SFTP.TRANSFER_CANCEL, { transferId })
    const item = transfers.value.find(t => t.transferId === transferId)
    if (item) item.status = 'cancelled'
  }

  /**
   * 清除已完成/失败/取消的传输记录
   */
  function clearCompletedTransfers(): void {
    transfers.value = transfers.value.filter(
      t => t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
    )
  }

  /**
   * 切换显示隐藏文件
   */
  function toggleShowHidden(tabId: string): void {
    const state = sessions[tabId]
    if (!state) return
    state.showHidden = !state.showHidden
  }

  /**
   * 切换视图模式
   */
  function setViewMode(tabId: string, mode: 'list' | 'grid'): void {
    const state = sessions[tabId]
    if (!state) return
    state.viewMode = mode
  }

  return {
    sessions,
    transfers,
    openSession,
    closeSession,
    navigateRemote,
    navigateLocal,
    refreshRemote,
    refreshLocal,
    uploadFiles,
    downloadFiles,
    mkdirRemote,
    deleteRemote,
    renameRemote,
    readRemoteFile,
    writeRemoteFile,
    cancelTransfer,
    clearCompletedTransfers,
    toggleShowHidden,
    setViewMode,
  }
})
