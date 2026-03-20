<template>
  <!-- 终端面板：渲染分屏树 -->
  <div class="terminal-pane">
    <SplitView :node="tab.root" :in-split="tab.root.type === 'split'" />
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, ref, toRaw, watch, nextTick, onMounted, onBeforeUnmount, computed } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import type { TabSession, SplitNode } from '@shared/types/terminal'
import { useSessionsStore } from '@/stores/sessions.store'
import { useHostsStore } from '@/stores/hosts.store'
import { useTerminalsStore } from '@/stores/terminals.store'
import { IPC_PTY, IPC_SSH } from '@shared/types/ipc-channels'

const props = defineProps<{
  tab: TabSession
}>()

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
  ptyId: string | null
  sshConnectionId: string | null
  isSSH: boolean
  ipcCallbacks: { channel: string; callback: (data: unknown) => void }[]
}

const terminalPool = new Map<string, PooledTerminal>()

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

  // 移除 IPC 监听
  for (const { channel, callback } of pooled.ipcCallbacks) {
    ipcOff(channel, callback)
  }

  // 终止 PTY / SSH
  if (pooled.isSSH && pooled.sshConnectionId) {
    ipcInvoke(IPC_SSH.DISCONNECT, { connectionId: pooled.sshConnectionId })
  } else if (pooled.ptyId) {
    ipcInvoke(IPC_PTY.KILL, { ptyId: pooled.ptyId })
  }

  pooled.terminal.dispose()
  pooled.wrapperEl.remove()
  terminalPool.delete(terminalId)
}

// ===== xterm 主题配置 =====
const XTERM_OPTIONS = {
  theme: {
    background: '#1a1b2e',
    foreground: '#e2e8f0',
    cursor: '#6366f1',
    cursorAccent: '#1a1b2e',
    selectionBackground: 'rgba(99, 102, 241, 0.3)',
    black: '#1a1b2e',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: '#e2e8f0',
    brightBlack: '#64748b',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#f8fafc',
  },
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'block' as const,
  allowProposedApi: true,
}

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

      const terminal = new Terminal(XTERM_OPTIONS)
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      terminal.loadAddon(new SearchAddon())

      terminal.open(wrapperEl)
      containerRef.value.appendChild(wrapperEl)
      fitAddon.fit()

      // 注册到池
      const pooled: PooledTerminal = {
        wrapperEl,
        terminal,
        fitAddon,
        ptyId: null,
        sshConnectionId: null,
        isSSH,
        ipcCallbacks: [],
      }
      terminalPool.set(xtermProps.terminalId, pooled)

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

        let sshPendingStartupCmd: string | null = null

        const sshDataCallback = (payload: unknown) => {
          const { connectionId, data } = payload as { connectionId: string; data: string }
          if (connectionId === pooled.sshConnectionId && terminal) {
            terminal.write(data)
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
              terminal.write('\r\n\x1b[31m[SSH 连接已断开]\x1b[0m\r\n')
            }
          }
        }

        const sshErrorCallback = (payload: unknown) => {
          const { connectionId, error } = payload as { connectionId: string; error: string }
          if (connectionId === pooled.sshConnectionId) {
            if (instance) instance.sshStatus = 'error'
            terminal.write(`\r\n\x1b[31m[SSH 错误: ${error}]\x1b[0m\r\n`)
          }
        }

        trackOn(IPC_SSH.DATA, sshDataCallback)
        trackOn(IPC_SSH.STATUS, sshStatusCallback)
        trackOn(IPC_SSH.ERROR, sshErrorCallback)

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
            }
            if (hostConfig.startupCommand) {
              sshPendingStartupCmd = hostConfig.startupCommand
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          terminal.write(`\r\n\x1b[31m[SSH 连接失败: ${msg}]\x1b[0m\r\n`)
          if (instance) instance.sshStatus = 'error'
        }

        terminal.onData((data: string) => {
          if (pooled.sshConnectionId) {
            ipcInvoke(IPC_SSH.WRITE, { connectionId: pooled.sshConnectionId, data })
          }
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

        const result = await ipcInvoke<{ ptyId: string }>(IPC_PTY.SPAWN, spawnParams)
        if (result?.ptyId) {
          pooled.ptyId = result.ptyId
          if (instance) instance.ptyId = result.ptyId
        }

        const ptyDataCallback = (payload: unknown) => {
          const { ptyId: id, data } = payload as { ptyId: string; data: string }
          if (id === pooled.ptyId) terminal.write(data)
        }

        const ptyExitCallback = (payload: unknown) => {
          const { ptyId: id } = payload as { ptyId: string; exitCode: number }
          if (id === pooled.ptyId) terminal.write('\r\n\x1b[31m[进程已退出]\x1b[0m\r\n')
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
        })

        terminal.onResize(({ cols, rows }) => {
          if (pooled.ptyId) ipcInvoke(IPC_PTY.RESIZE, { ptyId: pooled.ptyId, cols, rows })
        })
      }

      setupResizeObserver(pooled)
    })

    // 切换 tab 后重新 fit
    watch(
      () => sessionsStore.activeTabId,
      () => {
        nextTick(() => {
          const pooled = terminalPool.get(xtermProps.terminalId)
          if (pooled && containerRef.value?.offsetParent !== null) {
            pooled.fitAddon.fit()
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

    function handleClose() {
      sessionsStore.closeSplitPane(props.tab.id, wrapperProps.terminalId)
    }

    return () =>
      h(
        'div',
        {
          class: 'terminal-wrapper',
          style: { position: 'relative', flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, minHeight: 0 },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        },
        [
          h(TerminalXterm, { key: wrapperProps.terminalId, terminalId: wrapperProps.terminalId }),
          wrapperProps.showClose && hovered.value
            ? h('button', {
                class: 'split-close-btn',
                onClick: handleClose,
                title: '关闭此面板',
              }, '\u00d7')
            : null,
        ]
      )
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

:deep(.split-resizer) {
  background: var(--border);
  flex-shrink: 0;
  z-index: 1;
  transition: background 0.15s;
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
    overflow-y: auto;
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
  transition: opacity 0.15s, background 0.15s;

  &:hover {
    opacity: 1;
    background: rgba(239, 68, 68, 1);
  }
}
</style>
