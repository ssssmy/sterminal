<template>
  <!-- 终端面板：渲染分屏树 -->
  <div class="terminal-pane">
    <SplitView :node="tab.root" :in-split="tab.root.type === 'split'" />
  </div>
</template>

<script lang="ts">
// ===== 模块级代码（所有 TerminalPane 实例共享） =====
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { IPC_PTY, IPC_SSH, IPC_LOG } from '@shared/types/ipc-channels'
import { useSessionsStore } from '@/stores/sessions.store'
import { useUiStore } from '@/stores/ui.store'
import { useSettingsStore as useSettingsStoreModule } from '@/stores/settings.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'
import { findThemePreset } from '@shared/constants/terminal-themes'
import { nextTick, watch } from 'vue'
import { keybindingService } from '@/services/keybinding.service'

// ===== IPC 直接访问（绕过 useIpc 的自动清理，由终端池自行管理生命周期）=====
const _ipc = window.electronAPI?.ipc

function ipcInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!_ipc) return Promise.resolve(undefined as T)
  return _ipc.invoke(channel, ...args) as Promise<T>
}

function ipcOn(channel: string, callback: (data: unknown) => void): void {
  _ipc?.on(channel, callback)
}

function ipcOff(channel: string, callback: (data: unknown) => void): void {
  _ipc?.removeListener(channel, callback)
}

// ===== 终端池：让 xterm 实例在组件 mount/unmount 之间存活 =====
interface PooledTerminal {
  wrapperEl: HTMLDivElement
  terminal: Terminal
  fitAddon: FitAddon
  searchAddon: SearchAddon
  ptyId: string | null
  sshConnectionId: string | null
  isSSH: boolean
  ipcCallbacks: { channel: string; callback: (data: unknown) => void }[]
  /** 标记：终端在隐藏期间收到过数据，切换回来时需要刷新 viewport */
  dirtyWhileHidden: boolean
  /** 检测到的主机环境（用于显示安全警示边框） */
  environment: 'production' | 'staging' | null
}

// ===== 主机环境检测 =====
function detectHostEnvironment(host: { address: string; label?: string }): 'production' | 'staging' | null {
  const text = `${host.label || ''} ${host.address}`.toLowerCase()
  if (/\bprod(uction)?\b/.test(text)) return 'production'
  if (/\bstag(ing|e)?\b/.test(text)) return 'staging'
  return null
}

const terminalPool = new Map<string, PooledTerminal>()

// ===== 终端搜索 API（供外部组件调用） =====

export interface TerminalSearchOptions {
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}

/**
 * 在指定终端中搜索（向下）
 */
export function terminalFindNext(
  terminalIds: string[],
  query: string,
  options?: TerminalSearchOptions
): boolean {
  if (!query) return false
  for (const id of terminalIds) {
    const pooled = terminalPool.get(id)
    if (pooled?.searchAddon.findNext(query, { ...options, incremental: true })) {
      return true
    }
  }
  return false
}

/**
 * 在指定终端中搜索（向上）
 */
export function terminalFindPrevious(
  terminalIds: string[],
  query: string,
  options?: TerminalSearchOptions
): boolean {
  if (!query) return false
  for (const id of terminalIds) {
    const pooled = terminalPool.get(id)
    if (pooled?.searchAddon.findPrevious(query, options)) {
      return true
    }
  }
  return false
}

/**
 * 清除指定终端的搜索高亮
 */
export function terminalClearSearch(terminalIds: string[]): void {
  for (const id of terminalIds) {
    const pooled = terminalPool.get(id)
    pooled?.searchAddon.clearDecorations()
  }
}

/**
 * 向指定终端发送命令（用 \r 发送）
 */
export function sendCommandToTerminal(terminalId: string, command: string): void {
  const pooled = terminalPool.get(terminalId)
  if (!pooled) return
  const data = command + '\r'
  if (pooled.isSSH && pooled.sshConnectionId) {
    ipcInvoke(IPC_SSH.WRITE, { connectionId: pooled.sshConnectionId, data })
  } else if (pooled.ptyId) {
    ipcInvoke(IPC_PTY.WRITE, { ptyId: pooled.ptyId, data })
  }
}

/**
 * 向指定终端发送原始数据（不追加 \r），用于填充密码等场景
 */
export function sendRawToTerminal(terminalId: string, data: string): void {
  const pooled = terminalPool.get(terminalId)
  if (!pooled) return
  if (pooled.isSSH && pooled.sshConnectionId) {
    ipcInvoke(IPC_SSH.WRITE, { connectionId: pooled.sshConnectionId, data })
  } else if (pooled.ptyId) {
    ipcInvoke(IPC_PTY.WRITE, { ptyId: pooled.ptyId, data })
  }
}

let _offscreenHolder: HTMLDivElement | null = null
function getOffscreenHolder(): HTMLDivElement {
  if (!_offscreenHolder) {
    _offscreenHolder = document.createElement('div')
    _offscreenHolder.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none;'
    document.body.appendChild(_offscreenHolder)
  }
  return _offscreenHolder
}

/** 彻底销毁终端（关闭分屏/关闭标签页时调用） */
function disposePooledTerminal(terminalId: string): void {
  const pooled = terminalPool.get(terminalId)
  if (!pooled) return

  for (const { channel, callback } of pooled.ipcCallbacks) {
    ipcOff(channel, callback)
  }

  // 停止录制
  const terminalKey = pooled.sshConnectionId || pooled.ptyId
  if (terminalKey) {
    ipcInvoke(IPC_LOG.STOP, { terminalKey })
  }

  if (pooled.isSSH && pooled.sshConnectionId) {
    ipcInvoke(IPC_SSH.DISCONNECT, { connectionId: pooled.sshConnectionId })
  } else if (pooled.ptyId) {
    ipcInvoke(IPC_PTY.KILL, { ptyId: pooled.ptyId })
  }

  pooled.terminal.dispose()
  pooled.wrapperEl.remove()
  terminalPool.delete(terminalId)
}

/**
 * 广播输入：将数据转发到所有其他终端（跨标签页）
 */
function broadcastInput(sourceTerminalId: string, data: string): void {
  const store = useSessionsStore()
  if (!store.broadcastMode) return
  for (const [tid, sibling] of terminalPool) {
    if (tid === sourceTerminalId) continue
    if (sibling.sshConnectionId) {
      ipcInvoke(IPC_SSH.WRITE, { connectionId: sibling.sshConnectionId, data })
    } else if (sibling.ptyId) {
      ipcInvoke(IPC_PTY.WRITE, { ptyId: sibling.ptyId, data })
    }
  }
}

/**
 * 向终端写入数据，并在终端隐藏时标记 dirty（用于切 tab 时刷新 viewport）
 */
function pooledWrite(pooled: PooledTerminal, data: string): void {
  pooled.terminal.write(data)
  // wrapperEl.offsetParent === null 表示元素不可见（display:none 或祖先隐藏）
  if (pooled.wrapperEl.offsetParent === null) {
    pooled.dirtyWhileHidden = true
  }
}

// ===== xterm 主题配置 =====

function getResolvedAppTheme(): 'dark' | 'light' {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

/**
 * 根据 terminal.theme 设置返回 xterm 主题颜色对象。
 * 若设置为 'sterminal-dark'/'sterminal-light' 或其他预设 id，则使用对应预设。
 * 若设置值为空，则按当前 app 主题自动选择 sterminal-dark / sterminal-light。
 */
function getXtermTheme(): Record<string, string> {
  const s = useSettingsStoreModule().settings
  const themeId = (s.get('terminal.theme') || DEFAULT_SETTINGS['terminal.theme']) as string
  if (themeId) {
    return findThemePreset(themeId).colors
  }
  const fallback = getResolvedAppTheme() === 'light' ? 'sterminal-light' : 'sterminal-dark'
  return findThemePreset(fallback).colors
}

function buildXtermOptionsFromSettings() {
  const s = useSettingsStoreModule().settings
  return {
    fontFamily: (s.get('terminal.fontFamily') || DEFAULT_SETTINGS['terminal.fontFamily']) as string,
    fontSize: (s.get('terminal.fontSize') || DEFAULT_SETTINGS['terminal.fontSize']) as number,
    lineHeight: (s.get('terminal.lineHeight') || DEFAULT_SETTINGS['terminal.lineHeight']) as number,
    fontLigatures: (s.get('terminal.fontLigatures') ?? DEFAULT_SETTINGS['terminal.fontLigatures']) as boolean,
    cursorStyle: (s.get('terminal.cursorStyle') || DEFAULT_SETTINGS['terminal.cursorStyle']) as 'block' | 'underline' | 'bar',
    cursorBlink: (s.get('terminal.cursorBlink') ?? DEFAULT_SETTINGS['terminal.cursorBlink']) as boolean,
    scrollback: (s.get('terminal.scrollback') || DEFAULT_SETTINGS['terminal.scrollback']) as number,
    scrollSensitivity: (s.get('terminal.scrollSensitivity') || DEFAULT_SETTINGS['terminal.scrollSensitivity']) as number,
  }
}

function getXtermBaseOptions() {
  return {
    ...buildXtermOptionsFromSettings(),
    allowProposedApi: true,
  }
}

// 监听系统主题切换（模块级，只注册一次）
let _systemThemeListenerRegistered = false
function registerSystemThemeListener(): void {
  if (_systemThemeListenerRegistered) return
  _systemThemeListenerRegistered = true
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const uiStore = useUiStore()
    if (uiStore.theme === 'system') {
      nextTick(() => {
        const theme = getXtermTheme()
        for (const pooled of terminalPool.values()) {
          pooled.terminal.options.theme = theme
        }
      })
    }
  })
}

// 监听 app 主题 & 终端主题设置变化（模块级，只注册一次）
let _themeWatcherRegistered = false
const _terminalThemeSettingKeys = [
  'terminal.fontFamily', 'terminal.fontSize', 'terminal.lineHeight',
  'terminal.fontLigatures', 'terminal.cursorStyle', 'terminal.cursorBlink',
  'terminal.scrollback', 'terminal.scrollSensitivity',
  'terminal.theme',
]
function registerThemeWatcher(): void {
  if (_themeWatcherRegistered) return
  _themeWatcherRegistered = true
  const uiStore = useUiStore()
  const settingsStore = useSettingsStoreModule()
  // 监听 app 主题变化（light/dark/system 切换）
  watch(
    () => uiStore.theme,
    () => {
      nextTick(() => {
        const theme = getXtermTheme()
        for (const pooled of terminalPool.values()) {
          pooled.terminal.options.theme = theme
        }
      })
    },
  )
  // 监听终端设置变化（字体、光标、主题等），实时更新所有终端
  watch(
    () => _terminalThemeSettingKeys.map(k => settingsStore.settings.get(k)),
    () => {
      const opts = buildXtermOptionsFromSettings()
      const theme = getXtermTheme()
      for (const pooled of terminalPool.values()) {
        Object.assign(pooled.terminal.options, opts)
        pooled.terminal.options.theme = theme
        pooled.fitAddon.fit()
      }
    },
    { deep: true },
  )
}

// 监听 SSH 健康探针数据（模块级，只注册一次）
let _healthListenerRegistered = false
function registerHealthListener(): void {
  if (_healthListenerRegistered) return
  _healthListenerRegistered = true
  ipcOn(IPC_SSH.HEALTH, (payload: unknown) => {
    const { connectionId, rtt, status } = payload as { connectionId: string; rtt: number; status: string }
    const sessionsStore = useSessionsStore()
    for (const instance of sessionsStore.terminalInstances.values()) {
      if (instance.type === 'ssh' && instance.sshConnectionId === connectionId) {
        instance.healthRtt = rtt
        instance.healthStatus = status as 'ok' | 'timeout' | 'unsupported'
      }
    }
  })
}
</script>

<script setup lang="ts">
import { defineComponent, h, ref, computed, Transition, toRaw, onMounted, onBeforeUnmount } from 'vue'
import type { TabSession, SplitNode } from '@shared/types/terminal'
import { useHostsStore } from '@/stores/hosts.store'
import { useTerminalsStore } from '@/stores/terminals.store'

const props = defineProps<{
  tab: TabSession
}>()

const sessionsStore = useSessionsStore()

// 注册模块级监听（每个 guard flag 保证只执行一次）
registerThemeWatcher()
registerSystemThemeListener()
registerHealthListener()

// ===== 单个终端实例组件 =====
const TerminalXterm = defineComponent({
  name: 'TerminalXterm',
  props: {
    terminalId: { type: String, required: true },
  },
  setup(xtermProps) {
    const containerRef = ref<HTMLElement | null>(null)
    const sessionsStore = useSessionsStore()
    const hostsStore = useHostsStore()
    const terminalsStore = useTerminalsStore()

    let resizeObserver: ResizeObserver | null = null

    function setupResizeObserver(pooled: PooledTerminal): void {
      resizeObserver = new ResizeObserver(() => {
        pooled.fitAddon.fit()
      })
      if (containerRef.value) {
        resizeObserver.observe(containerRef.value)
      }
    }

    onMounted(async () => {
      if (!containerRef.value) return

      // ===== 已存在于池中：只需移动 DOM 并 re-fit =====
      const existing = terminalPool.get(xtermProps.terminalId)
      if (existing) {
        containerRef.value.appendChild(existing.wrapperEl)
        nextTick(() => existing.fitAddon.fit())
        setupResizeObserver(existing)
        return
      }

      // ===== 首次创建 =====
      const instance = sessionsStore.terminalInstances.get(xtermProps.terminalId)
      const isSSH = instance?.type === 'ssh'

      // 创建独立 wrapper div（在池中持久存在，随组件移动）
      const wrapperEl = document.createElement('div')
      wrapperEl.className = 'terminal-xterm'

      const terminal = new Terminal({ ...getXtermBaseOptions(), theme: getXtermTheme() })
      const fitAddon = new FitAddon()
      const searchAddon = new SearchAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      terminal.loadAddon(searchAddon)

      terminal.open(wrapperEl)
      containerRef.value.appendChild(wrapperEl)
      fitAddon.fit()

      // 右键：有选中文本 → 复制，无选中 → 粘贴
      wrapperEl.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        const selection = terminal.getSelection()
        if (selection) {
          navigator.clipboard.writeText(selection).then(() => {
            terminal.clearSelection()
          })
        } else {
          navigator.clipboard.readText().then(text => {
            if (text) terminal.paste(text)
          })
        }
      })

      // 注册到池
      const pooled: PooledTerminal = {
        wrapperEl,
        terminal,
        fitAddon,
        searchAddon,
        ptyId: null,
        sshConnectionId: null,
        isSSH,
        ipcCallbacks: [],
        dirtyWhileHidden: false,
        environment: null,
      }
      terminalPool.set(xtermProps.terminalId, pooled)

      // 粘贴拦截：仅在开启了换行警告或去尾换行时拦截
      terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        // 优先检查 app 级快捷键绑定
        if (e.type === 'keydown' && keybindingService.handleKeyEvent(e)) {
          return false // 已被快捷键服务消费
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && e.type === 'keydown') {
          const s = useSettingsStoreModule().settings
          const trimNewlines = s.get('terminal.trimPasteNewlines') ?? DEFAULT_SETTINGS['terminal.trimPasteNewlines']
          const pasteWarning = s.get('terminal.pasteWarning') ?? DEFAULT_SETTINGS['terminal.pasteWarning']

          // 没有启用任何粘贴处理，让 xterm 自己处理
          if (!trimNewlines && !pasteWarning) return true

          e.preventDefault()
          navigator.clipboard.readText().then(text => {
            if (!text) return

            let processed = text
            if (trimNewlines) {
              processed = processed.replace(/[\r\n]+$/, '')
            }

            if (pasteWarning && processed.includes('\n')) {
              const preview = processed.length > 100 ? processed.substring(0, 100) + '...' : processed
              if (!confirm(`粘贴内容包含换行符，确定执行？\n\n${preview}`)) return
            }

            terminal.paste(processed)
          })
          return false
        }
        return true
      })

      // 响铃处理
      terminal.onBell(() => {
        const bell = useSettingsStoreModule().settings.get('terminal.bell') || 'none'
        if (bell === 'sound' || bell === 'both') {
          // 用 AudioContext 生成短蜂鸣音（440Hz, 100ms）
          try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.value = 440
            gain.gain.value = 0.3
            osc.start()
            osc.stop(ctx.currentTime + 0.1)
            osc.onended = () => ctx.close()
          } catch {}
        }
        if (bell === 'visual' || bell === 'both') {
          wrapperEl.style.opacity = '0.5'
          setTimeout(() => { wrapperEl.style.opacity = '1' }, 150)
        }
      })

      // 焦点跟随鼠标
      wrapperEl.addEventListener('mouseenter', () => {
        const followMouse = useSettingsStoreModule().settings.get('terminal.focusFollowMouse')
        if (followMouse) terminal.focus()
      })

      // 注册 IPC 监听的辅助函数（自动记录以便清理）
      function trackOn(channel: string, callback: (data: unknown) => void): void {
        ipcOn(channel, callback)
        pooled.ipcCallbacks.push({ channel, callback })
      }

      const cols = terminal.cols
      const rows = terminal.rows

      if (isSSH && instance?.hostId) {
        // ===== SSH 模式 =====
        const hostConfig = hostsStore.hosts.find(h => h.id === instance.hostId)
        if (!hostConfig) {
          terminal.write('\x1b[31m[错误: 未找到主机配置]\x1b[0m\r\n')
          return
        }

        terminal.write(`正在连接 ${hostConfig.username || 'root'}@${hostConfig.address}:${hostConfig.port || 22} ...\r\n`)
        if (instance) instance.sshStatus = 'connecting'
        pooled.environment = detectHostEnvironment({ address: hostConfig.address, label: hostConfig.label })

        let sshPendingStartupCmd: string | null = null

        const sshDataCallback = (payload: unknown) => {
          const { connectionId, data } = payload as { connectionId: string; data: string }
          if (connectionId === pooled.sshConnectionId && terminal) {
            pooledWrite(pooled, data)
            if (sshPendingStartupCmd) {
              const cmd = sshPendingStartupCmd
              sshPendingStartupCmd = null
              setTimeout(() => {
                ipcInvoke(IPC_SSH.WRITE, { connectionId: pooled.sshConnectionId!, data: cmd + '\r' })
              }, 50)
            }
          }
        }

        const sshStatusCallback = (payload: unknown) => {
          const { connectionId, status } = payload as { connectionId: string; status: string }
          if (connectionId === pooled.sshConnectionId) {
            if (status === 'connected' && instance) {
              instance.sshStatus = 'connected'
            } else if (status === 'disconnected') {
              if (instance) instance.sshStatus = 'disconnected'
              pooledWrite(pooled, '\r\n\x1b[31m[SSH 连接已断开]\x1b[0m\r\n')
            }
          }
        }

        const sshErrorCallback = (payload: unknown) => {
          const { connectionId, error } = payload as { connectionId: string; error: string }
          if (connectionId === pooled.sshConnectionId) {
            if (instance) instance.sshStatus = 'error'
            pooledWrite(pooled, `\r\n\x1b[31m[SSH 错误: ${error}]\x1b[0m\r\n`)
          }
        }

        const sshOsCallback = (payload: unknown) => {
          const { connectionId, os } = payload as { connectionId: string; os: 'darwin' | 'windows' | 'linux' }
          if (connectionId === pooled.sshConnectionId && instance) {
            instance.remoteOS = os
          }
        }

        trackOn(IPC_SSH.DATA, sshDataCallback)
        trackOn(IPC_SSH.STATUS, sshStatusCallback)
        trackOn(IPC_SSH.ERROR, sshErrorCallback)
        trackOn(IPC_SSH.OS_DETECTED, sshOsCallback)

        try {
          const result = await ipcInvoke<{ connectionId: string }>(IPC_SSH.CONNECT, {
            hostId: instance.hostId,
            hostConfig: JSON.parse(JSON.stringify(toRaw(hostConfig))),
            cols,
            rows,
          })
          if (result?.connectionId) {
            pooled.sshConnectionId = result.connectionId
            if (instance) {
              instance.sshConnectionId = result.connectionId
              instance.sshStatus = 'connected'
              // 检查主进程是否已自动开始录制
              const isRec = await ipcInvoke<boolean>(IPC_LOG.IS_RECORDING, { terminalKey: result.connectionId })
              if (isRec) instance.recording = true
            }
            if (hostConfig.startupCommand) {
              sshPendingStartupCmd = hostConfig.startupCommand
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          pooledWrite(pooled, `\r\n\x1b[31m[SSH 连接失败: ${msg}]\x1b[0m\r\n`)
          if (instance) instance.sshStatus = 'error'
        }

        terminal.onData((data: string) => {
          if (pooled.sshConnectionId) {
            ipcInvoke(IPC_SSH.WRITE, { connectionId: pooled.sshConnectionId, data })
          }
          broadcastInput(xtermProps.terminalId, data)
        })

        terminal.onResize(({ cols, rows }) => {
          if (pooled.sshConnectionId) {
            ipcInvoke(IPC_SSH.RESIZE, { connectionId: pooled.sshConnectionId, cols, rows })
          }
        })
      } else {
        // ===== 本地 PTY 模式 =====
        const localConfig = instance?.localConfigId
          ? terminalsStore.terminals.find(t => t.id === instance.localConfigId)
          : undefined

        const spawnParams: Record<string, unknown> = { cols, rows }
        if (localConfig?.shell) spawnParams.shell = localConfig.shell
        if (localConfig?.cwd) spawnParams.cwd = localConfig.cwd
        if (localConfig?.environment) spawnParams.env = localConfig.environment
        if (localConfig?.loginShell) spawnParams.loginShell = true

        const result = await ipcInvoke<{ ptyId: string }>(IPC_PTY.SPAWN, spawnParams)
        if (result?.ptyId) {
          pooled.ptyId = result.ptyId
          if (instance) {
            instance.ptyId = result.ptyId
            // 检查主进程是否已自动开始录制
            const isRec = await ipcInvoke<boolean>(IPC_LOG.IS_RECORDING, { terminalKey: result.ptyId })
            if (isRec) instance.recording = true
          }
        }

        const ptyDataCallback = (payload: unknown) => {
          const { ptyId: id, data } = payload as { ptyId: string; data: string }
          if (id === pooled.ptyId) pooledWrite(pooled, data)
        }

        const ptyExitCallback = (payload: unknown) => {
          const { ptyId: id } = payload as { ptyId: string; exitCode: number }
          if (id === pooled.ptyId) pooledWrite(pooled, '\r\n\x1b[31m[进程已退出]\x1b[0m\r\n')
        }

        if (localConfig?.startupCommand) {
          let pendingCmd: string | null = localConfig.startupCommand
          const wrappedCallback = (payload: unknown) => {
            ptyDataCallback(payload)
            if (pendingCmd) {
              const { ptyId: id } = payload as { ptyId: string; data: string }
              if (id === pooled.ptyId) {
                const cmd = pendingCmd
                pendingCmd = null
                setTimeout(() => {
                  ipcInvoke(IPC_PTY.WRITE, { ptyId: pooled.ptyId!, data: cmd + '\r' })
                }, 50)
              }
            }
          }
          trackOn(IPC_PTY.DATA, wrappedCallback)
        } else {
          trackOn(IPC_PTY.DATA, ptyDataCallback)
        }
        trackOn(IPC_PTY.EXIT, ptyExitCallback)

        terminal.onData((data: string) => {
          if (pooled.ptyId) ipcInvoke(IPC_PTY.WRITE, { ptyId: pooled.ptyId, data })
          broadcastInput(xtermProps.terminalId, data)
        })

        terminal.onResize(({ cols, rows }) => {
          if (pooled.ptyId) ipcInvoke(IPC_PTY.RESIZE, { ptyId: pooled.ptyId, cols, rows })
        })
      }

      setupResizeObserver(pooled)
    })

    // 切换 tab 后刷新终端
    watch(
      () => sessionsStore.activeTabId,
      () => {
        nextTick(() => {
          const pooled = terminalPool.get(xtermProps.terminalId)
          if (pooled && containerRef.value?.offsetParent !== null) {
            requestAnimationFrame(() => {
              // 隐藏期间收到过数据 → 强制 resize 让 viewport 重算 scrollHeight
              // xterm.js 对相同 cols/rows 的 resize 会跳过，
              // 所以先缩一行再恢复来触发 viewport 内部的 syncScrollArea
              if (pooled.dirtyWhileHidden) {
                pooled.dirtyWhileHidden = false
                const { cols, rows } = pooled.terminal
                if (rows > 1) {
                  pooled.terminal.resize(cols, rows - 1)
                }
              }
              pooled.fitAddon.fit()
            })
          }
        })
      }
    )

    onBeforeUnmount(() => {
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }

      // 判断是"分屏重组"还是"真正关闭"
      const stillActive = sessionsStore.terminalInstances.has(xtermProps.terminalId)
      if (stillActive) {
        // 分屏重组：将 DOM 移到屏幕外暂存，保留 PTY/SSH 连接
        const pooled = terminalPool.get(xtermProps.terminalId)
        if (pooled) {
          getOffscreenHolder().appendChild(pooled.wrapperEl)
        }
      } else {
        // 真正关闭：彻底销毁
        disposePooledTerminal(xtermProps.terminalId)
      }
    })

    return () =>
      h('div', {
        ref: containerRef,
        class: 'terminal-container',
        style: { flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0, display: 'flex' },
      })
  },
})

// ===== 包含关闭按钮的终端容器 =====
const TerminalWrapper = defineComponent({
  name: 'TerminalWrapper',
  props: {
    terminalId: { type: String, required: true },
    showClose: { type: Boolean, default: false },
  },
  setup(wrapperProps) {
    const sessionsStore = useSessionsStore()
    const hovered = ref(false)

    const sshStatus = computed(() =>
      sessionsStore.terminalInstances.get(wrapperProps.terminalId)?.sshStatus ?? null
    )

    function handleClose() {
      sessionsStore.closeSplitPane(props.tab.id, wrapperProps.terminalId)
    }

    const connectingOverlay = () =>
      h('div', { class: 'ssh-connecting-overlay' },
        h('div', { class: 'ssh-connecting-dots' }, [
          h('span'),
          h('span'),
          h('span'),
        ])
      )

    return () => {
      const env = terminalPool.get(wrapperProps.terminalId)?.environment
      const envClass = env ? `terminal-env-${env}` : null
      return h(
        'div',
        {
          class: ['terminal-wrapper', envClass],
          style: { position: 'relative', flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        },
        [
          h(TerminalXterm, { key: wrapperProps.terminalId, terminalId: wrapperProps.terminalId }),
          h(Transition, { name: 'st-fade' }, {
            default: () => sshStatus.value === 'connecting' ? connectingOverlay() : null,
          }),
          wrapperProps.showClose && hovered.value
            ? h('button', {
                class: 'split-close-btn',
                onClick: handleClose,
                title: '关闭此面板',
              }, '\u00d7')
            : null,
        ]
      )
    }
  },
})

// ===== 递归分屏视图组件 =====
const SplitView: ReturnType<typeof defineComponent> = defineComponent({
  name: 'SplitView',
  props: {
    node: {
      type: Object as () => SplitNode,
      required: true,
    },
    inSplit: {
      type: Boolean,
      default: false,
    },
  },
  setup(splitProps) {
    return () => {
      const node = splitProps.node

      if (node.type === 'terminal') {
        return h(TerminalWrapper, {
          terminalId: node.terminalId,
          showClose: splitProps.inSplit,
        })
      }

      // 分屏容器节点
      const isHorizontal = node.direction === 'horizontal'

      let dragging = false
      let startPos = 0
      let startRatio = node.ratio

      const onMouseDown = (e: MouseEvent) => {
        dragging = true
        startPos = isHorizontal ? e.clientY : e.clientX
        startRatio = node.ratio
        e.preventDefault()

        const onMouseMove = (ev: MouseEvent) => {
          if (!dragging) return
          const containerEl = (e.target as HTMLElement).parentElement
          if (!containerEl) return
          const rect = containerEl.getBoundingClientRect()
          const totalSize = isHorizontal ? rect.height : rect.width
          if (totalSize === 0) return
          const delta = (isHorizontal ? ev.clientY : ev.clientX) - startPos
          const newRatio = Math.min(0.9, Math.max(0.1, startRatio + delta / totalSize))
          ;(node as { ratio: number }).ratio = newRatio
        }

        const onMouseUp = () => {
          dragging = false
          window.removeEventListener('mousemove', onMouseMove)
          window.removeEventListener('mouseup', onMouseUp)
        }

        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
      }

      return h(
        'div',
        {
          class: `split-container split-container--${node.direction}`,
          style: {
            display: 'flex',
            flexDirection: isHorizontal ? 'column' : 'row',
            flex: 1,
            overflow: 'hidden',
            minWidth: 0,
            minHeight: 0,
          },
        },
        [
          h(
            'div',
            {
              style: {
                flex: node.ratio,
                overflow: 'hidden',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
              },
            },
            [h(SplitView, { node: node.children[0], inSplit: true })]
          ),
          h('div', {
            class: `split-resizer split-resizer--${node.direction}`,
            onMousedown: onMouseDown,
          }),
          h(
            'div',
            {
              style: {
                flex: 1 - node.ratio,
                overflow: 'hidden',
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
              },
            },
            [h(SplitView, { node: node.children[1], inSplit: true })]
          ),
        ]
      )
    }
  },
})
</script>

<style lang="scss" scoped>
.terminal-pane {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--terminal-bg);
  min-width: 0;
  min-height: 0;
}

:deep(.terminal-env-production) {
  border-top: 2px solid #ef4444;
}

:deep(.terminal-env-staging) {
  border-top: 2px solid #f59e0b;
}

:deep(.split-resizer) {
  background: var(--border);
  flex-shrink: 0;
  z-index: 1;
  transition: background-color var(--st-duration-fast) var(--st-easing-smooth);
}

:deep(.split-resizer:hover) {
  background: var(--accent);
}

:deep(.split-resizer--horizontal) {
  height: 3px;
  cursor: row-resize;
  width: 100%;
}

:deep(.split-resizer--vertical) {
  width: 3px;
  cursor: col-resize;
  height: 100%;
}

:deep(.terminal-xterm) {
  flex: 1;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  display: flex;

  .xterm {
    flex: 1;
    padding: 4px;
  }

  .xterm-viewport {
    overflow-y: scroll;
  }
}

:deep(.split-close-btn) {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.85);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
  transition: opacity var(--st-duration-fast) var(--st-easing-smooth), background-color var(--st-duration-fast) var(--st-easing-smooth);

  &:hover {
    opacity: 1;
    background: rgba(239, 68, 68, 1);
  }
}

:deep(.ssh-connecting-overlay) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}

:deep(.ssh-connecting-dots) {
  display: flex;
  gap: 6px;
}

:deep(.ssh-connecting-dots span) {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--st-accent, #6366f1);
  animation: ssh-dot-pulse 1.4s infinite ease-in-out both;
}

:deep(.ssh-connecting-dots span:nth-child(1)) { animation-delay: -0.32s; }
:deep(.ssh-connecting-dots span:nth-child(2)) { animation-delay: -0.16s; }
:deep(.ssh-connecting-dots span:nth-child(3)) { animation-delay: 0s; }

@keyframes ssh-dot-pulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}

.st-fade-leave-active {
  transition: opacity 0.25s var(--st-easing-smooth, ease);
}

.st-fade-leave-to {
  opacity: 0;
}
</style>

