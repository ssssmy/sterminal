<template>
  <div class="sftp-panel">
    <!-- 错误提示 -->
    <div v-if="sessionState?.error && !sessionState.sftpId" class="sftp-panel__error">
      <el-icon><Warning /></el-icon>
      {{ sessionState.error }}
      <el-button size="small" type="primary" @click="reconnect">{{ t('sftp.reconnect') }}</el-button>
    </div>

    <!-- 初始化加载 -->
    <div v-else-if="!sessionState || !sessionState.sftpId" class="sftp-panel__init">
      <el-icon class="is-loading"><Loading /></el-icon>
      {{ t('sftp.connecting') }}
    </div>

    <!-- 主体 -->
    <template v-else>
      <!-- 工具栏 -->
      <SftpToolbar
        :selected-local="selectedLocalPaths"
        :selected-remote="selectedRemotePaths"
        :show-hidden="sessionState.showHidden"
        :view-mode="sessionState.viewMode"
        @upload="handleUpload"
        @download="handleDownload"
        @mkdir="handleMkdir"
        @refresh="handleRefreshAll"
        @toggle-hidden="sftpStore.toggleShowHidden(tab.id)"
        @set-view-mode="sftpStore.setViewMode(tab.id, $event)"
      />

      <!-- 双栏文件区域 -->
      <div ref="splitContainerRef" class="sftp-panel__split">
        <!-- 本地栏 -->
        <div class="sftp-panel__pane" :style="{ width: leftWidth + 'px' }">
          <div class="sftp-panel__pane-header">
            <span class="sftp-panel__pane-title">{{ t('sftp.local') }}</span>
          </div>
          <SftpPathBar
            :path="sessionState.localCwd"
            @navigate="(path) => sftpStore.navigateLocal(tab.id, path)"
          />
          <SftpFileList
            :files="sessionState.localFiles"
            side="local"
            :loading="sessionState.localLoading"
            :show-hidden="sessionState.showHidden"
            :current-path="sessionState.localCwd"
            @navigate="(path) => sftpStore.navigateLocal(tab.id, path)"
            @navigate-up="navigateLocalUp"
            @open-file="handleOpenLocalFile"
            @upload="handleUploadPaths"
            @download="handleDownload"
            @delete="handleDeleteLocal"
            @rename="handleRenameLocal"
            @mkdir="handleMkdir"
            @refresh="sftpStore.refreshLocal(tab.id)"
            @selection-change="selectedLocalPaths = $event"
          />
        </div>

        <!-- 拖拽分隔线 -->
        <div
          ref="dividerRef"
          class="sftp-panel__divider"
          @mousedown="startDrag"
        />

        <!-- 远程栏 -->
        <div
          class="sftp-panel__pane sftp-panel__pane--remote"
          :class="{ 'sftp-panel__pane--dragover': isDragOver }"
          @dragover.prevent="handleDragOver"
          @dragleave="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div v-if="isDragOver" class="sftp-panel__drag-overlay">
            {{ t('sftp.dropToUpload') }}
          </div>
          <div class="sftp-panel__pane-header">
            <span class="sftp-panel__pane-title">{{ t('sftp.remote') }}</span>
            <span class="sftp-panel__pane-label">{{ tab.sftpMeta?.hostLabel }}</span>
          </div>
          <SftpPathBar
            :path="sessionState.remoteCwd"
            @navigate="(path) => sftpStore.navigateRemote(tab.id, path)"
          />
          <SftpFileList
            :files="sessionState.remoteFiles"
            side="remote"
            :loading="sessionState.remoteLoading"
            :show-hidden="sessionState.showHidden"
            :current-path="sessionState.remoteCwd"
            @navigate="(path) => sftpStore.navigateRemote(tab.id, path)"
            @navigate-up="navigateRemoteUp"
            @open-file="handleOpenRemoteFile"
            @upload="handleUpload"
            @download="handleDownloadPaths"
            @delete="handleDeleteRemote"
            @rename="(oldPath, newName) => sftpStore.renameRemote(tab.id, oldPath, newName)"
            @mkdir="handleMkdir"
            @refresh="sftpStore.refreshRemote(tab.id)"
            @selection-change="selectedRemotePaths = $event"
          />
        </div>
      </div>

      <!-- 传输队列 -->
      <SftpTransferQueue
        :transfers="sftpStore.transfers"
        @cancel="sftpStore.cancelTransfer"
        @clear-completed="sftpStore.clearCompletedTransfers"
      />
    </template>

    <!-- 文件编辑器 -->
    <SftpFileEditor
      v-if="editorState.visible"
      v-model="editorState.visible"
      :tab-id="tab.id"
      :file-path="editorState.filePath"
      :file-size="editorState.fileSize"
      ref="editorRef"
      @save="handleEditorSave"
    />

    <!-- 新建文件夹对话框 -->
    <el-dialog
      v-model="mkdirDialogVisible"
      :title="t('sftp.newFolder')"
      width="360px"
    >
      <el-input
        v-model="mkdirName"
        :placeholder="t('sftp.folderNamePlaceholder')"
        @keyup.enter="confirmMkdir"
        autofocus
      />
      <template #footer>
        <el-button @click="mkdirDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmMkdir">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Warning, Loading } from '@element-plus/icons-vue'
import type { TabSession } from '@shared/types/terminal'
import type { SftpFileInfo } from '@shared/types/sftp'
import { useSftpStore } from '../../stores/sftp.store'
import SftpToolbar from './SftpToolbar.vue'
import SftpPathBar from './SftpPathBar.vue'
import SftpFileList from './SftpFileList.vue'
import SftpTransferQueue from './SftpTransferQueue.vue'
import SftpFileEditor from './SftpFileEditor.vue'

const props = defineProps<{
  tab: TabSession
}>()

const { t } = useI18n()
const sftpStore = useSftpStore()

const sessionState = computed(() => sftpStore.sessions[props.tab.id])

// ===== 选择状态 =====
const selectedLocalPaths = ref<string[]>([])
const selectedRemotePaths = ref<string[]>([])

// ===== 分割线拖拽 =====
const splitContainerRef = ref<HTMLElement | null>(null)
const dividerRef = ref<HTMLElement | null>(null)
const leftWidth = ref(0)
let isDragging = false
let startX = 0
let startWidth = 0

function startDrag(e: MouseEvent): void {
  isDragging = true
  startX = e.clientX
  startWidth = leftWidth.value
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

function onDrag(e: MouseEvent): void {
  if (!isDragging) return
  const delta = e.clientX - startX
  const containerWidth = splitContainerRef.value?.clientWidth || 800
  const newWidth = Math.min(Math.max(startWidth + delta, 200), containerWidth - 200 - 5)
  leftWidth.value = newWidth
}

function stopDrag(): void {
  isDragging = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// ===== 文件编辑器 =====
const editorRef = ref<InstanceType<typeof SftpFileEditor> | null>(null)
const editorState = ref({
  visible: false,
  filePath: '',
  fileSize: 0,
})

async function handleOpenRemoteFile(file: SftpFileInfo): Promise<void> {
  if (file.isDirectory) return
  if (file.size > 1 * 1024 * 1024) {
    ElMessage.warning(t('sftp.editFileTooLarge'))
    return
  }
  editorState.value = { visible: true, filePath: file.path, fileSize: file.size }
  // 加载内容
  setTimeout(async () => {
    if (!editorRef.value) return
    editorRef.value.setLoading(true)
    try {
      const content = await sftpStore.readRemoteFile(props.tab.id, file.path)
      editorRef.value.setContent(content)
    } catch (err) {
      editorRef.value.setLoadError(err instanceof Error ? err.message : String(err))
    }
  }, 50)
}

function handleOpenLocalFile(_file: SftpFileInfo): void {
  // 本地文件用系统默认程序打开（通过 open:path IPC）
  window.electronAPI?.ipc.invoke('system:open-path', _file.path)
}

async function handleEditorSave(filePath: string, content: string): Promise<void> {
  // '__load__' 是内部用于触发加载的标记，不是真正的保存
  if (filePath === '__load__') return
  try {
    await sftpStore.writeRemoteFile(props.tab.id, filePath, content)
    ElMessage.success(t('sftp.fileSaved'))
    editorState.value.visible = false
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

// ===== 拖拽上传 =====
const isDragOver = ref(false)

function handleDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('Files')) {
    isDragOver.value = true
  }
}

function handleDragLeave(e: DragEvent): void {
  // 只在真正离开远程面板时重置（避免子元素 dragleave 触发）
  const target = e.currentTarget as HTMLElement
  const related = e.relatedTarget as Node | null
  if (!related || !target.contains(related)) {
    isDragOver.value = false
  }
}

function handleDrop(e: DragEvent): void {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files || !files.length) return
  const paths: string[] = []
  for (let i = 0; i < files.length; i++) {
    const p = window.electronAPI?.getPathForFile(files[i]) || ''
    if (p) paths.push(p)
  }
  if (paths.length) handleUploadPaths(paths)
}

// ===== 上传/下载 =====

function handleUpload(): void {
  sftpStore.uploadFiles(props.tab.id, selectedLocalPaths.value)
}

function handleUploadPaths(paths: string[]): void {
  sftpStore.uploadFiles(props.tab.id, paths)
}

function handleDownload(): void {
  sftpStore.downloadFiles(props.tab.id, selectedRemotePaths.value)
}

function handleDownloadPaths(paths: string[]): void {
  sftpStore.downloadFiles(props.tab.id, paths)
}

// ===== 删除 =====

async function handleDeleteRemote(paths: string[]): Promise<void> {
  if (!paths.length) return
  try {
    await ElMessageBox.confirm(
      t('common.deleteConfirm'),
      t('common.delete'),
      { type: 'warning', confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel') }
    )
    await sftpStore.deleteRemote(props.tab.id, paths)
  } catch {
    // 取消
  }
}

async function handleDeleteLocal(_paths: string[]): Promise<void> {
  // 本地删除暂不实现（需要额外的 IPC）
  ElMessage.info(t('sftp.localDeleteNotSupported'))
}

// ===== 重命名 =====

function handleRenameLocal(_oldPath: string, _newName: string): void {
  ElMessage.info(t('sftp.localRenameNotSupported'))
}

// ===== 新建文件夹 =====

const mkdirDialogVisible = ref(false)
const mkdirName = ref('')

function handleMkdir(): void {
  mkdirName.value = ''
  mkdirDialogVisible.value = true
}

async function confirmMkdir(): Promise<void> {
  const name = mkdirName.value.trim()
  if (!name) return
  try {
    await sftpStore.mkdirRemote(props.tab.id, name)
    mkdirDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

// ===== 导航 =====

function navigateLocalUp(): void {
  const state = sessionState.value
  if (!state) return
  const p = state.localCwd
  if (!p || p === '/') return
  const parent = p.substring(0, p.lastIndexOf('/')) || '/'
  sftpStore.navigateLocal(props.tab.id, parent)
}

function navigateRemoteUp(): void {
  const state = sessionState.value
  if (!state) return
  const p = state.remoteCwd
  if (!p || p === '/') return
  const parent = p.substring(0, p.lastIndexOf('/')) || '/'
  sftpStore.navigateRemote(props.tab.id, parent)
}

function handleRefreshAll(): void {
  sftpStore.refreshRemote(props.tab.id)
  sftpStore.refreshLocal(props.tab.id)
}

async function reconnect(): Promise<void> {
  if (!props.tab.sftpMeta) return
  await sftpStore.openSession(props.tab.id, props.tab.sftpMeta.connectionId)
}

// ===== 生命周期 =====

onMounted(async () => {
  // 初始化宽度
  await new Promise(resolve => setTimeout(resolve, 0))
  const containerWidth = splitContainerRef.value?.clientWidth || 800
  leftWidth.value = Math.floor(containerWidth / 2) - 2

  if (!sessionState.value && props.tab.sftpMeta) {
    await sftpStore.openSession(props.tab.id, props.tab.sftpMeta.connectionId)
  }
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  sftpStore.closeSession(props.tab.id)
})
</script>

<style lang="scss" scoped>
.sftp-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-primary);

  &__error {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--error, #ef4444);
    font-size: 14px;
  }

  &__init {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  &__split {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  &__pane {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 200px;
    flex-shrink: 0;

    &--remote {
      flex: 1;
    }
  }

  &__pane-header {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 10px;
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 8px;
  }

  &__pane-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__pane-label {
    font-size: 12px;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__pane--dragover {
    outline: 2px dashed var(--el-color-primary);
    outline-offset: -2px;
    position: relative;
  }

  &__drag-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 15px;
    font-weight: 600;
    pointer-events: none;
  }

  &__divider {
    width: 4px;
    flex-shrink: 0;
    background-color: var(--border);
    cursor: col-resize;
    transition: background-color 0.15s;

    &:hover {
      background-color: var(--accent);
    }
  }
}
</style>
