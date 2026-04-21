<template>
  <Teleport to="body">
    <div class="vault-fill-overlay" @click.self="close">
      <div class="vault-fill-panel" @keydown.esc="close">
        <!-- 标题 -->
        <div class="vault-fill-panel__header">
          <span class="vault-fill-panel__title">{{ t('vaultFill.title') }}</span>
          <kbd class="vault-fill-panel__esc-hint">ESC</kbd>
        </div>

        <!-- 搜索框 -->
        <div class="vault-fill-panel__search">
          <el-icon class="vault-fill-panel__search-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            :placeholder="t('vaultFill.placeholder')"
            class="vault-fill-panel__input"
            @keydown="handleKeydown"
          />
        </div>

        <!-- 结果列表 -->
        <div ref="resultsRef" class="vault-fill-panel__results">
          <template v-if="filteredEntries.length > 0">
            <div
              v-for="(entry, index) in filteredEntries"
              :key="entry.id"
              class="vault-fill-panel__item"
              :class="{ 'vault-fill-panel__item--active': selectedIndex === index }"
              @click="fillEntry(entry)"
              @mouseenter="selectedIndex = index"
            >
              <div class="vault-fill-panel__item-content">
                <span class="vault-fill-panel__item-name">{{ entry.name }}</span>
                <span v-if="entry.username" class="vault-fill-panel__item-username">{{ entry.username }}</span>
              </div>
              <el-tag size="small" :type="tagType(entry.type)">{{ entry.type }}</el-tag>
            </div>
          </template>
          <div v-else-if="vaultStore.entries.length === 0" class="vault-fill-panel__empty">
            <div>{{ t('vaultFill.empty') }}</div>
            <div class="vault-fill-panel__empty-hint">{{ t('vaultFill.emptyHint') }}</div>
          </div>
          <div v-else class="vault-fill-panel__empty">
            {{ t('vaultFill.empty') }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useVaultStore } from '../../stores/vault.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { sendRawToTerminal } from '../terminal/TerminalPane.vue'
import type { VaultEntry, VaultEntryType } from '@shared/types/vault'

const { t } = useI18n()
const uiStore = useUiStore()
const vaultStore = useVaultStore()
const sessionsStore = useSessionsStore()

const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLDivElement | null>(null)
const query = ref('')
const selectedIndex = ref(0)

const filteredEntries = computed<VaultEntry[]>(() => {
  const q = query.value.toLowerCase().trim()
  const all = [...vaultStore.entries].sort((a, b) => a.sortOrder - b.sortOrder)
  if (!q) return all
  return all.filter(e =>
    e.name.toLowerCase().includes(q) ||
    (e.username || '').toLowerCase().includes(q)
  )
})

function tagType(type: VaultEntryType): 'success' | 'warning' | 'info' | 'primary' | 'danger' {
  switch (type) {
    case 'password':
    case 'ssh_password':
      return 'success'
    case 'api_key':
      return 'warning'
    case 'token':
      return 'primary'
    case 'certificate':
      return 'info'
    default:
      return 'info'
  }
}

function close(): void {
  uiStore.closeVaultFillDialog()
}

function fillEntry(entry: VaultEntry): void {
  const terminalIds = sessionsStore.getActiveTabTerminalIds()
  if (terminalIds.length === 0) {
    ElMessage.warning(t('sftp.noSshConnection'))
    close()
    return
  }
  // 发送原始密码数据，不追加 \r，用户可自行决定何时回车
  sendRawToTerminal(terminalIds[0], entry.value)
  ElMessage.success(t('vaultFill.filled'))
  close()
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredEntries.value.length - 1)
    scrollActiveIntoView()
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    scrollActiveIntoView()
  }
  if (e.key === 'Enter') {
    const entry = filteredEntries.value[selectedIndex.value]
    if (entry) fillEntry(entry)
  }
}

function scrollActiveIntoView(): void {
  nextTick(() => {
    const el = resultsRef.value?.querySelector('.vault-fill-panel__item--active') as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

onMounted(() => {
  if (vaultStore.entries.length === 0) {
    vaultStore.fetchEntries()
  }
  nextTick(() => inputRef.value?.focus())
})
</script>

<style lang="scss" scoped>
.vault-fill-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 120px;
  z-index: 9999;
}

.vault-fill-panel {
  width: 540px;
  max-height: 480px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--divider);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

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

  &__item-username {
    display: block;
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  &__empty {
    padding: 32px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }

  &__empty-hint {
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-tertiary);
  }
}
</style>
