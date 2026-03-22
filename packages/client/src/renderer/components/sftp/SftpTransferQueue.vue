<template>
  <div class="sftp-transfer-queue" :class="{ 'sftp-transfer-queue--collapsed': collapsed }">
    <!-- 标题栏 -->
    <div class="sftp-transfer-queue__header" @click="collapsed = !collapsed">
      <span class="sftp-transfer-queue__title">
        {{ t('sftp.transfers') }}
        <span v-if="activeCount > 0" class="sftp-transfer-queue__badge">{{ activeCount }}</span>
      </span>
      <div class="sftp-transfer-queue__actions">
        <button
          v-if="!collapsed && completedCount > 0"
          class="sftp-transfer-queue__action-btn"
          :title="t('sftp.clearCompleted')"
          @click.stop="emit('clear-completed')"
        >
          {{ t('sftp.clearCompleted') }}
        </button>
        <el-icon :size="12" class="sftp-transfer-queue__chevron">
          <ArrowUp v-if="!collapsed" />
          <ArrowDown v-else />
        </el-icon>
      </div>
    </div>

    <!-- 传输列表 -->
    <div v-if="!collapsed" class="sftp-transfer-queue__list">
      <div v-if="transfers.length === 0" class="sftp-transfer-queue__empty">
        {{ t('sftp.noTransfers') }}
      </div>

      <div
        v-for="item in transfers"
        :key="item.transferId"
        class="sftp-transfer-queue__item"
        :class="`sftp-transfer-queue__item--${item.status}`"
      >
        <!-- 方向图标 -->
        <el-icon :size="14" class="sftp-transfer-queue__dir-icon">
          <Top v-if="item.direction === 'upload'" />
          <Bottom v-else />
        </el-icon>

        <!-- 文件名 + 进度条 -->
        <div class="sftp-transfer-queue__info">
          <div class="sftp-transfer-queue__name" :title="item.fileName">{{ item.fileName }}</div>
          <div v-if="item.status === 'active'" class="sftp-transfer-queue__progress-row">
            <el-progress
              :percentage="getPercent(item)"
              :show-text="false"
              :stroke-width="4"
              class="sftp-transfer-queue__progress"
            />
            <span class="sftp-transfer-queue__speed">{{ formatSpeed(item.speed) }}</span>
          </div>
          <div v-else-if="item.status === 'failed'" class="sftp-transfer-queue__error">
            {{ item.error || t('sftp.transferFailed') }}
          </div>
          <div v-else-if="item.status === 'completed'" class="sftp-transfer-queue__done">
            {{ formatSize(item.totalBytes) }} — {{ t('sftp.transferDone') }}
          </div>
          <div v-else-if="item.status === 'cancelled'" class="sftp-transfer-queue__cancelled">
            {{ t('sftp.transferCancelled') }}
          </div>
          <div v-else class="sftp-transfer-queue__queued">
            {{ t('sftp.transferQueued') }}
          </div>
        </div>

        <!-- 取消按钮（仅进行中/待处理时） -->
        <button
          v-if="item.status === 'active' || item.status === 'queued'"
          class="sftp-transfer-queue__cancel-btn"
          :title="t('common.cancel')"
          @click="emit('cancel', item.transferId)"
        >
          <el-icon :size="12"><Close /></el-icon>
        </button>

        <!-- 状态图标 -->
        <el-icon v-else-if="item.status === 'completed'" :size="14" class="sftp-transfer-queue__status-icon sftp-transfer-queue__status-icon--ok">
          <CircleCheck />
        </el-icon>
        <el-icon v-else-if="item.status === 'failed'" :size="14" class="sftp-transfer-queue__status-icon sftp-transfer-queue__status-icon--err">
          <CircleClose />
        </el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUp, ArrowDown, Top, Bottom, Close, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import type { SftpTransferItem } from '@shared/types/sftp'

const props = defineProps<{
  transfers: SftpTransferItem[]
}>()

const emit = defineEmits<{
  (e: 'cancel', transferId: string): void
  (e: 'clear-completed'): void
}>()

const { t } = useI18n()
const collapsed = ref(false)

const activeCount = computed(() =>
  props.transfers.filter(t => t.status === 'active' || t.status === 'queued').length
)

const completedCount = computed(() =>
  props.transfers.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled').length
)

function getPercent(item: SftpTransferItem): number {
  if (!item.totalBytes) return 0
  return Math.round((item.transferredBytes / item.totalBytes) * 100)
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

function formatSize(bytes: number): string {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
</script>

<style lang="scss" scoped>
.sftp-transfer-queue {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background-color: var(--bg-secondary);
  max-height: 200px;
  transition: max-height 0.2s ease;

  &--collapsed {
    max-height: 34px;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 34px;
    padding: 0 12px;
    cursor: pointer;
    flex-shrink: 0;
    user-select: none;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  &__title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background-color: var(--accent);
    color: #fff;
    font-size: 10px;
    padding: 0 4px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__action-btn {
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__chevron {
    color: var(--text-tertiary);
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 2px;
    }
  }

  &__empty {
    padding: 12px;
    text-align: center;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    transition: background-color 0.1s;

    &:hover {
      background-color: var(--bg-hover);
    }

    &--completed .sftp-transfer-queue__name {
      color: var(--text-secondary);
    }

    &--failed .sftp-transfer-queue__name {
      color: var(--error, #ef4444);
    }
  }

  &__dir-icon {
    flex-shrink: 0;
    color: var(--text-tertiary);
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__progress-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
  }

  &__progress {
    flex: 1;
  }

  &__speed {
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  &__error {
    font-size: 11px;
    color: var(--error, #ef4444);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__done,
  &__queued,
  &__cancelled {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  &__cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--error, #ef4444);
    }
  }

  &__status-icon {
    flex-shrink: 0;

    &--ok {
      color: var(--success, #22c55e);
    }

    &--err {
      color: var(--error, #ef4444);
    }
  }
}
</style>
