<template>
  <!-- 命令面板（全局快捷命令搜索） -->
  <Teleport to="body">
    <div class="command-palette-overlay" @click.self="uiStore.closeCommandPalette()">
      <div class="command-palette">
        <!-- 搜索框 -->
        <div class="command-palette__search">
          <el-icon class="command-palette__search-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            :placeholder="t('commandPalette.placeholder')"
            class="command-palette__input"
            @keydown="handleKeydown"
          />
          <kbd class="command-palette__esc-hint">ESC</kbd>
        </div>

        <!-- 结果列表 -->
        <div ref="resultsRef" class="command-palette__results">
          <template v-if="groupedResults.length > 0">
            <template v-for="group in groupedResults" :key="group.category">
              <!-- 分组标题 -->
              <div class="command-palette__group-label">{{ group.label }}</div>
              <!-- 分组条目 -->
              <div
                v-for="item in group.items"
                :key="item.id"
                class="command-palette__item"
                :class="{ 'command-palette__item--active': selectedIndex === item._flatIndex }"
                @click="executeItem(item)"
                @mouseenter="selectedIndex = item._flatIndex"
              >
                <el-icon class="command-palette__item-icon" :style="{ color: item.iconColor }">
                  <component :is="item.icon" />
                </el-icon>
                <div class="command-palette__item-content">
                  <span class="command-palette__item-name">{{ item.name }}</span>
                  <span v-if="item.desc" class="command-palette__item-desc">{{ item.desc }}</span>
                </div>
                <span
                  v-if="item.categoryLabel"
                  class="command-palette__item-badge"
                >{{ item.categoryLabel }}</span>
                <kbd v-if="item.shortcut" class="command-palette__item-shortcut">{{ item.shortcut }}</kbd>
              </div>
            </template>
          </template>

          <div v-else class="command-palette__empty">
            {{ t('commandPalette.empty') }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Search, Monitor, Setting, Plus, Connection, Document,
  Cpu, FullScreen, VideoCamera, Microphone, ScaleToOriginal,
} from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useHostsStore } from '../../stores/hosts.store'
import { useSnippetsStore } from '../../stores/snippets.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { usePortForwardsStore } from '../../stores/port-forwards.store'
import { hasVariables } from '@shared/utils/snippet-variables'
import { sendCommandToTerminal } from '../terminal/TerminalPane.vue'

const { t } = useI18n()
const router = useRouter()
const uiStore = useUiStore()
const sessionsStore = useSessionsStore()
const hostsStore = useHostsStore()
const snippetsStore = useSnippetsStore()
const terminalsStore = useTerminalsStore()
const portForwardsStore = usePortForwardsStore()

const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)

type Category = 'command' | 'host' | 'snippet' | 'terminal' | 'portforward' | 'settings'

interface CommandItem {
  id: string
  name: string
  desc?: string
  icon: typeof Monitor
  iconColor?: string
  shortcut?: string
  categoryLabel?: string
  category: Category
  /** 扁平化后的下标，用于键盘选中 */
  _flatIndex: number
  action: () => void
}

interface ResultGroup {
  category: Category
  label: string
  items: CommandItem[]
}

// 预排序片段（独立 computed，仅在 snippets 变化时重新排序）
const sortedSnippets = computed(() =>
  [...snippetsStore.snippets].sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    return bTime - aTime
  })
)

// ===== 所有条目（未过滤） =====
const allItems = computed<CommandItem[]>(() => {
  const items: Omit<CommandItem, '_flatIndex'>[] = []

  // --- 常用命令 ---
  items.push(
    {
      id: 'cmd-new-tab',
      name: t('commandPalette.cmdNewTab'),
      desc: t('commandPalette.cmdNewTabDesc'),
      icon: Plus,
      iconColor: 'var(--el-color-primary)',
      shortcut: 'Ctrl+T',
      category: 'command',
      action: () => sessionsStore.createTab(),
    },
    {
      id: 'cmd-split-h',
      name: t('commandPalette.cmdSplitH'),
      icon: ScaleToOriginal,
      category: 'command',
      action: () => {
        const tab = sessionsStore.activeTab
        if (!tab) return
        const ids = sessionsStore.getActiveTabTerminalIds()
        if (ids.length > 0) sessionsStore.splitPane(tab.id, ids[0], 'horizontal')
      },
    },
    {
      id: 'cmd-split-v',
      name: t('commandPalette.cmdSplitV'),
      icon: ScaleToOriginal,
      category: 'command',
      action: () => {
        const tab = sessionsStore.activeTab
        if (!tab) return
        const ids = sessionsStore.getActiveTabTerminalIds()
        if (ids.length > 0) sessionsStore.splitPane(tab.id, ids[0], 'vertical')
      },
    },
    {
      id: 'cmd-broadcast',
      name: t('commandPalette.cmdBroadcast'),
      icon: Microphone,
      category: 'command',
      action: () => { sessionsStore.broadcastMode = !sessionsStore.broadcastMode },
    },
    {
      id: 'cmd-record',
      name: t('commandPalette.cmdRecord'),
      icon: VideoCamera,
      category: 'command',
      action: () => { /* 录制切换由 toolbar 处理，此处打开设置日志页 */ router.push('/settings/logs') },
    },
    {
      id: 'cmd-search',
      name: t('commandPalette.cmdSearch'),
      icon: Search,
      category: 'command',
      action: () => { uiStore.showTerminalSearch = !uiStore.showTerminalSearch },
    },
    {
      id: 'cmd-fullscreen',
      name: t('commandPalette.cmdFullscreen'),
      icon: FullScreen,
      shortcut: 'F11',
      category: 'command',
      action: () => { document.documentElement.requestFullscreen?.() },
    },
    {
      id: 'cmd-settings',
      name: t('commandPalette.cmdSettings'),
      icon: Setting,
      category: 'command',
      action: () => router.push('/settings'),
    },
    {
      id: 'cmd-settings-terminal',
      name: t('commandPalette.cmdSettingsTerminal'),
      icon: Setting,
      category: 'settings',
      action: () => router.push('/settings/terminal'),
    },
    {
      id: 'cmd-settings-appearance',
      name: t('commandPalette.cmdSettingsAppearance'),
      icon: Setting,
      category: 'settings',
      action: () => router.push('/settings/appearance'),
    },
    {
      id: 'cmd-settings-keys',
      name: t('commandPalette.cmdSettingsKeys'),
      icon: Setting,
      category: 'settings',
      action: () => router.push('/settings/keys'),
    },
    {
      id: 'cmd-settings-logs',
      name: t('commandPalette.cmdSettingsLogs'),
      icon: Setting,
      category: 'settings',
      action: () => router.push('/settings/logs'),
    },
  )

  // --- 主机 ---
  for (const host of hostsStore.hosts) {
    items.push({
      id: `host-${host.id}`,
      name: host.label || host.address,
      desc: `${host.username || 'root'}@${host.address}:${host.port}`,
      icon: Monitor,
      iconColor: 'var(--el-color-success)',
      categoryLabel: t('commandPalette.categoryHost'),
      category: 'host',
      action: () => sessionsStore.createTab(host.label || host.address, 'ssh', host.id),
    })
  }

  // --- 命令片段（按 useCount 降序排列，最近使用的靠前） ---
  for (const snippet of sortedSnippets.value) {
    items.push({
      id: `snippet-${snippet.id}`,
      name: snippet.name,
      desc: snippet.content.slice(0, 60).replace(/\n/g, ' '),
      icon: Document,
      iconColor: 'var(--el-color-warning)',
      categoryLabel: t('commandPalette.categorySnippet'),
      category: 'snippet',
      action: () => {
        if (hasVariables(snippet.content)) {
          uiStore.openSnippetVariableDialog(snippet)
        } else {
          const ids = sessionsStore.getActiveTabTerminalIds()
          if (ids.length === 0) return
          snippetsStore.incrementUseCount(snippet.id)
          sendCommandToTerminal(ids[0], snippet.content)
        }
      },
    })
  }

  // --- 本地终端配置 ---
  for (const terminal of terminalsStore.terminals) {
    items.push({
      id: `terminal-${terminal.id}`,
      name: terminal.name,
      desc: terminal.cwd || terminal.shell,
      icon: Cpu,
      iconColor: 'var(--el-color-info)',
      categoryLabel: t('commandPalette.categoryTerminal'),
      category: 'terminal',
      action: () => sessionsStore.createTab(terminal.name, 'local', terminal.id),
    })
  }

  // --- 端口转发规则 ---
  for (const rule of portForwardsStore.rules) {
    const pfHost = hostsStore.hosts.find(h => h.id === rule.hostId)
    const hostName = pfHost?.label || pfHost?.address || rule.hostId
    items.push({
      id: `pf-${rule.id}`,
      name: rule.name || `${rule.type === 'local' ? 'L' : 'R'}:${rule.localPort ?? rule.remotePort}`,
      desc: hostName,
      icon: Connection,
      iconColor: 'var(--el-color-danger)',
      categoryLabel: t('commandPalette.categoryPortForward'),
      category: 'portforward',
      action: () => uiStore.openPortForwardDialog(rule.id),
    })
  }

  // 追加 _flatIndex
  return items.map((item, i) => ({ ...item, _flatIndex: i }))
})

// ===== 过滤 + 分组 =====
const CATEGORY_ORDER: Category[] = ['command', 'host', 'snippet', 'terminal', 'portforward', 'settings']

function getCategoryLabel(cat: Category): string {
  const map: Record<Category, string> = {
    command: t('commandPalette.groupCommand'),
    host: t('commandPalette.groupHost'),
    snippet: t('commandPalette.groupSnippet'),
    terminal: t('commandPalette.groupTerminal'),
    portforward: t('commandPalette.groupPortForward'),
    settings: t('commandPalette.groupSettings'),
  }
  return map[cat]
}

const groupedResults = computed<ResultGroup[]>(() => {
  const q = query.value.toLowerCase().trim()
  const filtered = q
    ? allItems.value.filter(item =>
        item.name.toLowerCase().includes(q) ||
        item.desc?.toLowerCase().includes(q)
      )
    : allItems.value

  // 重新分配连续索引（过滤后原始 _flatIndex 不再连续）
  let idx = 0
  const reindexed = filtered.map(item => ({ ...item, _flatIndex: idx++ }))

  const map = new Map<Category, CommandItem[]>()
  for (const item of reindexed) {
    if (!map.has(item.category)) map.set(item.category, [])
    map.get(item.category)!.push(item)
  }

  const groups: ResultGroup[] = []
  for (const cat of CATEGORY_ORDER) {
    const items = map.get(cat)
    if (items && items.length > 0) {
      groups.push({ category: cat, label: getCategoryLabel(cat), items })
    }
  }
  return groups
})

const flatResults = computed(() =>
  groupedResults.value.flatMap(g => g.items)
)

// 过滤变化时重置选中
watch(query, () => { selectedIndex.value = 0 })

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    uiStore.closeCommandPalette()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, flatResults.value.length - 1)
    scrollActiveIntoView()
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    scrollActiveIntoView()
  }
  if (e.key === 'Enter') {
    const item = flatResults.value.find(i => i._flatIndex === selectedIndex.value)
    if (item) executeItem(item)
  }
}

function scrollActiveIntoView(): void {
  nextTick(() => {
    const el = resultsRef.value?.querySelector('.command-palette__item--active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function executeItem(item: CommandItem): void {
  item.action()
  uiStore.closeCommandPalette()
}

// 打开时自动聚焦输入框
onMounted(() => {
  inputRef.value?.focus()
  document.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    uiStore.closeCommandPalette()
  }
}
</script>

<style lang="scss" scoped>
.command-palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  z-index: 9999;
}

.command-palette {
  width: 600px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;

  &__search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--divider);
  }

  &__search-icon {
    color: var(--text-tertiary);
    font-size: 16px;
    flex-shrink: 0;
  }

  &__input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 15px;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  &__esc-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    flex-shrink: 0;
  }

  &__results {
    max-height: 420px;
    overflow-y: auto;
    padding: 6px;
  }

  &__group-label {
    padding: 8px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.1s;

    &--active {
      background-color: var(--bg-hover);
    }
  }

  &__item-icon {
    font-size: 16px;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  &__item-content {
    flex: 1;
    min-width: 0;
  }

  &__item-name {
    display: block;
    font-size: 14px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__item-desc {
    display: block;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__item-badge {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
    flex-shrink: 0;
  }

  &__item-shortcut {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
    flex-shrink: 0;
  }

  &__empty {
    padding: 32px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }
}
</style>
