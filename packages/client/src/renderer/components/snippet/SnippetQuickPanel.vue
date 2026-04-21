<template>
  <!-- 快速片段面板：搜索并直接执行片段 -->
  <Teleport to="body">
    <div class="snippet-quick-overlay" @click.self="close">
      <div class="snippet-quick-panel" @keydown.esc="close">
        <!-- 搜索框 -->
        <div class="snippet-quick-panel__search">
          <el-icon class="snippet-quick-panel__search-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            :placeholder="t('snippetPanel.placeholder')"
            class="snippet-quick-panel__input"
            @keydown="handleKeydown"
          />
          <kbd class="snippet-quick-panel__esc-hint">ESC</kbd>
        </div>

        <!-- 结果列表 -->
        <div ref="resultsRef" class="snippet-quick-panel__results">
          <template v-if="filteredSnippets.length > 0">
            <div
              v-for="(snippet, index) in filteredSnippets"
              :key="snippet.id"
              class="snippet-quick-panel__item"
              :class="{ 'snippet-quick-panel__item--active': selectedIndex === index }"
              @click="executeSnippet(snippet)"
              @mouseenter="selectedIndex = index"
            >
              <div class="snippet-quick-panel__item-content">
                <span class="snippet-quick-panel__item-name">{{ snippet.name }}</span>
                <span class="snippet-quick-panel__item-preview">{{ snippet.content.slice(0, 80).replace(/\n/g, ' ') }}</span>
              </div>
              <span class="snippet-quick-panel__item-group">{{ groupName(snippet.groupId) }}</span>
            </div>
          </template>
          <div v-else class="snippet-quick-panel__empty">
            {{ t('snippetPanel.empty') }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useSnippetsStore } from '../../stores/snippets.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { hasVariables } from '@shared/utils/snippet-variables'
import { sendCommandToTerminal } from '../terminal/TerminalPane.vue'
import type { Snippet } from '@shared/types/snippet'

const { t } = useI18n()
const uiStore = useUiStore()
const snippetsStore = useSnippetsStore()
const sessionsStore = useSessionsStore()

const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)

const filteredSnippets = computed<Snippet[]>(() => {
  const q = query.value.toLowerCase().trim()
  const sorted = [...snippetsStore.snippets].sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
    return bTime - aTime
  })
  if (!q) return sorted
  return sorted.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.content.toLowerCase().includes(q)
  )
})

function groupName(groupId: string | null | undefined): string {
  if (!groupId) return ''
  const group = snippetsStore.groups.find(g => g.id === groupId)
  return group?.name || ''
}

function close(): void {
  uiStore.closeSnippetQuickPanel()
}

function executeSnippet(snippet: Snippet): void {
  if (hasVariables(snippet.content)) {
    uiStore.openSnippetVariableDialog(snippet)
    close()
    return
  }
  const terminalIds = sessionsStore.getActiveTabTerminalIds()
  if (terminalIds.length > 0) {
    sendCommandToTerminal(terminalIds[0], snippet.content)
    snippetsStore.incrementUseCount(snippet.id)
  }
  close()
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredSnippets.value.length - 1)
    scrollActiveIntoView()
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    scrollActiveIntoView()
  }
  if (e.key === 'Enter') {
    const snippet = filteredSnippets.value[selectedIndex.value]
    if (snippet) executeSnippet(snippet)
  }
}

function scrollActiveIntoView(): void {
  nextTick(() => {
    const el = resultsRef.value?.querySelector('.snippet-quick-panel__item--active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

onMounted(() => {
  // 确保 snippets 已加载（init 已在 WorkspaceView onMounted 调用，这里只是防御性）
  if (snippetsStore.snippets.length === 0) {
    snippetsStore.fetchSnippets()
  }
  nextTick(() => inputRef.value?.focus())
})
</script>

<style lang="scss" scoped>
.snippet-quick-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  z-index: 9999;
}

.snippet-quick-panel {
  width: 520px;
  max-height: 480px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;

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
    flex: 1;
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

  &__item-preview {
    display: block;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__item-group {
    font-size: 11px;
    color: var(--text-tertiary);
    background: var(--bg-inset);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 1px 6px;
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
