<template>
  <!-- 应用侧边栏：包含主机树、本地终端、功能折叠区 -->
  <aside
    class="app-sidebar"
    :style="{ width: `${props.width}px` }"
  >
    <!-- macOS 交通灯占位 + 可拖拽区域 -->
    <div v-if="isMacOS" class="app-sidebar__traffic-light" />

    <!-- ===== 顶部 Header ===== -->
    <div class="app-sidebar__header">
      <div class="app-sidebar__header-left">
        <!-- 用户头像 -->
        <div class="app-sidebar__avatar">
          <span class="app-sidebar__avatar-text">{{ userInitial }}</span>
        </div>
        <span class="app-sidebar__username">{{ authStore.user?.username || '本地用户' }}</span>
      </div>
      <div class="app-sidebar__header-right">
        <!-- 同步状态图标 -->
        <el-tooltip content="同步状态" placement="bottom">
          <button class="app-sidebar__icon-btn" @click="handleSync">
            <el-icon :size="15"><Refresh /></el-icon>
          </button>
        </el-tooltip>
        <!-- 设置入口 -->
        <el-tooltip content="设置" placement="bottom" :disabled="settingsTooltipDisabled">
          <button class="app-sidebar__icon-btn" @click="goToSettings">
            <el-icon :size="15"><Setting /></el-icon>
          </button>
        </el-tooltip>
      </div>
    </div>

    <!-- ===== 搜索框 ===== -->
    <div class="app-sidebar__search-wrap">
      <div class="app-sidebar__search">
        <el-icon class="app-sidebar__search-icon" :size="13"><Search /></el-icon>
        <input
          v-model="searchQuery"
          class="app-sidebar__search-input"
          placeholder="搜索主机和终端…"
          @input="handleSearch"
        />
      </div>
    </div>

    <!-- ===== 可滚动内容区 ===== -->
    <div class="app-sidebar__body" @contextmenu.capture="closeOpenDropdowns">

      <!-- ===== 主机区域 ===== -->
      <div class="app-sidebar__section">
        <!-- 区域标题 -->
        <div class="app-sidebar__section-header">
          <el-icon :size="13" class="app-sidebar__section-icon"><Monitor /></el-icon>
          <span class="app-sidebar__section-title">主机</span>
          <el-tooltip content="新建分组" placement="top">
            <button class="app-sidebar__add-btn" @click="handleAddGroup">
              <el-icon :size="13"><FolderAdd /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="新增主机" placement="top">
            <button class="app-sidebar__add-btn" @click="uiStore.openHostConfigDialog()">
              <el-icon :size="13"><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <!-- 主机分组树 -->
        <div
          class="app-sidebar__host-tree"
          @dragover.prevent="onTreeDragOver"
          @drop.prevent="onTreeDrop"
          @dragleave="onTreeDragLeave"
        >
          <template v-for="group in filteredGroups" :key="group.id">
            <!-- 分组行 -->
            <el-dropdown
              trigger="contextmenu"
              popper-class="sidebar-context-menu"
              @command="(cmd: string) => handleGroupCmd(cmd, group.id)"
            >
              <div
                class="app-sidebar__group-row"
                :class="{ 'app-sidebar__group-row--drag-over': dragOverGroupId === group.id }"
                @click="toggleGroup(group.id)"
                @dragover.prevent.stop="onGroupDragOver($event, group.id)"
                @dragleave="onGroupDragLeave(group.id)"
                @drop.prevent.stop="onGroupDrop($event, group.id)"
              >
                <el-icon :size="12" class="app-sidebar__arrow" :class="{ 'app-sidebar__arrow--expanded': !collapsedGroups.has(group.id) }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="14" class="app-sidebar__folder-icon"><Folder /></el-icon>
                <span class="app-sidebar__group-name">{{ group.name }}</span>
                <span class="app-sidebar__group-count">{{ getGroupHostCount(group.id) }}</span>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                  <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除分组</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <!-- 分组内主机列表 -->
            <div v-if="!collapsedGroups.has(group.id)" class="app-sidebar__group-children">
              <el-dropdown
                v-for="(host, idx) in getGroupHosts(group.id)"
                :key="host.id"
                trigger="contextmenu"
                popper-class="sidebar-context-menu"
                @command="(cmd: string) => handleHostCmd(cmd, host)"
              >
                <div
                  class="app-sidebar__host-item"
                  :class="{
                    'app-sidebar__host-item--hover': hoveredHostId === host.id,
                    'app-sidebar__host-item--connected': isHostConnected(host.id),
                    'app-sidebar__host-item--drop-before': dropIndicator?.hostId === host.id && dropIndicator?.position === 'before',
                    'app-sidebar__host-item--drop-after': dropIndicator?.hostId === host.id && dropIndicator?.position === 'after',
                  }"
                  :title="hostTitle(host)"
                  draggable="true"
                  @dragstart="onHostDragStart($event, host)"
                  @dragend="onHostDragEnd"
                  @dragover.prevent.stop="onHostDragOver($event, host, group.id, idx)"
                  @dragleave="onHostDragLeave"
                  @drop.prevent.stop="onHostDrop($event, host, group.id, idx)"
                  @dblclick="connectToHost(host)"
                  @mouseenter="hoveredHostId = host.id"
                  @mouseleave="hoveredHostId = null"
                >
                  <span
                    class="app-sidebar__status-dot"
                    :class="isHostConnected(host.id) ? 'app-sidebar__status-dot--connected' : 'app-sidebar__status-dot--idle'"
                  />
                  <span class="app-sidebar__host-name">{{ host.label || host.address }}</span>
                  <span v-if="host.notes" class="app-sidebar__host-notes-indicator">📝</span>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!isHostConnected(host.id)" command="connect">连接</el-dropdown-item>
                    <el-dropdown-item v-else command="connect">新建连接</el-dropdown-item>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="duplicate">复制</el-dropdown-item>
                    <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>

          <!-- 未分组主机 -->
          <el-dropdown
            v-for="(host, idx) in filteredUngroupedHosts"
            :key="host.id"
            trigger="contextmenu"
            popper-class="sidebar-context-menu"
            @command="(cmd: string) => handleHostCmd(cmd, host)"
          >
            <div
              class="app-sidebar__host-item app-sidebar__host-item--root"
              :class="{
                'app-sidebar__host-item--hover': hoveredHostId === host.id,
                'app-sidebar__host-item--connected': isHostConnected(host.id),
                'app-sidebar__host-item--drop-before': dropIndicator?.hostId === host.id && dropIndicator?.position === 'before',
                'app-sidebar__host-item--drop-after': dropIndicator?.hostId === host.id && dropIndicator?.position === 'after',
              }"
              :title="hostTitle(host)"
              draggable="true"
              @dragstart="onHostDragStart($event, host)"
              @dragend="onHostDragEnd"
              @dragover.prevent.stop="onHostDragOver($event, host, null, idx)"
              @dragleave="onHostDragLeave"
              @drop.prevent.stop="onHostDrop($event, host, null, idx)"
              @dblclick="connectToHost(host)"
              @mouseenter="hoveredHostId = host.id"
              @mouseleave="hoveredHostId = null"
            >
              <span
                class="app-sidebar__status-dot"
                :class="isHostConnected(host.id) ? 'app-sidebar__status-dot--connected' : 'app-sidebar__status-dot--idle'"
              />
              <span class="app-sidebar__host-name">{{ host.label || host.address }}</span>
              <span v-if="host.notes" class="app-sidebar__host-notes-indicator">📝</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="!isHostConnected(host.id)" command="connect">连接</el-dropdown-item>
                <el-dropdown-item v-else command="connect">新建连接</el-dropdown-item>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item command="duplicate">复制</el-dropdown-item>
                <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 拖到此处移出分组的提示区域 -->
          <div
            v-if="draggedHostId"
            class="app-sidebar__drop-ungrouped"
            :class="{ 'app-sidebar__drop-ungrouped--active': dragOverUngrouped }"
            @dragover.prevent.stop="dragOverUngrouped = true"
            @dragleave="dragOverUngrouped = false"
            @drop.prevent.stop="onDropToUngrouped"
          >
            拖放到此处移为未分组
          </div>

          <!-- 空状态 -->
          <div v-if="!draggedHostId && filteredGroups.length === 0 && filteredUngroupedHosts.length === 0" class="app-sidebar__empty">
            暂无主机
          </div>
        </div>
      </div>

      <!-- 分割线 -->
      <div class="app-sidebar__divider" />

      <!-- ===== 本地终端区域 ===== -->
      <div class="app-sidebar__section">
        <!-- 区域标题 -->
        <div class="app-sidebar__section-header">
          <el-icon :size="13" class="app-sidebar__section-icon"><Cpu /></el-icon>
          <span class="app-sidebar__section-title">本地终端</span>
          <el-tooltip content="新建分组" placement="top">
            <button class="app-sidebar__add-btn" @click="handleAddTerminalGroup">
              <el-icon :size="13"><FolderAdd /></el-icon>
            </button>
          </el-tooltip>
          <el-tooltip content="新建终端配置" placement="top">
            <button class="app-sidebar__add-btn" @click="uiStore.openTerminalConfigDialog()">
              <el-icon :size="13"><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <!-- 终端分组树 -->
        <div
          class="app-sidebar__terminal-list"
          @dragover.prevent="onTerminalTreeDragOver"
          @drop.prevent="onTerminalTreeDrop"
          @dragleave="onTerminalTreeDragLeave"
        >
          <template v-for="group in filteredTerminalGroups" :key="group.id">
            <!-- 分组行 -->
            <el-dropdown
              trigger="contextmenu"
              popper-class="sidebar-context-menu"
              @command="(cmd: string) => handleTerminalGroupCmd(cmd, group.id)"
            >
              <div
                class="app-sidebar__group-row"
                :class="{ 'app-sidebar__group-row--drag-over': termDragOverGroupId === group.id }"
                @click="toggleTerminalGroup(group.id)"
                @dragover.prevent.stop="onTerminalGroupDragOver($event, group.id)"
                @dragleave="onTerminalGroupDragLeave(group.id)"
                @drop.prevent.stop="onTerminalGroupDrop($event, group.id)"
              >
                <el-icon :size="12" class="app-sidebar__arrow" :class="{ 'app-sidebar__arrow--expanded': !collapsedTerminalGroups.has(group.id) }">
                  <ArrowRight />
                </el-icon>
                <el-icon :size="14" class="app-sidebar__folder-icon"><Folder /></el-icon>
                <span class="app-sidebar__group-name">{{ group.name }}</span>
                <span class="app-sidebar__group-count">{{ getTerminalGroupCount(group.id) }}</span>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">重命名</el-dropdown-item>
                  <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除分组</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <!-- 分组内终端列表 -->
            <div v-if="!collapsedTerminalGroups.has(group.id)" class="app-sidebar__group-children">
              <el-dropdown
                v-for="(terminal, idx) in getGroupTerminals(group.id)"
                :key="terminal.id"
                trigger="contextmenu"
                popper-class="sidebar-context-menu"
                @command="(cmd: string) => handleTerminalCmd(cmd, terminal)"
              >
                <div
                  class="app-sidebar__terminal-item"
                  :class="{
                    'app-sidebar__terminal-item--drop-before': termDropIndicator?.terminalId === terminal.id && termDropIndicator?.position === 'before',
                    'app-sidebar__terminal-item--drop-after': termDropIndicator?.terminalId === terminal.id && termDropIndicator?.position === 'after',
                  }"
                  :title="terminalTitle(terminal)"
                  draggable="true"
                  @dragstart="onTerminalDragStart($event, terminal)"
                  @dragend="onTerminalDragEnd"
                  @dragover.prevent.stop="onTerminalDragOver($event, terminal, group.id, idx)"
                  @dragleave="onTerminalDragLeave"
                  @drop.prevent.stop="onTerminalDrop($event, terminal, group.id, idx)"
                  @dblclick="openLocalTerminal(terminal)"
                >
                  <el-icon :size="14" class="app-sidebar__terminal-icon"><Cpu /></el-icon>
                  <span class="app-sidebar__terminal-name">{{ terminal.name }}</span>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="open">打开</el-dropdown-item>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item command="duplicate">复制</el-dropdown-item>
                    <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>

          <!-- 未分组终端 -->
          <el-dropdown
            v-for="(terminal, idx) in filteredUngroupedTerminals"
            :key="terminal.id"
            trigger="contextmenu"
            popper-class="sidebar-context-menu"
            @command="(cmd: string) => handleTerminalCmd(cmd, terminal)"
          >
            <div
              class="app-sidebar__terminal-item app-sidebar__terminal-item--root"
              :class="{
                'app-sidebar__terminal-item--drop-before': termDropIndicator?.terminalId === terminal.id && termDropIndicator?.position === 'before',
                'app-sidebar__terminal-item--drop-after': termDropIndicator?.terminalId === terminal.id && termDropIndicator?.position === 'after',
              }"
              :title="terminalTitle(terminal)"
              draggable="true"
              @dragstart="onTerminalDragStart($event, terminal)"
              @dragend="onTerminalDragEnd"
              @dragover.prevent.stop="onTerminalDragOver($event, terminal, null, idx)"
              @dragleave="onTerminalDragLeave"
              @drop.prevent.stop="onTerminalDrop($event, terminal, null, idx)"
              @dblclick="openLocalTerminal(terminal)"
            >
              <el-icon :size="14" class="app-sidebar__terminal-icon"><Cpu /></el-icon>
              <span class="app-sidebar__terminal-name">{{ terminal.name }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="open">打开</el-dropdown-item>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item command="duplicate">复制</el-dropdown-item>
                <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 拖到此处移出分组的提示区域 -->
          <div
            v-if="draggedTerminalId"
            class="app-sidebar__drop-ungrouped"
            :class="{ 'app-sidebar__drop-ungrouped--active': termDragOverUngrouped }"
            @dragover.prevent.stop="termDragOverUngrouped = true"
            @dragleave="termDragOverUngrouped = false"
            @drop.prevent.stop="onTerminalDropToUngrouped"
          >
            拖放到此处移为未分组
          </div>

          <!-- 空状态 -->
          <div v-if="!draggedTerminalId && filteredTerminalGroups.length === 0 && filteredUngroupedTerminals.length === 0" class="app-sidebar__empty">
            暂无终端配置
          </div>
        </div>
      </div>

      <!-- 分割线 -->
      <div class="app-sidebar__divider" />

      <!-- ===== 功能折叠区 ===== -->

      <!-- 命令片段 -->
      <div
        class="app-sidebar__collapse-row"
        @click="toggleCollapse('snippets')"
      >
        <el-icon :size="13" class="app-sidebar__section-icon"><DocumentCopy /></el-icon>
        <span class="app-sidebar__collapse-label">命令片段</span>
        <el-icon :size="11" class="app-sidebar__collapse-arrow" :class="{ 'app-sidebar__collapse-arrow--open': collapsedSections.has('snippets') }">
          <ArrowRight />
        </el-icon>
      </div>

      <!-- 端口转发 -->
      <div
        class="app-sidebar__collapse-row"
        @click="toggleCollapse('portForwards')"
      >
        <el-icon :size="13" class="app-sidebar__section-icon"><Share /></el-icon>
        <span class="app-sidebar__collapse-label">端口转发</span>
        <el-icon :size="11" class="app-sidebar__collapse-arrow" :class="{ 'app-sidebar__collapse-arrow--open': collapsedSections.has('portForwards') }">
          <ArrowRight />
        </el-icon>
      </div>

      <!-- 密钥库 -->
      <div
        class="app-sidebar__collapse-row"
        @click="toggleCollapse('vault')"
      >
        <el-icon :size="13" class="app-sidebar__section-icon"><Lock /></el-icon>
        <span class="app-sidebar__collapse-label">密钥库</span>
        <el-icon :size="11" class="app-sidebar__collapse-arrow" :class="{ 'app-sidebar__collapse-arrow--open': collapsedSections.has('vault') }">
          <ArrowRight />
        </el-icon>
      </div>

    </div>

    <!-- ===== 侧边栏右侧拖拽调整宽度手柄 ===== -->
    <div
      class="app-sidebar__resize-handle"
      @mousedown="startResize"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import {
  Monitor, Plus, Search, Setting, Refresh,
  Cpu, DocumentCopy, Share, Lock, ArrowRight, FolderAdd,
  Folder,
} from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useHostsStore } from '../../stores/hosts.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAuthStore } from '../../stores/auth.store'
import type { Host } from '@shared/types/host'
import type { LocalTerminalConfig, LocalTerminalGroup } from '@shared/types/terminal'

// ===== 平台检测 =====
const isMacOS = window.electronAPI?.platform === 'darwin'

// ===== props =====
const props = defineProps<{
  width: number
  collapsed: boolean
}>()

const emit = defineEmits<{
  (e: 'resize', width: number): void
}>()

// ===== stores =====
const router = useRouter()
const uiStore = useUiStore()
const hostsStore = useHostsStore()
const terminalsStore = useTerminalsStore()
const sessionsStore = useSessionsStore()
const authStore = useAuthStore()

// ===== 右键菜单：关闭已打开的下拉菜单 =====
function closeOpenDropdowns(): void {
  // 关闭所有已打开的 el-dropdown popper
  document.querySelectorAll('.sidebar-context-menu').forEach(el => {
    const popperEl = el as HTMLElement
    if (popperEl.style.display !== 'none') {
      popperEl.style.display = 'none'
    }
  })
  // 触发 body click 让 Element Plus 内部清理状态
  document.body.click()
}

// ===== 搜索 =====
const searchQuery = ref('')

function handleSearch(): void {
  // 由 computed 自动响应
}

// ===== 用户头像首字母 =====
const userInitial = computed(() => {
  const name = authStore.user?.username || '本地用户'
  return name.charAt(0).toUpperCase()
})

// ===== 分组折叠状态 =====
/** 已折叠的分组 ID 集合（使用 reactive Set，Vue 3.2+ 支持 Set 响应式）*/
const collapsedGroups = reactive<Set<string>>(new Set())

function toggleGroup(groupId: string): void {
  if (collapsedGroups.has(groupId)) {
    collapsedGroups.delete(groupId)
  } else {
    collapsedGroups.add(groupId)
  }
}

// ===== 终端分组折叠状态 =====
const collapsedTerminalGroups = reactive<Set<string>>(new Set())

function toggleTerminalGroup(groupId: string): void {
  if (collapsedTerminalGroups.has(groupId)) {
    collapsedTerminalGroups.delete(groupId)
  } else {
    collapsedTerminalGroups.add(groupId)
  }
}

// ===== 功能区折叠状态 =====
const collapsedSections = reactive<Set<string>>(new Set())

function toggleCollapse(section: string): void {
  if (collapsedSections.has(section)) {
    collapsedSections.delete(section)
  } else {
    collapsedSections.add(section)
  }
}

// ===== 悬停的主机 =====
const hoveredHostId = ref<string | null>(null)

// ===== 拖拽排序 =====
const draggedHostId = ref<string | null>(null)
const dragOverGroupId = ref<string | null>(null)
const dragOverUngrouped = ref(false)
const dropIndicator = ref<{ hostId: string; position: 'before' | 'after' } | null>(null)

// ===== 终端拖拽排序 =====
const draggedTerminalId = ref<string | null>(null)
const termDragOverGroupId = ref<string | null>(null)
const termDragOverUngrouped = ref(false)
const termDropIndicator = ref<{ terminalId: string; position: 'before' | 'after' } | null>(null)

function onTerminalDragStart(e: DragEvent, terminal: LocalTerminalConfig): void {
  draggedTerminalId.value = terminal.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', terminal.id)
  }
}

function onTerminalDragEnd(): void {
  draggedTerminalId.value = null
  termDragOverGroupId.value = null
  termDragOverUngrouped.value = false
  termDropIndicator.value = null
}

function onTerminalGroupDragOver(e: DragEvent, groupId: string): void {
  if (!draggedTerminalId.value) return
  termDragOverGroupId.value = groupId
  termDropIndicator.value = null
  collapsedTerminalGroups.delete(groupId)
}

function onTerminalGroupDragLeave(groupId: string): void {
  if (termDragOverGroupId.value === groupId) {
    termDragOverGroupId.value = null
  }
}

async function onTerminalGroupDrop(e: DragEvent, groupId: string): Promise<void> {
  if (!draggedTerminalId.value) return
  const terminalId = draggedTerminalId.value
  const terminal = terminalsStore.terminals.find(t => t.id === terminalId)
  if (!terminal || terminal.groupId === groupId) {
    onTerminalDragEnd()
    return
  }
  const count = terminalsStore.terminals.filter(t => t.groupId === groupId).length
  await terminalsStore.moveTerminal(terminalId, groupId, count)
  onTerminalDragEnd()
}

function onTerminalDragOver(e: DragEvent, targetTerminal: LocalTerminalConfig, groupId: string | null, idx: number): void {
  if (!draggedTerminalId.value || draggedTerminalId.value === targetTerminal.id) return
  termDragOverGroupId.value = null
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const position = e.clientY < midY ? 'before' : 'after'
  termDropIndicator.value = { terminalId: targetTerminal.id, position }
}

function onTerminalDragLeave(): void {
  // 不清空避免闪烁
}

async function onTerminalDrop(e: DragEvent, targetTerminal: LocalTerminalConfig, groupId: string | null, idx: number): Promise<void> {
  if (!draggedTerminalId.value || draggedTerminalId.value === targetTerminal.id) {
    onTerminalDragEnd()
    return
  }
  const position = termDropIndicator.value?.position || 'after'
  let targetIndex = position === 'before' ? idx : idx + 1

  const draggedTerminal = terminalsStore.terminals.find(t => t.id === draggedTerminalId.value)
  if (draggedTerminal && (draggedTerminal.groupId || null) === groupId) {
    const sortedSiblings = terminalsStore.terminals
      .filter(t => (t.groupId || null) === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const draggedIdx = sortedSiblings.findIndex(t => t.id === draggedTerminalId.value)
    if (draggedIdx !== -1 && draggedIdx < idx) {
      targetIndex--
    }
  }

  await terminalsStore.moveTerminal(draggedTerminalId.value, groupId, targetIndex)
  onTerminalDragEnd()
}

function onTerminalTreeDragOver(e: DragEvent): void {
  // 允许 drop
}

function onTerminalTreeDragLeave(): void {
  termDragOverGroupId.value = null
}

function onTerminalTreeDrop(e: DragEvent): void {
  if (!draggedTerminalId.value) return
  onTerminalDropToUngrouped()
}

async function onTerminalDropToUngrouped(): Promise<void> {
  if (!draggedTerminalId.value) return
  const terminalId = draggedTerminalId.value
  const terminal = terminalsStore.terminals.find(t => t.id === terminalId)
  if (!terminal) { onTerminalDragEnd(); return }
  if (!terminal.groupId) { onTerminalDragEnd(); return }
  const count = terminalsStore.terminals.filter(t => !t.groupId).length
  await terminalsStore.moveTerminal(terminalId, null, count)
  onTerminalDragEnd()
}

function onHostDragStart(e: DragEvent, host: Host): void {
  draggedHostId.value = host.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', host.id)
  }
}

function onHostDragEnd(): void {
  draggedHostId.value = null
  dragOverGroupId.value = null
  dragOverUngrouped.value = false
  dropIndicator.value = null
}

// 拖到分组行上方 → 高亮分组（表示移入该分组）
function onGroupDragOver(e: DragEvent, groupId: string): void {
  if (!draggedHostId.value) return
  dragOverGroupId.value = groupId
  dropIndicator.value = null
  // 自动展开折叠的分组
  collapsedGroups.delete(groupId)
}

function onGroupDragLeave(groupId: string): void {
  if (dragOverGroupId.value === groupId) {
    dragOverGroupId.value = null
  }
}

async function onGroupDrop(e: DragEvent, groupId: string): Promise<void> {
  if (!draggedHostId.value) return
  const hostId = draggedHostId.value
  const host = hostsStore.hosts.find(h => h.id === hostId)
  if (!host || host.groupId === groupId) {
    onHostDragEnd()
    return
  }
  // 移到目标分组末尾
  const count = hostsStore.hosts.filter(h => h.groupId === groupId).length
  await hostsStore.moveHost(hostId, groupId, count)
  onHostDragEnd()
}

// 拖到某个主机条目上 → 显示插入指示线
function onHostDragOver(e: DragEvent, targetHost: Host, groupId: string | null, idx: number): void {
  if (!draggedHostId.value || draggedHostId.value === targetHost.id) return
  dragOverGroupId.value = null
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const position = e.clientY < midY ? 'before' : 'after'
  dropIndicator.value = { hostId: targetHost.id, position }
}

function onHostDragLeave(): void {
  // dropIndicator 在下一次 dragover 或 dragend 时更新，此处不清空避免闪烁
}

async function onHostDrop(e: DragEvent, targetHost: Host, groupId: string | null, idx: number): Promise<void> {
  if (!draggedHostId.value || draggedHostId.value === targetHost.id) {
    onHostDragEnd()
    return
  }
  const position = dropIndicator.value?.position || 'after'
  let targetIndex = position === 'before' ? idx : idx + 1

  // 同组内拖动时，moveHost 会从 siblings 中排除被拖拽主机，
  // 如果被拖拽主机在目标之前，idx 需要减 1 来补偿
  const draggedHost = hostsStore.hosts.find(h => h.id === draggedHostId.value)
  if (draggedHost && (draggedHost.groupId || null) === groupId) {
    const sortedSiblings = hostsStore.hosts
      .filter(h => (h.groupId || null) === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const draggedIdx = sortedSiblings.findIndex(h => h.id === draggedHostId.value)
    if (draggedIdx !== -1 && draggedIdx < idx) {
      targetIndex--
    }
  }

  await hostsStore.moveHost(draggedHostId.value, groupId, targetIndex)
  onHostDragEnd()
}

// 拖到空白区域（整棵树的 dragover）→ 不做特殊处理
function onTreeDragOver(e: DragEvent): void {
  // 允许 drop
}

function onTreeDragLeave(): void {
  dragOverGroupId.value = null
}

function onTreeDrop(e: DragEvent): void {
  // 被子元素的 stop 拦截后不会到这里；
  // 如果到了说明拖到了空区域，按"移出分组"处理
  if (!draggedHostId.value) return
  onDropToUngrouped()
}

async function onDropToUngrouped(): Promise<void> {
  if (!draggedHostId.value) return
  const hostId = draggedHostId.value
  const host = hostsStore.hosts.find(h => h.id === hostId)
  if (!host) { onHostDragEnd(); return }
  if (!host.groupId) { onHostDragEnd(); return } // 已经是未分组
  const count = hostsStore.hosts.filter(h => !h.groupId).length
  await hostsStore.moveHost(hostId, null, count)
  onHostDragEnd()
}

// ===== 过滤后的主机数据 =====
const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return hostsStore.groups

  // 仅显示内有匹配主机的分组
  return hostsStore.groups.filter(g =>
    hostsStore.hosts.some(h =>
      h.groupId === g.id && matchesHost(h, q)
    )
  )
})

const filteredUngroupedHosts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const ungrouped = hostsStore.hosts
    .filter(h => !h.groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  if (!q) return ungrouped
  return ungrouped.filter(h => matchesHost(h, q))
})

const filteredTerminalGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return terminalsStore.groups
  return terminalsStore.groups.filter(g =>
    terminalsStore.terminals.some(t =>
      t.groupId === g.id && matchesTerminal(t, q)
    )
  )
})

const filteredUngroupedTerminals = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const ungrouped = terminalsStore.terminals
    .filter(t => !t.groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  if (!q) return ungrouped
  return ungrouped.filter(t => matchesTerminal(t, q))
})

function matchesHost(host: Host, q: string): boolean {
  return (
    (host.label || '').toLowerCase().includes(q) ||
    host.address.toLowerCase().includes(q) ||
    (host.username || '').toLowerCase().includes(q) ||
    (host.notes || '').toLowerCase().includes(q)
  )
}

function matchesTerminal(terminal: LocalTerminalConfig, q: string): boolean {
  return (
    terminal.name.toLowerCase().includes(q) ||
    (terminal.cwd || '').toLowerCase().includes(q) ||
    (terminal.shell || '').toLowerCase().includes(q)
  )
}

function getGroupTerminals(groupId: string): LocalTerminalConfig[] {
  const q = searchQuery.value.trim().toLowerCase()
  const terminals = terminalsStore.terminals
    .filter(t => t.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  if (!q) return terminals
  return terminals.filter(t => matchesTerminal(t, q))
}

function getTerminalGroupCount(groupId: string): number {
  return terminalsStore.terminals.filter(t => t.groupId === groupId).length
}

function getGroupHosts(groupId: string): Host[] {
  const q = searchQuery.value.trim().toLowerCase()
  const hosts = hostsStore.hosts
    .filter(h => h.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  if (!q) return hosts
  return hosts.filter(h => matchesHost(h, q))
}

function getGroupHostCount(groupId: string): number {
  return hostsStore.hosts.filter(h => h.groupId === groupId).length
}

// ===== 分组管理 =====
async function handleAddGroup(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^.{1,64}$/,
      inputErrorMessage: '分组名称不能为空，且不超过 64 个字符',
    })
    if (value) {
      await hostsStore.createGroup({ name: value.trim(), sortOrder: hostsStore.groups.length })
    }
  } catch {
    // 用户取消
  }
}

async function handleGroupCmd(cmd: string, groupId: string): Promise<void> {
  const group = hostsStore.groups.find(g => g.id === groupId)
  if (!group) return

  if (cmd === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('请输入新的分组名称', '重命名分组', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: group.name,
        inputPattern: /^.{1,64}$/,
        inputErrorMessage: '分组名称不能为空，且不超过 64 个字符',
      })
      if (value) {
        await hostsStore.updateGroup(groupId, { name: value.trim() })
      }
    } catch {
      // 用户取消
    }
  } else if (cmd === 'delete') {
    const count = hostsStore.hosts.filter(h => h.groupId === groupId).length
    const msg = count > 0
      ? `该分组下有 ${count} 台主机，删除后它们将变为未分组。确定删除？`
      : '确定删除该分组？'
    try {
      await ElMessageBox.confirm(msg, '删除分组', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await hostsStore.deleteGroup(groupId)
    } catch {
      // 用户取消
    }
  }
}

// ===== 终端分组管理 =====
async function handleAddTerminalGroup(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入分组名称', '新建分组', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^.{1,64}$/,
      inputErrorMessage: '分组名称不能为空，且不超过 64 个字符',
    })
    if (value) {
      await terminalsStore.createGroup({ name: value.trim(), sortOrder: terminalsStore.groups.length })
    }
  } catch {
    // 用户取消
  }
}

async function handleTerminalGroupCmd(cmd: string, groupId: string): Promise<void> {
  const group = terminalsStore.groups.find(g => g.id === groupId)
  if (!group) return

  if (cmd === 'rename') {
    try {
      const { value } = await ElMessageBox.prompt('请输入新的分组名称', '重命名分组', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: group.name,
        inputPattern: /^.{1,64}$/,
        inputErrorMessage: '分组名称不能为空，且不超过 64 个字符',
      })
      if (value) {
        await terminalsStore.updateGroup(groupId, { name: value.trim() })
      }
    } catch {
      // 用户取消
    }
  } else if (cmd === 'delete') {
    const count = terminalsStore.terminals.filter(t => t.groupId === groupId).length
    const msg = count > 0
      ? `该分组下有 ${count} 个终端配置，删除后它们将变为未分组。确定删除？`
      : '确定删除该分组？'
    try {
      await ElMessageBox.confirm(msg, '删除分组', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await terminalsStore.deleteGroup(groupId)
    } catch {
      // 用户取消
    }
  }
}

function terminalTitle(terminal: LocalTerminalConfig): string {
  const lines: string[] = [terminal.name]
  if (terminal.shell) lines.push(`Shell: ${terminal.shell}`)
  if (terminal.cwd) lines.push(`目录: ${terminal.cwd}`)
  if (terminal.startupCommand) lines.push(`启动命令: ${terminal.startupCommand}`)
  if (terminal.isDefault) lines.push('(默认终端)')
  return lines.join('\n')
}

// ===== 连接状态判断 =====
function isHostConnected(hostId: string): boolean {
  return sessionsStore.connectedHostIds.has(hostId)
}

function hostTitle(host: Host): string {
  const lines: string[] = []
  if (host.label) lines.push(host.label)
  lines.push(`${host.address}:${host.port}`)
  if (host.username) lines.push(`用户: ${host.username}`)
  if (host.protocol && host.protocol !== 'ssh') lines.push(`协议: ${host.protocol}`)
  if (host.notes) lines.push(`备注: ${host.notes}`)
  return lines.join('\n')
}

// ===== 主机操作 =====
function connectToHost(host: Host): void {
  sessionsStore.createTab(host.label || host.address, 'ssh', host.id)
  emit('resize', props.width)
}

async function handleHostCmd(cmd: string, host: Host): Promise<void> {
  if (cmd === 'connect') {
    connectToHost(host)
  } else if (cmd === 'edit') {
    uiStore.openHostConfigDialog(host.id)
  } else if (cmd === 'duplicate') {
    await hostsStore.createHost({
      label: `${host.label || host.address} 副本`,
      address: host.address,
      port: host.port,
      protocol: host.protocol,
      username: host.username,
      authType: host.authType,
      password: host.password,
      keyId: host.keyId,
      keyPassphrase: host.keyPassphrase,
      startupCommand: host.startupCommand,
      encoding: host.encoding,
      keepaliveInterval: host.keepaliveInterval,
      connectTimeout: host.connectTimeout,
      compression: host.compression,
      strictHostKey: host.strictHostKey,
      sshVersion: host.sshVersion,
      notes: host.notes,
      groupId: host.groupId,
      proxyJumpId: host.proxyJumpId,
      socksProxy: host.socksProxy,
      httpProxy: host.httpProxy,
    })
  } else if (cmd === 'delete') {
    sessionsStore.closeTabsByHostId(host.id)
    await hostsStore.deleteHost(host.id)
  }
}

// ===== 本地终端操作 =====
function openLocalTerminal(terminal: LocalTerminalConfig): void {
  sessionsStore.createTab(terminal.name, 'local', terminal.id)
}

async function handleTerminalCmd(cmd: string, terminal: LocalTerminalConfig): Promise<void> {
  if (cmd === 'open') {
    openLocalTerminal(terminal)
  } else if (cmd === 'edit') {
    uiStore.openTerminalConfigDialog(terminal.id)
  } else if (cmd === 'duplicate') {
    await terminalsStore.createTerminal({
      name: `${terminal.name} 副本`,
      shell: terminal.shell,
      cwd: terminal.cwd,
      startupCommand: terminal.startupCommand,
      scriptLineDelay: terminal.scriptLineDelay,
      loginShell: terminal.loginShell,
      groupId: terminal.groupId,
      isDefault: false,
    })
  } else if (cmd === 'delete') {
    await terminalsStore.deleteTerminal(terminal.id)
  }
}

// ===== 同步 =====
function handleSync(): void {
  // TODO: 触发云同步
}

const settingsTooltipDisabled = ref(false)

function goToSettings(): void {
  // 先禁用 tooltip 使其立即消失，再跳转路由
  settingsTooltipDisabled.value = true
  nextTick(() => {
    router.push('/settings')
    // 路由切换后恢复，以便返回时 tooltip 正常工作
    setTimeout(() => { settingsTooltipDisabled.value = false }, 300)
  })
}

// ===== 侧边栏宽度拖拽调整 =====
let resizeStartX = 0
let resizeStartWidth = 0

function startResize(e: MouseEvent): void {
  e.preventDefault()
  resizeStartX = e.clientX
  resizeStartWidth = props.width
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
}

function onResizeMove(e: MouseEvent): void {
  const delta = e.clientX - resizeStartX
  const newWidth = Math.max(180, Math.min(480, resizeStartWidth + delta))
  uiStore.setSidebarWidth(newWidth)
  emit('resize', newWidth)
}

function stopResize(): void {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
})

</script>

<style lang="scss" scoped>
.app-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--sidebar-bg);
  overflow: hidden;
  position: relative;
  flex-shrink: 0;

  // macOS 交通灯占位区域（可拖拽窗口）
  &__traffic-light {
    height: 38px;
    flex-shrink: 0;
    -webkit-app-region: drag;
  }

  // ===== Header =====
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    gap: 12px;
    flex-shrink: 0;
  }

  &__header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #8b5cf6);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__avatar-text {
    color: #fff;
    font-size: 13px;
    font-weight: 600;
  }

  &__username {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__icon-btn {
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
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  // ===== 搜索框 =====
  &__search-wrap {
    padding: 0 12px 8px;
    flex-shrink: 0;
  }

  &__search {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 10px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
  }

  &__search-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;

    &::placeholder {
      color: var(--text-tertiary);
    }
  }

  // ===== 可滚动主体 =====
  &__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;

    &::-webkit-scrollbar {
      width: 4px;
    }
  }

  // ===== 区域 =====
  &__section {
    padding: 12px 0 0;
  }

  &__section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px 6px;
  }

  &__section-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__section-title {
    flex: 1;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__add-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  // ===== 主机树 =====
  &__host-tree {
    padding: 0 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;

    // el-dropdown 默认 inline-flex，需撑满宽度
    :deep(.el-dropdown) {
      display: block;
      width: 100%;
    }
  }

  &__group-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    transition: background-color 0.15s, box-shadow 0.15s;

    &:hover {
      background-color: var(--bg-hover);
    }

    &--drag-over {
      background-color: rgba(99, 102, 241, 0.12);
      box-shadow: inset 0 0 0 1px var(--accent);
    }
  }

  &__arrow {
    color: var(--text-tertiary);
    flex-shrink: 0;
    transition: transform 0.15s;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__folder-icon {
    color: var(--accent);
    flex-shrink: 0;
  }

  &__group-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__group-count {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  // 分组内主机容器 — 左侧线条标识
  &__group-children {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-left: 14px;
    padding-left: 8px;
    border-left: 1px solid var(--divider);
    margin-bottom: 4px;

    :deep(.el-dropdown) {
      display: block;
      width: 100%;
    }
  }

  // 主机条目 — 统一单行紧凑风格
  &__host-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.15s;
    position: relative;

    &--root {
      padding-left: 28px;  // 与分组行的 folder icon 对齐（8 + arrow 12 + gap 8）
    }

    &--hover {
      background-color: var(--bg-hover);
    }

    &--connected {
      .app-sidebar__host-name {
        color: var(--text-primary);
      }
    }

    // 拖拽指示线
    &--drop-before {
      box-shadow: inset 0 2px 0 0 var(--accent);
    }

    &--drop-after {
      box-shadow: inset 0 -2px 0 0 var(--accent);
    }
  }

  // 拖到此处移出分组提示区
  &__drop-ungrouped {
    padding: 8px 12px;
    margin: 4px 0;
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
    text-align: center;
    border: 1px dashed var(--divider);
    transition: all 0.15s;

    &--active {
      border-color: var(--accent);
      background-color: rgba(99, 102, 241, 0.08);
      color: var(--accent);
    }
  }

  &__status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;

    &--connected {
      background-color: var(--success);
      box-shadow: 0 0 4px var(--success);
      animation: pulse-dot 2s ease-in-out infinite;
    }

    &--idle {
      background-color: var(--text-tertiary);
    }
  }

  &__host-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__host-notes-indicator {
    font-size: 10px;
    flex-shrink: 0;
    opacity: 0.5;
    line-height: 1;
  }

  // ===== 本地终端列表 =====
  &__terminal-list {
    padding: 0 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;

    :deep(.el-dropdown) {
      display: block;
      width: 100%;
    }
  }

  &__terminal-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: background-color 0.15s;
    position: relative;

    &--root {
      padding-left: 28px;
    }

    &:hover {
      background-color: var(--bg-hover);
    }

    &--drop-before {
      box-shadow: inset 0 2px 0 0 var(--accent);
    }

    &--drop-after {
      box-shadow: inset 0 -2px 0 0 var(--accent);
    }
  }

  &__terminal-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__terminal-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
  }

  // ===== 分割线 =====
  &__divider {
    height: 1px;
    background-color: var(--divider);
    margin: 8px 0 0;
  }

  // ===== 功能折叠行 =====
  &__collapse-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    transition: background-color 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__collapse-label {
    flex: 1;
  }

  &__collapse-badge {
    font-size: 11px;
    color: var(--text-tertiary);
    background-color: var(--bg-hover);
    padding: 0 5px;
    border-radius: 8px;
  }

  &__collapse-arrow {
    color: var(--text-tertiary);
    flex-shrink: 0;
    transition: transform 0.15s;

    &--open {
      transform: rotate(90deg);
    }
  }

  // ===== 空状态 =====
  &__empty {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--text-tertiary);
    text-align: center;
  }

  // ===== 脉冲动画 =====
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  // ===== 宽度拖拽手柄 =====
  &__resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    width: 4px;
    height: 100%;
    cursor: col-resize;
    z-index: 10;

    &:hover {
      background-color: var(--accent);
      opacity: 0.4;
    }
  }
}
</style>

<style lang="scss">
/* 右键菜单样式（全局，popper 挂载在 body） */
.sidebar-context-menu.el-dropdown__popper {
  border-radius: 10px;
  padding: 4px;
  min-width: 140px;
  backdrop-filter: blur(20px) saturate(1.4);

  .el-popper__arrow {
    display: none;
  }

  .el-dropdown-menu {
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
  }

  .el-dropdown-menu__item {
    font-size: 12px;
    padding: 6px 16px;
    border-radius: 6px;
    line-height: 1.5;
    margin: 1px 0;
    transition: all 0.12s ease;
  }
}

/* 暗色主题 */
html[data-theme="dark"] .sidebar-context-menu.el-dropdown__popper {
  background: #1c1d32;
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 16px 40px -4px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);

  .el-dropdown-menu__item {
    color: #c8c9d6;

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus {
      background: rgba(99, 102, 241, 0.12);
      color: #fff;
    }

    &.is-disabled {
      color: #3d3e54;
    }

    &.el-dropdown-menu__item--divided {
      border-top-color: rgba(255, 255, 255, 0.06);
      margin-top: 4px;
    }

    &.ctx-menu-danger {
      color: #f87171;

      &:not(.is-disabled):hover,
      &:not(.is-disabled):focus {
        background: rgba(239, 68, 68, 0.12);
        color: #ef4444;
      }
    }
  }
}

/* 亮色主题 */
html[data-theme="light"] .sidebar-context-menu.el-dropdown__popper {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.08),
    0 16px 40px -4px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);

  .el-dropdown-menu__item {
    color: #374151;

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus {
      background: rgba(99, 102, 241, 0.08);
      color: #1a1b2e;
    }

    &.is-disabled {
      color: #c0c4cc;
    }

    &.el-dropdown-menu__item--divided {
      border-top-color: rgba(0, 0, 0, 0.06);
      margin-top: 4px;
    }

    &.ctx-menu-danger {
      color: #ef4444;

      &:not(.is-disabled):hover,
      &:not(.is-disabled):focus {
        background: rgba(239, 68, 68, 0.08);
        color: #dc2626;
      }
    }
  }
}
</style>
