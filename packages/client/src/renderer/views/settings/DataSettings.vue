<template>
  <div class="data-settings">
    <h3 class="section-title">{{ t('dataSettings.title') }}</h3>
    <p class="section-desc">{{ t('dataSettings.desc') }}</p>

    <!-- ===== 导入区块 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('dataSettings.importSection') }}</h4>

      <!-- 从 OpenSSH Config 导入 -->
      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('dataSettings.importSshLabel') }}</label>
          <span class="settings-row__desc">{{ t('dataSettings.importSshDesc') }}</span>
        </div>
        <el-button :loading="importingSsh" @click="handleImportSshConfig">
          {{ t('dataSettings.importSshBtn') }}
        </el-button>
      </div>

      <!-- 从 STerminal 文件导入 -->
      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('dataSettings.importJsonLabel') }}</label>
          <span class="settings-row__desc">{{ t('dataSettings.importJsonDesc') }}</span>
        </div>
        <el-button :loading="importingJson" @click="handleImportJson">
          {{ t('dataSettings.importJsonBtn') }}
        </el-button>
      </div>

      <!-- 隐藏文件选择器 -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".json"
        style="display: none"
        @change="onFileSelected"
      />
    </div>

    <!-- ===== 导出区块 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('dataSettings.exportSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('dataSettings.exportLabel') }}</label>
          <span class="settings-row__desc">{{ t('dataSettings.exportDesc') }}</span>
        </div>
        <div class="settings-row__control">
          <el-checkbox v-model="includeSensitive">
            {{ t('dataSettings.exportIncludeSensitive') }}
          </el-checkbox>
          <el-button :loading="exporting" @click="handleExport">
            {{ t('dataSettings.exportBtn') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- ===== 危险操作区块 ===== -->
    <div class="settings-block settings-block--danger">
      <h4 class="settings-block__title settings-block__title--danger">{{ t('dataSettings.dangerSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('dataSettings.clearDataLabel') }}</label>
          <span class="settings-row__desc">{{ t('dataSettings.clearDataDesc') }}</span>
        </div>
        <el-button type="danger" :loading="clearingData" @click="handleClearData">
          {{ t('dataSettings.clearDataBtn') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useIpc } from '../../composables/useIpc'
import { IPC_SYSTEM } from '../../../shared/types/ipc-channels'

const { t } = useI18n()
const { invoke } = useIpc()

// ===== 导入 SSH Config =====

const importingSsh = ref(false)

async function handleImportSshConfig(): Promise<void> {
  importingSsh.value = true
  try {
    const result = await invoke<{ imported: number; skipped: number }>(
      IPC_SYSTEM.IMPORT_HOSTS,
      { type: 'ssh_config' }
    )
    ElMessage.success(
      t('dataSettings.importSshSuccess', { imported: result.imported, skipped: result.skipped })
    )
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('dataSettings.importFailed'))
  } finally {
    importingSsh.value = false
  }
}

// ===== 导入 STerminal JSON =====

const importingJson = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function handleImportJson(): void {
  fileInputRef.value?.click()
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Reset so same file can be selected again
  input.value = ''
  if (!file) return

  importingJson.value = true
  try {
    const content = await file.text()
    const result = await invoke<{ imported: number }>(
      IPC_SYSTEM.IMPORT_HOSTS,
      { type: 'sterminal_json', content }
    )
    ElMessage.success(
      t('dataSettings.importJsonSuccess', { imported: result.imported })
    )
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('dataSettings.importFailed'))
  } finally {
    importingJson.value = false
  }
}

// ===== 导出 =====

const includeSensitive = ref(true)
const exporting = ref(false)

async function handleExport(): Promise<void> {
  exporting.value = true
  try {
    const json = await invoke<string>(
      IPC_SYSTEM.EXPORT_HOSTS,
      { includeSensitive: includeSensitive.value }
    )
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sterminal-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('dataSettings.exportSuccess'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('dataSettings.exportFailed'))
  } finally {
    exporting.value = false
  }
}

// ===== 清除所有数据 =====

const clearingData = ref(false)

async function handleClearData(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('dataSettings.clearDataConfirmMsg'),
      t('dataSettings.clearDataConfirmTitle'),
      {
        confirmButtonText: t('dataSettings.clearDataConfirmBtn'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      }
    )
  } catch {
    return
  }

  clearingData.value = true
  try {
    await invoke(IPC_SYSTEM.BACKUP, { keepSettings: true })
    ElMessage.success(t('dataSettings.clearDataSuccess'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('dataSettings.clearDataFailed'))
  } finally {
    clearingData.value = false
  }
}
</script>

<style lang="scss" scoped>
.data-settings {
  max-width: 680px;

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .section-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }
}

// ===== 设置块 =====
.settings-block {
  margin-bottom: 32px;

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider);
  }

  &--danger {
    border: 1px solid var(--el-color-danger-light-5);
    border-radius: 8px;
    padding: 16px;
  }

  &__title--danger {
    color: var(--el-color-danger);
    border-bottom-color: var(--el-color-danger-light-7);
  }
}

// ===== 设置行 =====
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  min-height: 48px;

  &__info {
    flex: 1;
    margin-right: 24px;
  }

  &__label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__control {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}
</style>
