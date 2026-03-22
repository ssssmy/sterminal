// SFTP IPC Handler
// 使用 ssh2 的 SFTPWrapper API 管理远程文件系统操作

import { ipcMain, BrowserWindow } from 'electron'
import path from 'path'
import { SFTPWrapper } from 'ssh2'
import { IPC_SFTP } from '../../shared/types/ipc-channels'
import type { SftpFileInfo, SftpTransferItem } from '../../shared/types/sftp'
import { sshSessions } from './ssh.handler'
import { v4 as uuidv4 } from 'uuid'

// 活跃的 SFTP 会话
const sftpSessions = new Map<string, { sftp: SFTPWrapper; connectionId: string }>()

// 活跃的传输任务（用于取消）
const activeTransfers = new Map<string, { cancelled: boolean }>()

/**
 * 将权限数字转换为 rwxrwxrwx 格式字符串
 */
function modeToPermissions(mode: number): string {
  const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx']
  return perms[(mode >> 6) & 7] + perms[(mode >> 3) & 7] + perms[mode & 7]
}

/**
 * 将 ssh2 readdir 返回的 entry 转换为 SftpFileInfo
 */
function entryToFileInfo(entry: {
  filename: string
  longname: string
  attrs: {
    mode: number
    size: number
    mtime: number
    uid: number
    gid: number
  }
}, dirPath: string): SftpFileInfo {
  const mode = entry.attrs.mode
  const isDirectory = !!(mode & 0o040000)
  const isSymlink = !!(mode & 0o120000)
  const filePath = path.posix.join(dirPath, entry.filename)

  return {
    name: entry.filename,
    path: filePath,
    size: entry.attrs.size || 0,
    modifiedTime: new Date((entry.attrs.mtime || 0) * 1000).toISOString(),
    permissions: modeToPermissions(mode & 0o777),
    mode: mode & 0o777,
    isDirectory,
    isSymlink,
    owner: entry.attrs.uid || 0,
    group: entry.attrs.gid || 0,
  }
}

/**
 * 递归删除目录
 */
async function rmRecursive(sftp: SFTPWrapper, remotePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sftp.readdir(remotePath, (err, list) => {
      if (err) {
        // 尝试作为文件删除
        sftp.unlink(remotePath, (unlinkErr) => {
          if (unlinkErr) reject(unlinkErr)
          else resolve()
        })
        return
      }

      const items = list || []
      let pending = items.length

      if (pending === 0) {
        sftp.rmdir(remotePath, (rmdirErr) => {
          if (rmdirErr) reject(rmdirErr)
          else resolve()
        })
        return
      }

      let hasError = false
      for (const item of items) {
        if (item.filename === '.' || item.filename === '..') {
          pending--
          if (pending === 0 && !hasError) {
            sftp.rmdir(remotePath, (rmdirErr) => {
              if (rmdirErr) reject(rmdirErr)
              else resolve()
            })
          }
          continue
        }

        const childPath = path.posix.join(remotePath, item.filename)
        const childMode = item.attrs.mode
        const isDir = !!(childMode & 0o040000)

        const done = (err?: Error | null) => {
          if (hasError) return
          if (err) {
            hasError = true
            reject(err)
            return
          }
          pending--
          if (pending === 0) {
            sftp.rmdir(remotePath, (rmdirErr) => {
              if (rmdirErr) reject(rmdirErr)
              else resolve()
            })
          }
        }

        if (isDir) {
          rmRecursive(sftp, childPath).then(() => done()).catch(done)
        } else {
          sftp.unlink(childPath, done)
        }
      }
    })
  })
}

/**
 * 注册所有 SFTP 相关的 IPC handlers
 */
export function registerSftpHandlers(): void {
  // 打开 SFTP 会话（从已有 SSH 连接创建）
  ipcMain.handle(IPC_SFTP.OPEN, async (_event, params: { connectionId: string }) => {
    const session = sshSessions.get(params.connectionId)
    if (!session) throw new Error(`SSH 连接 ${params.connectionId} 不存在`)

    return new Promise<{ sftpId: string; homePath: string }>((resolve, reject) => {
      session.client.sftp((err, sftp) => {
        if (err) {
          reject(err)
          return
        }

        const sftpId = `sftp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        sftpSessions.set(sftpId, { sftp, connectionId: params.connectionId })

        sftp.on('close', () => {
          sftpSessions.delete(sftpId)
        })

        sftp.on('error', () => {
          sftpSessions.delete(sftpId)
        })

        // 获取远程 home 路径
        sftp.realpath('.', (rpErr, homePath) => {
          resolve({ sftpId, homePath: rpErr ? '/' : homePath })
        })
      })
    })
  })

  // 列出目录内容
  ipcMain.handle(IPC_SFTP.LIST, async (_event, params: { sftpId: string; path: string }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<SftpFileInfo[]>((resolve, reject) => {
      session.sftp.readdir(params.path, (err, list) => {
        if (err) {
          reject(err)
          return
        }
        const files = (list || [])
          .filter(e => e.filename !== '.' && e.filename !== '..')
          .map(e => entryToFileInfo(e as Parameters<typeof entryToFileInfo>[0], params.path))
        resolve(files)
      })
    })
  })

  // 获取文件/目录属性
  ipcMain.handle(IPC_SFTP.STAT, async (_event, params: { sftpId: string; path: string }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<SftpFileInfo>((resolve, reject) => {
      session.sftp.stat(params.path, (err, stats) => {
        if (err) {
          reject(err)
          return
        }
        const mode = stats.mode || 0
        const name = path.posix.basename(params.path)
        resolve({
          name,
          path: params.path,
          size: stats.size || 0,
          modifiedTime: new Date((stats.mtime || 0) * 1000).toISOString(),
          permissions: modeToPermissions(mode & 0o777),
          mode: mode & 0o777,
          isDirectory: !!(mode & 0o040000),
          isSymlink: !!(mode & 0o120000),
          owner: stats.uid || 0,
          group: stats.gid || 0,
        })
      })
    })
  })

  // 创建目录
  ipcMain.handle(IPC_SFTP.MKDIR, async (_event, params: { sftpId: string; path: string }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<void>((resolve, reject) => {
      session.sftp.mkdir(params.path, (err) => {
        if (err) {
          if ((err as any).code === 4) {
            reject(new Error(`创建目录失败: "${params.path}" 可能已存在或权限不足`))
          } else {
            reject(err)
          }
        } else {
          resolve()
        }
      })
    })
  })

  // 删除文件或目录（目录递归删除）
  ipcMain.handle(IPC_SFTP.RM, async (_event, params: {
    sftpId: string
    path: string
    isDirectory?: boolean
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    if (params.isDirectory) {
      await rmRecursive(session.sftp, params.path)
    } else {
      await new Promise<void>((resolve, reject) => {
        session.sftp.unlink(params.path, (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  })

  // 重命名/移动
  ipcMain.handle(IPC_SFTP.RENAME, async (_event, params: {
    sftpId: string
    oldPath: string
    newPath: string
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<void>((resolve, reject) => {
      session.sftp.rename(params.oldPath, params.newPath, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  // 修改权限
  ipcMain.handle(IPC_SFTP.CHMOD, async (_event, params: {
    sftpId: string
    path: string
    mode: number
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<void>((resolve, reject) => {
      session.sftp.chmod(params.path, params.mode, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  // 修改所有者
  ipcMain.handle(IPC_SFTP.CHOWN, async (_event, params: {
    sftpId: string
    path: string
    uid: number
    gid: number
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<void>((resolve, reject) => {
      session.sftp.chown(params.path, params.uid, params.gid, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  // 读取文件内容（限 1MB）
  ipcMain.handle(IPC_SFTP.READ_FILE, async (_event, params: { sftpId: string; path: string }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<string>((resolve, reject) => {
      const MAX_SIZE = 1024 * 1024 // 1MB
      const chunks: Buffer[] = []
      let totalSize = 0

      const stream = session.sftp.createReadStream(params.path)

      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length
        if (totalSize > MAX_SIZE) {
          stream.destroy(new Error('文件大小超过 1MB 限制'))
          return
        }
        chunks.push(chunk)
      })

      stream.on('error', (err: Error) => {
        reject(err)
      })

      stream.on('close', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
    })
  })

  // 写入文件内容
  ipcMain.handle(IPC_SFTP.WRITE_FILE, async (_event, params: {
    sftpId: string
    path: string
    content: string
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    return new Promise<void>((resolve, reject) => {
      const stream = session.sftp.createWriteStream(params.path)

      stream.on('error', (err: Error) => {
        reject(err)
      })

      stream.on('close', () => {
        resolve()
      })

      stream.end(Buffer.from(params.content, 'utf-8'))
    })
  })

  // 上传文件（本地 → 远程）
  ipcMain.handle(IPC_SFTP.UPLOAD, async (event, params: {
    sftpId: string
    localPath: string
    remotePath: string
    fileName: string
    totalBytes: number
    transferId: string
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    const transferId = params.transferId || uuidv4()
    const transferState = { cancelled: false }
    activeTransfers.set(transferId, transferState)

    const webContents = event.sender
    let lastTransferred = 0
    let lastTime = Date.now()

    const transfer: SftpTransferItem = {
      transferId,
      sftpId: params.sftpId,
      direction: 'upload',
      localPath: params.localPath,
      remotePath: params.remotePath,
      fileName: params.fileName,
      totalBytes: params.totalBytes,
      transferredBytes: 0,
      status: 'active',
      speed: 0,
    }

    if (!webContents.isDestroyed()) {
      webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
    }

    return new Promise<{ transferId: string }>((resolve, reject) => {
      session.sftp.fastPut(
        params.localPath,
        params.remotePath,
        {
          step: (transferred: number, _chunk: number, total: number) => {
            if (transferState.cancelled) return

            const now = Date.now()
            const elapsed = (now - lastTime) / 1000
            const speed = elapsed > 0 ? (transferred - lastTransferred) / elapsed : 0
            lastTransferred = transferred
            lastTime = now

            transfer.transferredBytes = transferred
            transfer.totalBytes = total
            transfer.speed = speed

            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
          },
        },
        (err: Error | null | undefined) => {
          activeTransfers.delete(transferId)

          if (transferState.cancelled) {
            transfer.status = 'cancelled'
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
            resolve({ transferId })
            return
          }

          if (err) {
            transfer.status = 'failed'
            transfer.error = err.message
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
            reject(err)
            return
          }

          transfer.status = 'completed'
          transfer.transferredBytes = transfer.totalBytes
          if (!webContents.isDestroyed()) {
            webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            webContents.send(IPC_SFTP.TRANSFER_COMPLETE, { transferId, direction: 'upload' })
          }
          resolve({ transferId })
        }
      )
    })
  })

  // 下载文件（远程 → 本地）
  ipcMain.handle(IPC_SFTP.DOWNLOAD, async (event, params: {
    sftpId: string
    remotePath: string
    localPath: string
    fileName: string
    totalBytes: number
    transferId: string
  }) => {
    const session = sftpSessions.get(params.sftpId)
    if (!session) throw new Error(`SFTP 会话 ${params.sftpId} 不存在`)

    const transferId = params.transferId || uuidv4()
    const transferState = { cancelled: false }
    activeTransfers.set(transferId, transferState)

    const webContents = event.sender
    let lastTransferred = 0
    let lastTime = Date.now()

    const transfer: SftpTransferItem = {
      transferId,
      sftpId: params.sftpId,
      direction: 'download',
      localPath: params.localPath,
      remotePath: params.remotePath,
      fileName: params.fileName,
      totalBytes: params.totalBytes,
      transferredBytes: 0,
      status: 'active',
      speed: 0,
    }

    if (!webContents.isDestroyed()) {
      webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
    }

    // 确保本地目标目录存在
    const localDir = require('path').dirname(params.localPath)
    require('fs').mkdirSync(localDir, { recursive: true })

    return new Promise<{ transferId: string }>((resolve, reject) => {
      session.sftp.fastGet(
        params.remotePath,
        params.localPath,
        {
          step: (transferred: number, _chunk: number, total: number) => {
            if (transferState.cancelled) return

            const now = Date.now()
            const elapsed = (now - lastTime) / 1000
            const speed = elapsed > 0 ? (transferred - lastTransferred) / elapsed : 0
            lastTransferred = transferred
            lastTime = now

            transfer.transferredBytes = transferred
            transfer.totalBytes = total
            transfer.speed = speed

            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
          },
        },
        (err: Error | null | undefined) => {
          activeTransfers.delete(transferId)

          if (transferState.cancelled) {
            transfer.status = 'cancelled'
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
            resolve({ transferId })
            return
          }

          if (err) {
            transfer.status = 'failed'
            transfer.error = err.message
            if (!webContents.isDestroyed()) {
              webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            }
            reject(err)
            return
          }

          transfer.status = 'completed'
          transfer.transferredBytes = transfer.totalBytes
          if (!webContents.isDestroyed()) {
            webContents.send(IPC_SFTP.TRANSFER_PROGRESS, { ...transfer })
            webContents.send(IPC_SFTP.TRANSFER_COMPLETE, { transferId, direction: 'download' })
          }
          resolve({ transferId })
        }
      )
    })
  })

  // 取消传输
  ipcMain.handle(IPC_SFTP.TRANSFER_CANCEL, async (_event, params: { transferId: string }) => {
    const transferState = activeTransfers.get(params.transferId)
    if (transferState) {
      transferState.cancelled = true
    }
    return true
  })
}

/**
 * 关闭所有 SFTP 会话（应用退出时调用）
 */
export function closeAllSftpSessions(): void {
  for (const [id, session] of sftpSessions) {
    try {
      session.sftp.end()
    } catch {
      // 忽略退出时的错误
    }
    sftpSessions.delete(id)
  }
}
