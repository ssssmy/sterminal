<template>
  <!-- 应用侧边栏：包含主机树、本地终端、功能折叠区 -->
  <aside
    class="app-sidebar"
    :style="{ width: `${props.width}px` }"
  >
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
        <el-tooltip content="设置" placement="bottom">
          <button class="app-sidebar__icon-btn" @click="router.push('/settings')">
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
    <div class="app-sidebar__body">

      <!-- ===== 主机区域 ===== -->
      <div class="app-sidebar__section">
        <!-- 区域标题 -->
        <div class="app-sidebar__section-header">
          <el-icon :size="13" class="app-sidebar__section-icon"><Monitor /></el-icon>
          <span class="app-sidebar__section-title">主机</span>
          <el-tooltip content="新增主机" placement="right">
            <button class="app-sidebar__add-btn" @click="uiStore.openHostConfigDialog()">
              <el-icon :size="13"><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <!-- 主机分组树 -->
        <div class="app-sidebar__host-tree">
          <template v-for="group in filteredGroups" :key="group.id">
            <!-- 分组行 -->
            <div
              class="app-sidebar__group-row"
              @click="toggleGroup(group.id)"
            >
              <el-icon :size="11" class="app-sidebar__arrow" :class="{ 'app-sidebar__arrow--expanded': !collapsedGroups.has(group.id) }">
                <ArrowRight />
              </el-icon>
              <span class="app-sidebar__group-name">{{ group.name }}</span>
              <span class="app-sidebar__group-count">{{ getGroupHostCount(group.id) }}</span>
            </div>

            <!-- 分组内主机列表 -->
            <template v-if="!collapsedGroups.has(group.id)">
              <el-dropdown
                v-for="host in getGroupHosts(group.id)"
                :key="host.id"
                trigger="contextmenu"
                popper-class="sidebar-context-menu"
                @command="(cmd: string) => handleHostCmd(cmd, host)"
              >
                <div
                  class="app-sidebar__host-item"
                  :class="{
                    'app-sidebar__host-item--selected': selectedHostId === host.id,
                    'app-sidebar__host-item--connected': isHostConnected(host.id),
                  }"
                  @click="selectHost(host)"
                  @dblclick="connectToHost(host)"
                >
                  <span
                    class="app-sidebar__status-dot"
                    :class="isHostConnected(host.id) ? 'app-sidebar__status-dot--connected' : 'app-sidebar__status-dot--idle'"
                  />
                  <el-icon :size="13" class="app-sidebar__host-icon"><Connection /></el-icon>
                  <div class="app-sidebar__host-info">
                    <span class="app-sidebar__host-name">{{ host.label || host.address }}</span>
                    <span class="app-sidebar__host-addr">{{ host.username ? `${host.username}@${host.address}` : host.address }}</span>
                  </div>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="!isHostConnected(host.id)" command="connect">连接</el-dropdown-item>
                    <el-dropdown-item v-else command="connect">新建连接</el-dropdown-item>
                    <el-dropdown-item command="edit">编辑</el-dropdown-item>
                    <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </template>

          <!-- 未分组主机 -->
          <el-dropdown
            v-for="host in filteredUngroupedHosts"
            :key="host.id"
            trigger="contextmenu"
            popper-class="sidebar-context-menu"
            @command="(cmd: string) => handleHostCmd(cmd, host)"
          >
            <div
              class="app-sidebar__host-item app-sidebar__host-item--root"
              :class="{
                'app-sidebar__host-item--selected': selectedHostId === host.id,
                'app-sidebar__host-item--connected': isHostConnected(host.id),
              }"
              @click="selectHost(host)"
              @dblclick="connectToHost(host)"
            >
              <span
                class="app-sidebar__status-dot"
                :class="isHostConnected(host.id) ? 'app-sidebar__status-dot--connected' : 'app-sidebar__status-dot--idle'"
              />
              <el-icon :size="13" class="app-sidebar__host-icon"><Connection /></el-icon>
              <div class="app-sidebar__host-info">
                <span class="app-sidebar__host-name">{{ host.label || host.address }}</span>
                <span class="app-sidebar__host-addr">{{ host.username ? `${host.username}@${host.address}` : host.address }}</span>
              </div>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="!isHostConnected(host.id)" command="connect">连接</el-dropdown-item>
                <el-dropdown-item v-else command="connect">新建连接</el-dropdown-item>
                <el-dropdown-item command="edit">编辑</el-dropdown-item>
                <el-dropdown-item class="ctx-menu-danger" command="delete" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 空状态 -->
          <div v-if="filteredGroups.length === 0 && filteredUngroupedHosts.length === 0" class="app-sidebar__empty">
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
          <el-tooltip content="新建终端配置" placement="right">
            <button class="app-sidebar__add-btn" @click="uiStore.openTerminalConfigDialog()">
              <el-icon :size="13"><Plus /></el-icon>
            </button>
          </el-tooltip>
        </div>

        <!-- 终端配置列表 -->
        <div class="app-sidebar__terminal-list">
          <el-dropdown
            v-for="terminal in filteredTerminals"
            :key="terminal.id"
            trigger="contextmenu"
            popper-class="sidebar-context-menu"
            @command="(cmd: string) => handleTerminalCmd(cmd, terminal)"
          >
            <div
              class="app-sidebar__terminal-item"
              @click="openLocalTerminal(terminal)"
            >
              <el-icon :size="14" class="app-sidebar__terminal-icon"><Cpu /></el-icon>
              <div class="app-sidebar__terminal-info">
                <span class="app-sidebar__terminal-name">{{ terminal.name }}</span>
                <span class="app-sidebar__terminal-path">{{ terminal.cwd || terminal.shell || '默认 Shell' }}</span>
              </div>
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

          <!-- 空状态 -->
          <div v-if="filteredTerminals.length === 0" class="app-sidebar__empty">
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
        <span class="app-sidebar__collapse-badge">12</span>
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
        <span class="app-sidebar__collapse-badge">3</span>
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
        <span class="app-sidebar__collapse-badge">5</span>
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
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  Monitor, Plus, Search, Setting, Refresh,
  Connection, Cpu, DocumentCopy, Share, Lock, ArrowRight,
} from '@element-plus/icons-vue'
import { useUiStore } from '../../stores/ui.store'
import { useHostsStore } from '../../stores/hosts.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { useAuthStore } from '../../stores/auth.store'
import type { Host } from '@shared/types/host'
import type { LocalTerminalConfig } from '@shared/types/terminal'

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

// ===== 功能区折叠状态 =====
const collapsedSections = reactive<Set<string>>(new Set())

function toggleCollapse(section: string): void {
  if (collapsedSections.has(section)) {
    collapsedSections.delete(section)
  } else {
    collapsedSections.add(section)
  }
}

// ===== 选中的主机 =====
const selectedHostId = ref<string | null>(null)

function selectHost(host: Host): void {
  selectedHostId.value = host.id
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
  const ungrouped = hostsStore.hosts.filter(h => !h.groupId)
  if (!q) return ungrouped
  return ungrouped.filter(h => matchesHost(h, q))
})

const filteredTerminals = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return terminalsStore.terminals
  return terminalsStore.terminals.filter(t =>
    t.name.toLowerCase().includes(q) ||
    (t.cwd || '').toLowerCase().includes(q)
  )
})

function matchesHost(host: Host, q: string): boolean {
  return (
    (host.label || '').toLowerCase().includes(q) ||
    host.address.toLowerCase().includes(q) ||
    (host.username || '').toLowerCase().includes(q)
  )
}

function getGroupHosts(groupId: string): Host[] {
  const q = searchQuery.value.trim().toLowerCase()
  const hosts = hostsStore.hosts.filter(h => h.groupId === groupId)
  if (!q) return hosts
  return hosts.filter(h => matchesHost(h, q))
}

function getGroupHostCount(groupId: string): number {
  return hostsStore.hosts.filter(h => h.groupId === groupId).length
}

// ===== 连接状态判断 =====
function isHostConnected(hostId: string): boolean {
  return sessionsStore.connectedHostIds.has(hostId)
}

// ===== 主机操作 =====
function connectToHost(host: Host): void {
  sessionsStore.createTab(host.label || host.address, 'ssh', host.id)
  emit('resize', props.width)
}

function handleHostCmd(cmd: string, host: Host): void {
  if (cmd === 'connect') {
    connectToHost(host)
  } else if (cmd === 'edit') {
    uiStore.openHostConfigDialog(host.id)
  } else if (cmd === 'delete') {
    hostsStore.deleteHost(host.id)
  }
}

// ===== 本地终端操作 =====
function openLocalTerminal(terminal: LocalTerminalConfig): void {
  sessionsStore.createTab(terminal.name, 'local', terminal.id)
}

function handleTerminalCmd(cmd: string, terminal: LocalTerminalConfig): void {
  if (cmd === 'open') {
    openLocalTerminal(terminal)
  } else if (cmd === 'edit') {
    uiStore.openTerminalConfigDialog(terminal.id)
  } else if (cmd === 'duplicate') {
    terminalsStore.createTerminal({
      ...terminal,
      id: undefined as unknown as string,
      name: `${terminal.name} 副本`,
      isDefault: false,
    })
  } else if (cmd === 'delete') {
    terminalsStore.deleteTerminal(terminal.id)
  }
}

// ===== 同步 =====
function handleSync(): void {
  // TODO: 触发云同步
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

// ===== 初始化 =====
onMounted(async () => {
  // 主机数据由 WorkspaceView 统一加载，此处仅注入模拟数据（开发用）
  if (hostsStore.hosts.length === 0) {
    injectMockData()
  }
})

/**
 * 注入模拟数据，用于 UI 验证（开发阶段）
 * 生产环境将由数据库驱动
 */
function injectMockData(): void {
  // 注入分组（直接操作 store 的内部数组，避免 IPC 调用）
  hostsStore.groups.push(
    { id: 'g1', name: '生产服务器', sortOrder: 0, collapsed: false },
    { id: 'g2', name: '开发环境', sortOrder: 1, collapsed: false },
  )

  hostsStore.hosts.push(
    {
      id: 'h1', label: 'Web 服务器', address: '192.168.1.100', port: 22,
      protocol: 'ssh', username: 'root', authType: 'key',
      encoding: 'utf-8', keepaliveInterval: 60, connectTimeout: 10,
      heartbeatTimeout: 30, compression: false, strictHostKey: false,
      sshVersion: 'auto', sortOrder: 0, tagIds: [], connectCount: 5,
      groupId: 'g1', lastConnected: '2026-03-01',
    },
    {
      id: 'h2', label: 'DB 主库', address: '192.168.1.101', port: 22,
      protocol: 'ssh', username: 'admin', authType: 'password',
      encoding: 'utf-8', keepaliveInterval: 60, connectTimeout: 10,
      heartbeatTimeout: 30, compression: false, strictHostKey: false,
      sshVersion: 'auto', sortOrder: 1, tagIds: [], connectCount: 2,
      groupId: 'g1',
    },
    {
      id: 'h3', label: '开发机 A', address: '10.0.0.50', port: 22,
      protocol: 'ssh', username: 'dev', authType: 'key',
      encoding: 'utf-8', keepaliveInterval: 60, connectTimeout: 10,
      heartbeatTimeout: 30, compression: false, strictHostKey: false,
      sshVersion: 'auto', sortOrder: 0, tagIds: [], connectCount: 10,
      groupId: 'g2', lastConnected: '2026-03-18',
    },
    {
      id: 'h4', label: '测试服务器', address: '10.0.0.51', port: 2222,
      protocol: 'ssh', username: 'test', authType: 'password',
      encoding: 'utf-8', keepaliveInterval: 60, connectTimeout: 10,
      heartbeatTimeout: 30, compression: false, strictHostKey: false,
      sshVersion: 'auto', sortOrder: 1, tagIds: [], connectCount: 1,
      groupId: 'g2',
    },
    {
      id: 'h5', label: '跳板机', address: 'jump.example.com', port: 22,
      protocol: 'ssh', username: 'user', authType: 'key',
      encoding: 'utf-8', keepaliveInterval: 30, connectTimeout: 15,
      heartbeatTimeout: 30, compression: true, strictHostKey: true,
      sshVersion: 'auto', sortOrder: 0, tagIds: [], connectCount: 0,
    },
  )

  terminalsStore.terminals.push(
    {
      id: 't1', name: '默认终端', shell: '/bin/zsh',
      cwd: '~', scriptLineDelay: 0, loginShell: true,
      sortOrder: 0, isDefault: true,
    },
    {
      id: 't2', name: 'Bash', shell: '/bin/bash',
      cwd: '/tmp', scriptLineDelay: 0, loginShell: false,
      sortOrder: 1, isDefault: false,
    },
    {
      id: 't3', name: '项目根目录', shell: '/bin/zsh',
      cwd: '~/workspace/sterminal', scriptLineDelay: 0, loginShell: true,
      sortOrder: 2, isDefault: false,
    },
  )
}
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

    // el-dropdown 默认 inline-flex，需撑满宽度
    :deep(.el-dropdown) {
      display: block;
      width: 100%;
    }
  }

  &__group-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px 5px 12px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    transition: background-color 0.15s;

    &:hover {
      background-color: var(--bg-hover);
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

  &__group-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__group-count {
    font-size: 11px;
    color: var(--text-tertiary);
    background-color: var(--bg-hover);
    padding: 0 5px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  // 主机条目
  &__host-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px 5px 28px;   // 子级缩进
    border-radius: 5px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    transition: background-color 0.15s;
    position: relative;

    &--root {
      padding-left: 12px;  // 根级（未分组）无缩进
    }

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &--selected {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &--connected {
      .app-sidebar__host-icon {
        color: var(--success);
      }
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

    &--online {
      background-color: var(--success);
    }

    &--offline {
      background-color: var(--text-tertiary);
    }
  }

  &__host-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__host-info {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  &__host-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-primary);
  }

  &__host-addr {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  // ===== 本地终端列表 =====
  &__terminal-list {
    padding: 0 4px;

    :deep(.el-dropdown) {
      display: block;
      width: 100%;
    }
  }

  &__terminal-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 8px 5px 12px;
    border-radius: 5px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    transition: background-color 0.15s;
    position: relative;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__terminal-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  &__terminal-info {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  &__terminal-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: var(--text-primary);
  }

  &__terminal-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--text-tertiary);
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
/* 右键菜单暗色主题（全局，popper 挂载在 body） */
.sidebar-context-menu.el-dropdown__popper {
  background: #1c1d32;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 16px 40px -4px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
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
    color: #c8c9d6;
    font-size: 12px;
    padding: 6px 16px;
    border-radius: 6px;
    line-height: 1.5;
    margin: 1px 0;
    transition: all 0.12s ease;

    &:not(.is-disabled):hover,
    &:not(.is-disabled):focus {
      background: rgba(99, 102, 241, 0.12);
      color: #fff;
    }

    &.is-disabled {
      color: #3d3e54;
    }

    /* 分割线 */
    &.el-dropdown-menu__item--divided {
      border-top-color: rgba(255, 255, 255, 0.06);
      margin-top: 4px;
    }

    /* 删除按钮 - 红色 */
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
</style>
