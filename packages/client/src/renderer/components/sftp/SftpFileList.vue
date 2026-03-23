<template>
  <div
    class="sftp-file-list"
    tabindex="0"
    @keydown="handleKeydown"
    @click.self="clearSelection"
    @contextmenu.prevent="handleBackgroundContextMenu"
  >
    <!-- 加载遮罩 -->
    <div v-if="loading" class="sftp-file-list__loading">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>

    <!-- 空状态 -->
    <div v-else-if="visibleFiles.length === 0" class="sftp-file-list__empty">
      {{ t('common.empty') }}
    </div>

    <!-- 文件列表表格 -->
    <template v-else>
      <!-- 表头 -->
      <div class="sftp-file-list__header">
        <div
          class="sftp-file-list__col sftp-file-list__col--name"
          @click="setSort('name')"
        >
          {{ t('sftp.fileName') }}
          <span v-if="sortBy === 'name'" class="sftp-file-list__sort-icon">
            {{ sortDir === 'asc' ? '↑' : '↓' }}
          </span>
        </div>
        <div
          class="sftp-file-list__col sftp-file-list__col--size"
          @click="setSort('size')"
        >
          {{ t('sftp.fileSize') }}
          <span v-if="sortBy === 'size'" class="sftp-file-list__sort-icon">
            {{ sortDir === 'asc' ? '↑' : '↓' }}
          </span>
        </div>
        <div
          class="sftp-file-list__col sftp-file-list__col--time"
          @click="setSort('time')"
        >
          {{ t('sftp.modifiedTime') }}
          <span v-if="sortBy === 'time'" class="sftp-file-list__sort-icon">
            {{ sortDir === 'asc' ? '↑' : '↓' }}
          </span>
        </div>
        <div
          v-if="side === 'remote'"
          class="sftp-file-list__col sftp-file-list__col--perm"
        >
          {{ t('sftp.permissions') }}
        </div>
      </div>

      <!-- 文件行 -->
      <div class="sftp-file-list__body">
        <!-- 上级目录 -->
        <div
          v-if="showParentDir"
          class="sftp-file-list__row"
          @dblclick="emit('navigate-up')"
        >
          <div class="sftp-file-list__col sftp-file-list__col--name">
            <el-icon :size="14" class="sftp-file-list__icon sftp-file-list__icon--dir">
              <FolderOpened />
            </el-icon>
            <span class="sftp-file-list__name">..</span>
          </div>
          <div class="sftp-file-list__col sftp-file-list__col--size">—</div>
          <div class="sftp-file-list__col sftp-file-list__col--time">—</div>
          <div v-if="side === 'remote'" class="sftp-file-list__col sftp-file-list__col--perm">—</div>
        </div>

        <div
          v-for="file in sortedFiles"
          :key="file.path"
          class="sftp-file-list__row"
          :class="{
            'sftp-file-list__row--selected': selectedPaths.has(file.path),
            'sftp-file-list__row--dir': file.isDirectory,
          }"
          @click.exact="handleClick(file, $event)"
          @click.meta="handleMetaClick(file)"
          @click.ctrl="handleMetaClick(file)"
          @dblclick="handleDblClick(file)"
          @contextmenu.prevent="handleContextMenu(file, $event)"
        >
          <div class="sftp-file-list__col sftp-file-list__col--name">
            <el-icon :size="14" class="sftp-file-list__icon" :class="getIconClass(file)">
              <component :is="getFileIcon(file)" />
            </el-icon>
            <span
              v-if="renamingPath !== file.path"
              class="sftp-file-list__name"
              :title="file.name"
            >{{ file.name }}</span>
            <input
              v-else
              ref="renameInputRef"
              v-model="renameValue"
              class="sftp-file-list__rename-input"
              @keyup.enter="commitRename(file)"
              @keyup.escape="cancelRename"
              @blur="cancelRename"
              @click.stop
            />
          </div>
          <div class="sftp-file-list__col sftp-file-list__col--size">
            {{ file.isDirectory ? '—' : formatSize(file.size) }}
          </div>
          <div class="sftp-file-list__col sftp-file-list__col--time">
            {{ formatDate(file.modifiedTime) }}
          </div>
          <div v-if="side === 'remote'" class="sftp-file-list__col sftp-file-list__col--perm">
            <span class="sftp-file-list__perm">{{ file.permissions }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 右键菜单 -->
    <teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="sftp-context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
        <template v-if="contextMenu.file">
          <div
            v-if="side === 'remote'"
            class="sftp-context-menu__item"
            @click="handleMenuDownload"
          >
            <el-icon><Download /></el-icon>
            {{ t('sftp.download') }}
          </div>
          <div
            v-if="side === 'local'"
            class="sftp-context-menu__item"
            @click="handleMenuUpload"
          >
            <el-icon><Upload /></el-icon>
            {{ t('sftp.upload') }}
          </div>
          <div class="sftp-context-menu__item" @click="handleMenuRename">
            <el-icon><Edit /></el-icon>
            {{ t('sftp.rename') }}
          </div>
          <div class="sftp-context-menu__divider" />
          <div class="sftp-context-menu__item sftp-context-menu__item--danger" @click="handleMenuDelete">
            <el-icon><Delete /></el-icon>
            {{ t('sftp.delete') }}
          </div>
          <div class="sftp-context-menu__divider" />
          <div class="sftp-context-menu__item" @click="handleMenuCopyPath">
            <el-icon><CopyDocument /></el-icon>
            {{ t('sftp.copyPath') }}
          </div>
        </template>
        <template v-else>
          <div class="sftp-context-menu__item" @click="emit('mkdir'); hideContextMenu()">
            <el-icon><FolderAdd /></el-icon>
            {{ t('sftp.newFolder') }}
          </div>
          <div class="sftp-context-menu__item" @click="emit('refresh'); hideContextMenu()">
            <el-icon><Refresh /></el-icon>
            {{ t('sftp.refresh') }}
          </div>
          <template v-if="selectedPaths.size > 0">
            <div class="sftp-context-menu__divider" />
            <div class="sftp-context-menu__item sftp-context-menu__item--danger" @click="handleMenuDeleteSelected">
              <el-icon><Delete /></el-icon>
              {{ t('sftp.delete') }} ({{ selectedPaths.size }})
            </div>
          </template>
        </template>
      </div>
      <div
        v-if="contextMenu.visible"
        class="sftp-context-menu__backdrop"
        @click="hideContextMenu"
        @contextmenu.prevent="hideContextMenu"
      />
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Folder,
  FolderOpened,
  Document,
  Link,
  Loading,
  Download,
  Upload,
  Edit,
  Delete,
  CopyDocument,
  FolderAdd,
  Refresh,
} from '@element-plus/icons-vue'
import type { SftpFileInfo } from '@shared/types/sftp'

const props = defineProps<{
  files: SftpFileInfo[]
  side: 'local' | 'remote'
  loading?: boolean
  showHidden?: boolean
  currentPath: string
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
  (e: 'navigate-up'): void
  (e: 'open-file', file: SftpFileInfo): void
  (e: 'upload', paths: string[]): void
  (e: 'download', paths: string[]): void
  (e: 'delete', paths: string[]): void
  (e: 'rename', oldPath: string, newName: string): void
  (e: 'mkdir'): void
  (e: 'refresh'): void
  (e: 'selection-change', paths: string[]): void
}>()

const { t } = useI18n()

// ===== 选择状态 =====
const selectedPaths = ref<Set<string>>(new Set())
const lastSelectedPath = ref<string | null>(null)

// ===== 排序 =====
const sortBy = ref<'name' | 'size' | 'time'>('name')
const sortDir = ref<'asc' | 'desc'>('asc')

// ===== 重命名 =====
const renamingPath = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

// ===== 右键菜单 =====
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  file: null as SftpFileInfo | null,
})

// ===== 计算属性 =====

const showParentDir = computed(() => {
  const p = props.currentPath
  return p && p !== '/' && p !== ''
})

const visibleFiles = computed(() => {
  if (props.showHidden) return props.files
  return props.files.filter(f => !f.name.startsWith('.'))
})

const sortedFiles = computed(() => {
  const files = [...visibleFiles.value]
  // 目录始终排在前面
  files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    let cmp = 0
    if (sortBy.value === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    } else if (sortBy.value === 'size') {
      cmp = a.size - b.size
    } else {
      cmp = new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime()
    }
    return sortDir.value === 'asc' ? cmp : -cmp
  })
  return files
})

// ===== 工具函数 =====

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays < 180) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

function getFileIcon(file: SftpFileInfo) {
  if (file.isSymlink) return Link
  if (file.isDirectory) return Folder
  return Document
}

function getIconClass(file: SftpFileInfo) {
  if (file.isDirectory) return 'sftp-file-list__icon--dir'
  if (file.isSymlink) return 'sftp-file-list__icon--link'
  return 'sftp-file-list__icon--file'
}

function setSort(field: 'name' | 'size' | 'time'): void {
  if (sortBy.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = field
    sortDir.value = 'asc'
  }
}

// ===== 点击/选择处理 =====

function handleClick(file: SftpFileInfo, event: MouseEvent): void {
  if (event.shiftKey && lastSelectedPath.value) {
    // Shift+Click: 范围选择
    const allFiles = sortedFiles.value
    const lastIdx = allFiles.findIndex(f => f.path === lastSelectedPath.value)
    const curIdx = allFiles.findIndex(f => f.path === file.path)
    if (lastIdx !== -1 && curIdx !== -1) {
      const [from, to] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx]
      selectedPaths.value = new Set(allFiles.slice(from, to + 1).map(f => f.path))
    }
  } else {
    selectedPaths.value = new Set([file.path])
    lastSelectedPath.value = file.path
  }
  emitSelectionChange()
}

function handleMetaClick(file: SftpFileInfo): void {
  if (selectedPaths.value.has(file.path)) {
    selectedPaths.value.delete(file.path)
  } else {
    selectedPaths.value.add(file.path)
  }
  lastSelectedPath.value = file.path
  emitSelectionChange()
}

function handleDblClick(file: SftpFileInfo): void {
  if (file.isDirectory) {
    emit('navigate', file.path)
  } else {
    emit('open-file', file)
  }
}

function clearSelection(): void {
  selectedPaths.value.clear()
  lastSelectedPath.value = null
  emitSelectionChange()
}

function emitSelectionChange(): void {
  emit('selection-change', Array.from(selectedPaths.value))
}

// ===== 键盘处理 =====

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') clearSelection()
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedPaths.value.size > 0) {
      emit('delete', Array.from(selectedPaths.value))
    }
  }
}

// ===== 右键菜单 =====

function handleContextMenu(file: SftpFileInfo, event: MouseEvent): void {
  // 右键的文件不在已选中列表 → 清除之前的选择，只选当前文件
  if (!selectedPaths.value.has(file.path)) {
    selectedPaths.value.clear()
    selectedPaths.value.add(file.path)
    emitSelectionChange()
  }
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - 180),
    y: Math.min(event.clientY, window.innerHeight - 200),
    file,
  }
}

function handleBackgroundContextMenu(event: MouseEvent): void {
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - 180),
    y: Math.min(event.clientY, window.innerHeight - 100),
    file: null,
  }
}

function hideContextMenu(): void {
  contextMenu.value.visible = false
}

function handleMenuDownload(): void {
  const paths = contextMenu.value.file
    ? Array.from(selectedPaths.value)
    : []
  emit('download', paths)
  hideContextMenu()
}

function handleMenuUpload(): void {
  const paths = contextMenu.value.file
    ? Array.from(selectedPaths.value)
    : []
  emit('upload', paths)
  hideContextMenu()
}

function handleMenuRename(): void {
  const file = contextMenu.value.file
  if (!file) return
  hideContextMenu()
  renamingPath.value = file.path
  renameValue.value = file.name
  nextTick(() => renameInputRef.value?.select())
}

function commitRename(file: SftpFileInfo): void {
  const newName = renameValue.value.trim()
  if (newName && newName !== file.name) {
    emit('rename', file.path, newName)
  }
  renamingPath.value = null
}

function cancelRename(): void {
  renamingPath.value = null
}

function handleMenuDelete(): void {
  const paths = Array.from(selectedPaths.value)
  emit('delete', paths)
  hideContextMenu()
}

function handleMenuDeleteSelected(): void {
  const paths = Array.from(selectedPaths.value)
  if (paths.length > 0) emit('delete', paths)
  hideContextMenu()
}

function handleMenuCopyPath(): void {
  const file = contextMenu.value.file
  if (file) {
    navigator.clipboard.writeText(file.path).catch(() => {})
  }
  hideContextMenu()
}

// 点击外部关闭菜单
function onDocumentClick(): void {
  if (contextMenu.value.visible) hideContextMenu()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<style lang="scss" scoped>
.sftp-file-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  outline: none;
  position: relative;
  background-color: var(--bg-primary);

  &__loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    font-size: 24px;
  }

  &__empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-tertiary);
    font-size: 13px;
  }

  // ===== 表头 =====
  &__header {
    display: flex;
    align-items: center;
    height: 28px;
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
  }

  // ===== 列 =====
  &__col {
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    &--name {
      flex: 1;
      min-width: 0;
      gap: 6px;
      cursor: pointer;
      color: var(--text-secondary);

      &:hover {
        color: var(--text-primary);
      }
    }

    &--size {
      width: 80px;
      flex-shrink: 0;
      cursor: pointer;
      color: var(--text-secondary);
      justify-content: flex-end;

      &:hover {
        color: var(--text-primary);
      }
    }

    &--time {
      width: 130px;
      flex-shrink: 0;
      cursor: pointer;
      color: var(--text-secondary);

      &:hover {
        color: var(--text-primary);
      }
    }

    &--perm {
      width: 90px;
      flex-shrink: 0;
      color: var(--text-secondary);
    }
  }

  &__sort-icon {
    margin-left: 3px;
    color: var(--accent);
  }

  // ===== 列表体 =====
  &__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;

    &::-webkit-scrollbar {
      width: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background-color: var(--border);
      border-radius: 3px;
    }
  }

  // ===== 文件行 =====
  &__row {
    display: flex;
    align-items: center;
    height: 28px;
    cursor: pointer;
    border-bottom: 1px solid transparent;
    transition: background-color 0.1s;

    &:hover {
      background-color: var(--bg-hover);
    }

    &--selected {
      background-color: var(--accent-light, rgba(99, 102, 241, 0.12));

      &:hover {
        background-color: var(--accent-light, rgba(99, 102, 241, 0.18));
      }
    }

    &--dir {
      font-weight: 500;
    }
  }

  &__icon {
    flex-shrink: 0;

    &--dir {
      color: var(--warning, #f59e0b);
    }

    &--file {
      color: var(--text-tertiary);
    }

    &--link {
      color: var(--info, #3b82f6);
    }
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--text-primary);
  }

  &__rename-input {
    flex: 1;
    min-width: 0;
    height: 20px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 0 4px;
    outline: none;
  }

  &__perm {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--text-tertiary);
  }
}

</style>

<style lang="scss">
.sftp-context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  border-radius: 10px;
  padding: 4px;
  backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 16px 40px -4px rgba(0, 0, 0, 0.5);

  &__backdrop {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    font-size: 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s;
    margin: 1px 0;

    &--danger {
      color: #f87171;
    }
  }

  &__divider {
    height: 1px;
    margin: 4px 8px;
  }
}

html[data-theme="dark"] .sftp-context-menu {
  background: #1c1d32;
  border: 1px solid rgba(255, 255, 255, 0.06);

  .sftp-context-menu__item {
    color: #c8c9d6;
    &:hover { background: rgba(99, 102, 241, 0.12); color: #fff; }
    &--danger { color: #f87171; &:hover { background: rgba(239, 68, 68, 0.12); color: #ef4444; } }
  }
  .sftp-context-menu__divider { background: rgba(255, 255, 255, 0.06); }
}

html[data-theme="light"] .sftp-context-menu {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.08);

  .sftp-context-menu__item {
    color: #374151;
    &:hover { background: rgba(99, 102, 241, 0.08); color: #1a1b2e; }
    &--danger { color: #ef4444; &:hover { background: rgba(239, 68, 68, 0.08); color: #dc2626; } }
  }
  .sftp-context-menu__divider { background: rgba(0, 0, 0, 0.06); }
}
</style>
