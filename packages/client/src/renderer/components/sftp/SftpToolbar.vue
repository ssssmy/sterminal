<template>
  <div class="sftp-toolbar">
    <!-- 上传 -->
    <button
      class="sftp-toolbar__btn"
      :title="t('sftp.upload')"
      :disabled="selectedLocal.length === 0"
      @click="emit('upload')"
    >
      <el-icon><Upload /></el-icon>
      <span>{{ t('sftp.upload') }}</span>
    </button>

    <!-- 下载 -->
    <button
      class="sftp-toolbar__btn"
      :title="t('sftp.download')"
      :disabled="selectedRemote.length === 0"
      @click="emit('download')"
    >
      <el-icon><Download /></el-icon>
      <span>{{ t('sftp.download') }}</span>
    </button>

    <div class="sftp-toolbar__divider" />

    <!-- 新建文件夹 -->
    <button
      class="sftp-toolbar__btn"
      :title="t('sftp.newFolder')"
      @click="emit('mkdir')"
    >
      <el-icon><FolderAdd /></el-icon>
      <span>{{ t('sftp.newFolder') }}</span>
    </button>

    <!-- 刷新 -->
    <button
      class="sftp-toolbar__btn"
      :title="t('sftp.refresh')"
      @click="emit('refresh')"
    >
      <el-icon><Refresh /></el-icon>
    </button>

    <div class="sftp-toolbar__divider" />

    <!-- 显示隐藏文件 -->
    <button
      class="sftp-toolbar__btn"
      :class="{ 'sftp-toolbar__btn--active': showHidden }"
      :title="t('sftp.showHidden')"
      @click="emit('toggle-hidden')"
    >
      <el-icon><View /></el-icon>
    </button>

    <!-- 视图切换 -->
    <button
      class="sftp-toolbar__btn"
      :title="t('sftp.viewList')"
      :class="{ 'sftp-toolbar__btn--active': viewMode === 'list' }"
      @click="emit('set-view-mode', 'list')"
    >
      <el-icon><List /></el-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Upload, Download, FolderAdd, Refresh, View, List } from '@element-plus/icons-vue'

const props = defineProps<{
  selectedLocal: string[]
  selectedRemote: string[]
  showHidden: boolean
  viewMode: 'list' | 'grid'
}>()

const emit = defineEmits<{
  (e: 'upload'): void
  (e: 'download'): void
  (e: 'mkdir'): void
  (e: 'refresh'): void
  (e: 'toggle-hidden'): void
  (e: 'set-view-mode', mode: 'list' | 'grid'): void
}>()

const { t } = useI18n()
</script>

<style lang="scss" scoped>
.sftp-toolbar {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  gap: 2px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;

  &__btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;
    transition: background-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth), opacity var(--st-duration-fast) var(--st-easing-smooth);
    white-space: nowrap;

    &:hover:not(:disabled) {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--active {
      color: var(--accent);
      background-color: var(--accent-light, rgba(99, 102, 241, 0.12));
    }
  }

  &__divider {
    width: 1px;
    height: 18px;
    background-color: var(--divider);
    margin: 0 4px;
    flex-shrink: 0;
  }
}
</style>
