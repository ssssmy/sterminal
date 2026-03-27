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
        v-for="(tab, tabIndex) in sessionsStore.tabs"
        :key="tab.id"
        class="terminal-tabs__tab"
        :class="{
          'terminal-tabs__tab--active': sessionsStore.activeTabId === tab.id,
          'terminal-tabs__tab--drag-over': dragOverTabId === tab.id,
          'terminal-tabs__tab--dragging': draggingTabId === tab.id,
        }"
        :title="tab.label"
        :draggable="renamingTabId !== tab.id"
        @click="sessionsStore.switchTab(tab.id)"
        @dblclick="startRename(tab.id, tab.label)"
        @contextmenu.prevent="openContextMenu($event, tab)"
        @dragstart="onDragStart($event, tab.id, tabIndex)"
        @dragover.prevent="onDragOver(tab.id)"
        @dragleave="onDragLeave(tab.id)"
        @drop.prevent="onDrop(tabIndex)"
        @dragend="onDragEnd"
      >
        <!-- 类型图标：SSH 用连接图标，本地用终端图标 -->
        <el-icon :size="13" class="terminal-tabs__type-icon">
          <component :is="getTabIcon(tab)" />
        </el-icon>

        <!-- 标签名：正常显示或内联编辑 -->
        <template v-if="renamingTabId === tab.id">
          <input
            ref="renameInputRef"
            v-model="renameValue"
            class="terminal-tabs__rename-input"
            @keyup.enter="commitRename"
            @keyup.escape="cancelRename"
            @blur="commitRename"
            @click.stop
          />
        </template>
        <span v-else class="terminal-tabs__label">{{ tab.label }}</span>

        <!-- 录制指示器 -->
        <span v-if="isTabRecording(tab)" class="terminal-tabs__rec-dot" :title="t('terminalTabs.recording')" />

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

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="terminal-tabs__ctx-backdrop"
        @click="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      />
      <div
        v-if="ctxMenu.visible"
        class="terminal-tabs__ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      >
        <div class="terminal-tabs__ctx-item" @click="handleCtx('restart')">
          <el-icon :size="14"><RefreshRight /></el-icon>
          {{ t('terminalTabs.ctxRestart') }}
        </div>
        <div class="terminal-tabs__ctx-item" @click="handleCtx('duplicate')">
          <el-icon :size="14"><CopyDocument /></el-icon>
          {{ t('terminalTabs.ctxDuplicate') }}
        </div>
        <div class="terminal-tabs__ctx-divider" />
        <div class="terminal-tabs__ctx-item" @click="handleCtx('pin')">
          <el-icon :size="14"><Star /></el-icon>
          {{ ctxMenu.tab?.pinned ? t('terminalTabs.ctxUnpin') : t('terminalTabs.ctxPin') }}
        </div>
        <div class="terminal-tabs__ctx-divider" />
        <div class="terminal-tabs__ctx-item" @click="handleCtx('close')">
          <el-icon :size="14"><Close /></el-icon>
          {{ t('terminalTabs.ctxClose') }}
        </div>
        <div class="terminal-tabs__ctx-item" @click="handleCtx('closeRight')">
          <el-icon :size="14"><Right /></el-icon>
          {{ t('terminalTabs.ctxCloseRight') }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount, watch, type Component } from 'vue'
import { Star, Close, Plus, ArrowLeft, ArrowRight, Monitor, Connection, FolderOpened, RefreshRight, CopyDocument, Right } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '../../stores/sessions.store'
import type { TabSession } from '@shared/types/terminal'
import IconMacOS from '../icons/IconMacOS.vue'
import IconWindows from '../icons/IconWindows.vue'
import IconLinux from '../icons/IconLinux.vue'

const { t } = useI18n()
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
const renameInputRef = ref<HTMLInputElement | null>(null)

function startRename(tabId: string, currentLabel: string): void {
  renamingTabId.value = tabId
  renameValue.value = currentLabel
  nextTick(() => {
    renameInputRef.value?.select()
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

// ===== 检查标签页是否在录制 =====
function isTabRecording(tab: TabSession): boolean {
  function checkNode(node: typeof tab.root): boolean {
    if (node.type === 'terminal') {
      const inst = sessionsStore.terminalInstances.get(node.terminalId)
      return inst?.recording === true
    }
    return checkNode(node.children[0]) || checkNode(node.children[1])
  }
  return checkNode(tab.root)
}

// ===== 标签图标：SSH 连接成功后按远端 OS 显示，否则按类型显示 =====
function getTabIcon(tab: TabSession): Component {
  // SFTP 标签用文件夹图标
  if (tab.contentType === 'sftp') return FolderOpened

  const root = tab.root
  if (root.type === 'terminal') {
    const instance = sessionsStore.terminalInstances.get(root.terminalId)
    if (instance?.type === 'ssh') {
      if (instance.remoteOS === 'darwin') return IconMacOS
      if (instance.remoteOS === 'windows') return IconWindows
      if (instance.remoteOS === 'linux') return IconLinux
      return Connection
    }
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

// ===== 拖拽排序 =====
const draggingTabId = ref<string | null>(null)
const dragFromIndex = ref(-1)
const dragOverTabId = ref<string | null>(null)

function onDragStart(e: DragEvent, tabId: string, index: number): void {
  draggingTabId.value = tabId
  dragFromIndex.value = index
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tabId)
  }
}

function onDragOver(tabId: string): void {
  if (tabId !== draggingTabId.value) {
    dragOverTabId.value = tabId
  }
}

function onDragLeave(tabId: string): void {
  if (dragOverTabId.value === tabId) {
    dragOverTabId.value = null
  }
}

function onDrop(toIndex: number): void {
  if (dragFromIndex.value >= 0 && dragFromIndex.value !== toIndex) {
    sessionsStore.moveTab(dragFromIndex.value, toIndex)
  }
  dragOverTabId.value = null
  draggingTabId.value = null
  dragFromIndex.value = -1
}

function onDragEnd(): void {
  dragOverTabId.value = null
  draggingTabId.value = null
  dragFromIndex.value = -1
}

// ===== 右键上下文菜单 =====
const ctxMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  tab: null as TabSession | null,
})

function openContextMenu(e: MouseEvent, tab: TabSession): void {
  ctxMenu.visible = true
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.tab = tab
}

function closeContextMenu(): void {
  ctxMenu.visible = false
  ctxMenu.tab = null
}

function handleCtx(action: 'restart' | 'duplicate' | 'pin' | 'close' | 'closeRight'): void {
  const tab = ctxMenu.tab
  if (!tab) return
  closeContextMenu()
  switch (action) {
    case 'restart':
      sessionsStore.restartTab(tab.id)
      break
    case 'duplicate':
      sessionsStore.duplicateTab(tab.id)
      break
    case 'pin':
      sessionsStore.togglePinTab(tab.id)
      break
    case 'close':
      sessionsStore.closeTab(tab.id)
      break
    case 'closeRight':
      sessionsStore.closeTabsToRight(tab.id)
      break
  }
}
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
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

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
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);
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

    &--dragging {
      opacity: 0.4;
    }

    &--drag-over {
      border-left: 2px solid var(--accent);
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

  &__rec-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: var(--error, #ef4444);
    flex-shrink: 0;
    animation: st-blink 1.2s ease-in-out infinite;
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
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

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
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}

// ===== 右键菜单（Teleport to body，不用 scoped） =====
</style>

<style lang="scss">
.terminal-tabs__ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
}

.terminal-tabs__ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  background: var(--bg-surface, #232438);
  border: 1px solid var(--border, #2e3048);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  font-size: 12px;
}

.terminal-tabs__ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--text-primary, #e4e4e8);
  cursor: pointer;
  transition: background-color 0.1s;

  &:hover {
    background-color: var(--bg-hover, #2a2b40);
  }

  .el-icon {
    color: var(--text-secondary, #8b8d9e);
  }
}

.terminal-tabs__ctx-divider {
  height: 1px;
  background: var(--divider, #262840);
  margin: 4px 8px;
}
</style>
