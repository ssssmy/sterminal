<template>
  <div class="terminal-search-bar" @keydown.stop>
    <input
      ref="inputRef"
      v-model="query"
      class="terminal-search-bar__input"
      :placeholder="t('searchBar.placeholder')"
      spellcheck="false"
      @input="handleInput"
      @keydown.enter.exact="findNext"
      @keydown.enter.shift="findPrevious"
      @keydown.escape="close"
    />

    <!-- 匹配选项 -->
    <button
      class="terminal-search-bar__option"
      :class="{ 'terminal-search-bar__option--active': caseSensitive }"
      :title="t('searchBar.caseSensitive')"
      @click="caseSensitive = !caseSensitive; handleInput()"
    >Aa</button>
    <button
      class="terminal-search-bar__option"
      :class="{ 'terminal-search-bar__option--active': wholeWord }"
      :title="t('searchBar.wholeWord')"
      @click="wholeWord = !wholeWord; handleInput()"
    >W</button>
    <button
      class="terminal-search-bar__option"
      :class="{ 'terminal-search-bar__option--active': regex }"
      :title="t('searchBar.regex')"
      @click="regex = !regex; handleInput()"
    >.*</button>

    <!-- 导航按钮 -->
    <button class="terminal-search-bar__nav" :title="t('searchBar.prevMatch')" @click="findPrevious">
      <el-icon :size="14"><ArrowUp /></el-icon>
    </button>
    <button class="terminal-search-bar__nav" :title="t('searchBar.nextMatch')" @click="findNext">
      <el-icon :size="14"><ArrowDown /></el-icon>
    </button>

    <!-- 关闭 -->
    <button class="terminal-search-bar__close" :title="t('searchBar.close')" @click="close">
      <el-icon :size="14"><Close /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '../../stores/sessions.store'
import { useUiStore } from '../../stores/ui.store'
import {
  terminalFindNext,
  terminalFindPrevious,
  terminalClearSearch,
} from './TerminalPane.vue'

const { t } = useI18n()
const sessionsStore = useSessionsStore()
const uiStore = useUiStore()

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const caseSensitive = ref(false)
const wholeWord = ref(false)
const regex = ref(false)

function getTerminalIds(): string[] {
  return sessionsStore.getActiveTabTerminalIds()
}

function getOptions() {
  return {
    caseSensitive: caseSensitive.value,
    wholeWord: wholeWord.value,
    regex: regex.value,
  }
}

function handleInput(): void {
  const ids = getTerminalIds()
  if (query.value) {
    terminalFindNext(ids, query.value, getOptions())
  } else {
    terminalClearSearch(ids)
  }
}

function findNext(): void {
  terminalFindNext(getTerminalIds(), query.value, getOptions())
}

function findPrevious(): void {
  terminalFindPrevious(getTerminalIds(), query.value, getOptions())
}

function close(): void {
  terminalClearSearch(getTerminalIds())
  query.value = ''
  uiStore.showTerminalSearch = false
}

// 打开时自动聚焦
onMounted(() => {
  inputRef.value?.focus()
})

// tab 切换时清除旧 tab 的搜索高亮
watch(() => sessionsStore.activeTabId, () => {
  if (query.value) {
    // 延迟一帧让 DOM 切换完成
    requestAnimationFrame(() => {
      terminalFindNext(getTerminalIds(), query.value, getOptions())
    })
  }
})

onBeforeUnmount(() => {
  terminalClearSearch(getTerminalIds())
})
</script>

<style lang="scss" scoped>
.terminal-search-bar {
  position: absolute;
  top: 8px;
  right: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 6px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

  &__input {
    width: 180px;
    height: 26px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-input, var(--bg-primary));
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color var(--st-duration-fast) var(--st-easing-smooth);

    &:focus {
      border-color: var(--accent);
    }

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  &__option {
    height: 24px;
    min-width: 24px;
    padding: 0 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth), border-color var(--st-duration-fast) var(--st-easing-smooth), opacity var(--st-duration-fast) var(--st-easing-smooth);

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-secondary);
    }

    &--active {
      background-color: var(--accent);
      color: #fff;
      border-color: var(--accent);

      &:hover {
        opacity: 0.9;
      }
    }
  }

  &__nav {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__close {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    margin-left: 2px;
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}
</style>
