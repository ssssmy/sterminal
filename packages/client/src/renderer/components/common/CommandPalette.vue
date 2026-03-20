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
            placeholder="搜索命令、主机、片段..."
            class="command-palette__input"
            @keydown="handleKeydown"
          />
          <kbd class="command-palette__esc-hint">ESC</kbd>
        </div>

        <!-- 结果列表 -->
        <div class="command-palette__results">
          <div
            v-for="(item, index) in filteredItems"
            :key="item.id"
            class="command-palette__item"
            :class="{ 'command-palette__item--active': selectedIndex === index }"
            @click="executeItem(item)"
            @mouseenter="selectedIndex = index"
          >
            <el-icon class="command-palette__item-icon">
              <component :is="item.icon" />
            </el-icon>
            <div class="command-palette__item-content">
              <span class="command-palette__item-name">{{ item.name }}</span>
              <span v-if="item.desc" class="command-palette__item-desc">{{ item.desc }}</span>
            </div>
            <kbd v-if="item.shortcut" class="command-palette__item-shortcut">{{ item.shortcut }}</kbd>
          </div>

          <div v-if="filteredItems.length === 0" class="command-palette__empty">
            没有找到匹配的命令
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Monitor, Setting, Plus } from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useHostsStore } from '../../stores/hosts.store'

const router = useRouter()
const uiStore = useUiStore()
const sessionsStore = useSessionsStore()
const hostsStore = useHostsStore()

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)

interface CommandItem {
  id: string
  name: string
  desc?: string
  icon: typeof Monitor
  shortcut?: string
  action: () => void
}

// 命令列表（静态命令 + 动态主机列表）
const allItems = computed<CommandItem[]>(() => [
  {
    id: 'new-tab',
    name: '新建标签页',
    desc: '打开一个新的本地终端',
    icon: Plus,
    shortcut: 'Ctrl+T',
    action: () => sessionsStore.createTab(),
  },
  {
    id: 'settings',
    name: '打开设置',
    icon: Setting,
    action: () => router.push('/settings'),
  },
  // 动态主机列表
  ...hostsStore.hosts.map(host => ({
    id: `host-${host.id}`,
    name: `连接 ${host.label || host.address}`,
    desc: `${host.username || ''}@${host.address}:${host.port}`,
    icon: Monitor,
    action: () => sessionsStore.createTab(host.label || host.address, 'ssh', host.id),
  })),
])

const filteredItems = computed(() => {
  if (!query.value.trim()) return allItems.value
  const q = query.value.toLowerCase()
  return allItems.value.filter(
    item =>
      item.name.toLowerCase().includes(q) ||
      item.desc?.toLowerCase().includes(q)
  )
})

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    uiStore.closeCommandPalette()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredItems.value.length - 1)
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  }
  if (e.key === 'Enter' && filteredItems.value[selectedIndex.value]) {
    executeItem(filteredItems.value[selectedIndex.value])
  }
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
  width: 560px;
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
  }

  &__results {
    max-height: 360px;
    overflow-y: auto;
    padding: 6px;
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
    color: var(--text-secondary);
    font-size: 16px;
    flex-shrink: 0;
  }

  &__item-content {
    flex: 1;
    min-width: 0;
  }

  &__item-name {
    display: block;
    font-size: 14px;
    color: var(--text-primary);
  }

  &__item-desc {
    display: block;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
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
    padding: 24px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }
}
</style>
