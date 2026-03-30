<template>
  <Transition name="st-slide">
    <div v-if="visible" class="update-notification" :class="`update-notification--${status.status}`">
      <!-- 有新版本可用 -->
      <template v-if="status.status === 'available'">
        <el-icon :size="16"><Upload /></el-icon>
        <span class="update-notification__text">
          {{ t('update.available', { version: status.version }) }}
        </span>
        <el-button size="small" type="primary" @click="downloadUpdate">
          {{ t('update.download') }}
        </el-button>
        <button class="update-notification__dismiss" @click="dismiss">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </template>

      <!-- 下载中 -->
      <template v-else-if="status.status === 'downloading'">
        <el-icon :size="16" class="is-loading"><Loading /></el-icon>
        <span class="update-notification__text">
          {{ t('update.downloading', { progress: status.progress || 0 }) }}
        </span>
        <el-progress
          :percentage="status.progress || 0"
          :show-text="false"
          :stroke-width="4"
          class="update-notification__progress"
        />
      </template>

      <!-- 下载完成，准备安装 -->
      <template v-else-if="status.status === 'ready'">
        <el-icon :size="16" style="color: var(--success)"><CircleCheck /></el-icon>
        <span class="update-notification__text">
          {{ t('update.ready', { version: status.version }) }}
        </span>
        <el-button size="small" type="primary" @click="installUpdate">
          {{ t('update.installRestart') }}
        </el-button>
        <button class="update-notification__dismiss" @click="dismiss">
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </template>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Upload, Close, Loading, CircleCheck } from '@element-plus/icons-vue'
import { IPC_SYSTEM } from '@shared/types/ipc-channels'

const { t } = useI18n()

interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error'
  version?: string
  progress?: number
  error?: string
}

const status = ref<UpdateStatus>({ status: 'idle' })
const dismissed = ref(false)

const visible = computed(() => {
  if (dismissed.value) return false
  return status.value.status === 'available'
    || status.value.status === 'downloading'
    || status.value.status === 'ready'
})

function onUpdateStatus(data: unknown): void {
  status.value = data as UpdateStatus
  // 新版本出现时重置 dismiss 状态
  if ((data as UpdateStatus).status === 'available') {
    dismissed.value = false
  }
}

function dismiss(): void {
  dismissed.value = true
}

async function downloadUpdate(): Promise<void> {
  await window.electronAPI?.ipc.invoke(IPC_SYSTEM.DOWNLOAD_UPDATE)
}

async function installUpdate(): Promise<void> {
  await window.electronAPI?.ipc.invoke(IPC_SYSTEM.INSTALL_UPDATE)
}

onMounted(() => {
  window.electronAPI?.ipc.on(IPC_SYSTEM.UPDATE_STATUS, onUpdateStatus)
})

onBeforeUnmount(() => {
  window.electronAPI?.ipc.removeListener(IPC_SYSTEM.UPDATE_STATUS, onUpdateStatus)
})
</script>

<style lang="scss" scoped>
.update-notification {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-primary);
  flex-shrink: 0;

  &__text {
    flex: 1;
  }

  &__progress {
    width: 120px;
    flex-shrink: 0;
  }

  &__dismiss {
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

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }
}
</style>
