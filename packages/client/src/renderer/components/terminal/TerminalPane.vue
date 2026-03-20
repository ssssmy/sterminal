<template>
  <!-- 终端面板：渲染分屏树 -->
  <div class="terminal-pane">
    <SplitView :node="tab.root" />
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, ref, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import type { TabSession, SplitNode } from '@shared/types/terminal'
import { useSessionsStore } from '@/stores/sessions.store'
import { useIpc } from '@/composables/useIpc'
import { IPC_PTY } from '@shared/types/ipc-channels'

const props = defineProps<{
  tab: TabSession
}>()

// ===== 单个终端实例组件（xterm.js 集成）=====
const TerminalXterm = defineComponent({
  name: 'TerminalXterm',
  props: {
    terminalId: {
      type: String,
      required: true,
    },
  },
  setup(xtermProps) {
    const containerRef = ref<HTMLElement | null>(null)
    const sessionsStore = useSessionsStore()
    const { invoke, on, off } = useIpc()

    let terminal: Terminal | null = null
    let fitAddon: FitAddon | null = null
    let resizeObserver: ResizeObserver | null = null
    let ptyId: string | null = null

    // 数据回调引用，用于卸载时移除
    const dataCallback = (payload: unknown) => {
      const { ptyId: id, data } = payload as { ptyId: string; data: string }
      if (id === ptyId && terminal) {
        terminal.write(data)
      }
    }

    const exitCallback = (payload: unknown) => {
      const { ptyId: id } = payload as { ptyId: string; exitCode: number }
      if (id === ptyId && terminal) {
        terminal.write('\r\n\x1b[31m[进程已退出]\x1b[0m\r\n')
      }
    }

    onMounted(async () => {
      if (!containerRef.value) return

      // 创建 xterm 实例
      terminal = new Terminal({
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
        cursorStyle: 'block',
        allowProposedApi: true,
      })

      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())
      terminal.loadAddon(new SearchAddon())

      terminal.open(containerRef.value)
      fitAddon.fit()

      // 获取初始尺寸并启动 PTY
      const cols = terminal.cols
      const rows = terminal.rows
      const result = await invoke<{ ptyId: string }>(IPC_PTY.SPAWN, { cols, rows })
      if (result?.ptyId) {
        ptyId = result.ptyId
        // 在 store 中记录 ptyId
        const instance = sessionsStore.terminalInstances.get(xtermProps.terminalId)
        if (instance) {
          instance.ptyId = ptyId
        }
      }

      // 监听 PTY 输出数据
      on(IPC_PTY.DATA, dataCallback)
      // 监听 PTY 退出
      on(IPC_PTY.EXIT, exitCallback)

      // 监听用户在终端中的输入，转发到 PTY
      terminal.onData((data: string) => {
        if (ptyId) {
          invoke(IPC_PTY.WRITE, { ptyId, data })
        }
      })

      // 终端尺寸变化时同步 PTY
      terminal.onResize(({ cols, rows }) => {
        if (ptyId) {
          invoke(IPC_PTY.RESIZE, { ptyId, cols, rows })
        }
      })

      // 监听容器尺寸变化自动 fit
      resizeObserver = new ResizeObserver(() => {
        if (fitAddon && terminal) {
          fitAddon.fit()
        }
      })
      resizeObserver.observe(containerRef.value)
    })

    onBeforeUnmount(() => {
      // 停止监听容器尺寸
      if (resizeObserver) {
        resizeObserver.disconnect()
        resizeObserver = null
      }

      // 终止 PTY 进程
      if (ptyId) {
        invoke(IPC_PTY.KILL, { ptyId })
        ptyId = null
      }

      // 移除 IPC 事件监听
      off(IPC_PTY.DATA, dataCallback)
      off(IPC_PTY.EXIT, exitCallback)

      // 销毁 xterm 实例
      if (terminal) {
        terminal.dispose()
        terminal = null
      }
      fitAddon = null
    })

    return () =>
      h('div', {
        ref: containerRef,
        class: 'terminal-xterm',
        style: { flex: 1, overflow: 'hidden', minWidth: 0, minHeight: 0 },
      })
  },
})

// ===== 递归分屏视图组件 =====
const SplitView = defineComponent({
  name: 'SplitView',
  props: {
    node: {
      type: Object as () => SplitNode,
      required: true,
    },
  },
  setup(splitProps) {
    return () => {
      const node = splitProps.node

      if (node.type === 'terminal') {
        return h(TerminalXterm, { terminalId: node.terminalId })
      }

      // 分屏容器节点
      const isHorizontal = node.direction === 'horizontal'

      // 拖拽状态（本地，直接 mutate node.ratio 因为 Tab.root 是响应式的）
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
            [h(SplitView, { node: node.children[0] })]
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
            [h(SplitView, { node: node.children[1] })]
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

  &:hover {
    background: var(--accent);
  }

  &--horizontal {
    height: 3px;
    cursor: row-resize;
    width: 100%;
  }

  &--vertical {
    width: 3px;
    cursor: col-resize;
    height: 100%;
  }
}

:deep(.terminal-xterm) {
  display: flex;

  .xterm {
    flex: 1;
    padding: 4px;
  }

  .xterm-viewport {
    overflow-y: auto;
  }
}
</style>
