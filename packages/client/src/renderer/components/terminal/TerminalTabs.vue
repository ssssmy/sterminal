<template>
  <!-- 终端标签栏：标签列表 + 滚动箭头 + 新建按钮 -->
  <div class="terminal-tabs">
    <!-- 左侧滚动箭头（溢出时显示）-->
    <button
      v-show="showScrollLeft"
      class="terminal-tabs__scroll-btn terminal-tabs__scroll-btn--left"
      @click="scrollBy(-120)"
    >
      <el-icon :size="12"><ArrowLeft /></el-icon>
    </button>

    <!-- 标签列表可滚动区域 -->
    <div
      ref="scrollContainerRef"
      class="terminal-tabs__scroll"
      @scroll="checkScrollState"
      @wheel.prevent="handleWheel"
    >
      <div
        v-for="tab in sessionsStore.tabs"
        :key="tab.id"
        class="terminal-tabs__tab"
        :class="{ 'terminal-tabs__tab--active': sessionsStore.activeTabId === tab.id }"
        :title="tab.label"
        @click="sessionsStore.switchTab(tab.id)"
        @dblclick="startRename(tab.id, tab.label)"
      >
        <!-- 类型图标：SSH 用连接图标，本地用终端图标 -->
        <el-icon :size="13" class="terminal-tabs__type-icon">
          <component :is="getTabIcon(tab)" />
        </el-icon>

        <!-- 标签名：正常显示或内联编辑 -->
        <template v-if="renamingTabId === tab.id">
          <input
            :ref="(el) => { if (el) renameInputRef = el as HTMLInputElement }"
            v-model="renameValue"
            class="terminal-tabs__rename-input"
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
            @click.stop
          />
        </template>
        <span v-else class="terminal-tabs__label">{{ tab.label }}</span>

        <!-- 固定图标 -->
        <el-icon v-if="tab.pinned" :size="11" class="terminal-tabs__pin">
          <Star />
        </el-icon>

        <!-- 关闭按钮（未固定时显示）-->
        <button
          v-if="!tab.pinned"
          class="terminal-tabs__close"
          @click.stop="sessionsStore.closeTab(tab.id)"
        >
          <el-icon :size="11"><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- 右侧滚动箭头 -->
    <button
      v-show="showScrollRight"
      class="terminal-tabs__scroll-btn terminal-tabs__scroll-btn--right"
      @click="scrollBy(120)"
    >
      <el-icon :size="12"><ArrowRight /></el-icon>
    </button>

    <!-- 新建标签页按钮 -->
    <button class="terminal-tabs__new-btn" @click="sessionsStore.createTab()">
      <el-icon :size="14"><Plus /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, watch } from 'vue'
import { Star, Close, Plus, ArrowLeft, ArrowRight, Monitor, Connection } from '@element-plus/icons-vue'
import { useSessionsStore } from '../../stores/sessions.store'
import type { TabSession } from '@shared/types/terminal'

const sessionsStore = useSessionsStore()

// ===== 滚动状态 =====
const scrollContainerRef = ref<HTMLElement | null>(null)
const showScrollLeft = ref(false)
const showScrollRight = ref(false)

function checkScrollState(): void {
  const el = scrollContainerRef.value
  if (!el) return
  showScrollLeft.value = el.scrollLeft > 0
  showScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollBy(delta: number): void {
  scrollContainerRef.value?.scrollBy({ left: delta, behavior: 'smooth' })
}

function handleWheel(e: WheelEvent): void {
  scrollContainerRef.value?.scrollBy({ left: e.deltaY })
}

// ===== 内联重命名 =====
const renamingTabId = ref<string | null>(null)
const renameValue = ref('')
let renameInputRef: HTMLInputElement | null = null

function startRename(tabId: string, currentLabel: string): void {
  renamingTabId.value = tabId
  renameValue.value = currentLabel
  nextTick(() => {
    renameInputRef?.select()
  })
}

function commitRename(): void {
  if (renamingTabId.value && renameValue.value.trim()) {
    sessionsStore.renameTab(renamingTabId.value, renameValue.value)
  }
  renamingTabId.value = null
  renameValue.value = ''
}

function cancelRename(): void {
  renamingTabId.value = null
  renameValue.value = ''
}

// ===== 标签图标：SSH 连接 vs 本地终端 =====
function getTabIcon(tab: TabSession): typeof Monitor {
  // 通过 sessionsStore 中的 terminalInstances 判断类型
  const root = tab.root
  if (root.type === 'terminal') {
    const instance = sessionsStore.terminalInstances.get(root.terminalId)
    if (instance?.type === 'ssh') return Connection
  }
  return Monitor
}

// 标签数量变化时刷新滚动状态，并自动滚动到活跃标签
watch(
  () => sessionsStore.tabs.length,
  () => nextTick(checkScrollState),
)

onMounted(() => {
  nextTick(checkScrollState)
})
</script>

<style lang="scss" scoped>
.terminal-tabs {
  display: flex;
  align-items: center;
  height: var(--tab-height);
  background-color: var(--tab-bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;

  // ===== 滚动箭头 =====
  &__scroll-btn {
    width: 24px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-right: 1px solid var(--divider);
    background: var(--tab-bg);
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    z-index: 1;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &--right {
      border-right: none;
      border-left: 1px solid var(--divider);
    }
  }

  // ===== 标签滚动容器 =====
  &__scroll {
    flex: 1;
    display: flex;
    align-items: stretch;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;

    // 隐藏滚动条
    &::-webkit-scrollbar {
      height: 0;
    }
  }

  // ===== 单个标签 =====
  &__tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    height: 100%;
    min-width: 100px;
    max-width: 200px;
    cursor: pointer;
    border-right: 1px solid var(--divider);
    color: var(--text-secondary);
    font-size: 12px;
    transition: background-color 0.15s;
    flex-shrink: 0;
    position: relative;
    user-select: none;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);

      .terminal-tabs__close {
        opacity: 1;
      }
    }

    &--active {
      background-color: var(--tab-active-bg);
      color: var(--text-primary);
      // 活跃标签底部无边线（视觉上与内容区融合）
      border-bottom: 2px solid var(--accent);

      .terminal-tabs__close {
        opacity: 1;
      }
    }
  }

  &__type-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  // 内联重命名输入框
  &__rename-input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 1px 4px;
    outline: none;
  }

  &__pin {
    color: var(--accent);
    flex-shrink: 0;
  }

  &__close {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    opacity: 0;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--error);
    }
  }

  // ===== 新建标签按钮 =====
  &__new-btn {
    width: 36px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-left: 1px solid var(--divider);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}
</style>
