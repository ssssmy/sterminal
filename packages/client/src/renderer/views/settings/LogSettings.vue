<template>
  <div class="log-settings">
    <h3 class="section-title">{{ t('settings.logs_section') }}</h3>
    <p class="section-desc">{{ t('settings.logs_desc') }}</p>

    <!-- ===== 录制设置 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.recordingSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.autoRecord') }}</label>
          <span class="settings-row__desc">{{ t('settings.autoRecordDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('log.autoRecord')"
          @change="(v: unknown) => set('log.autoRecord', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.recordFormat') }}</label>
          <span class="settings-row__desc">{{ t('settings.recordFormatDesc') }}</span>
        </div>
        <el-select
          :model-value="getStr('log.format')"
          style="width: 180px"
          @change="(v: unknown) => set('log.format', v)"
        >
          <el-option :label="t('settings.formatAsciicast')" value="asciicast" />
          <el-option :label="t('settings.formatText')" value="text" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.logDirectory') }}</label>
          <span class="settings-row__desc">{{ t('settings.logDirectoryDesc') }}</span>
        </div>
        <div class="settings-row__input-group">
          <el-input
            :model-value="getStr('log.directory') || defaultLogDir"
            :placeholder="defaultLogDir"
            style="width: 260px"
            @change="(v: unknown) => set('log.directory', v)"
          />
          <el-button @click="openLogDirectory">{{ t('settings.openDirectory') }}</el-button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.fileNameTemplate') }}</label>
          <span class="settings-row__desc">{{ t('settings.fileNameTemplateDesc') }}</span>
        </div>
        <el-input
          :model-value="getStr('log.fileNameTemplate')"
          placeholder="{host}_{datetime}.log"
          style="width: 260px"
          @change="(v: unknown) => set('log.fileNameTemplate', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.addTimestamp') }}</label>
          <span class="settings-row__desc">{{ t('settings.addTimestampDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('log.timestamp')"
          @change="(v: unknown) => set('log.timestamp', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.filterPasswords') }}</label>
          <span class="settings-row__desc">{{ t('settings.filterPasswordsDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('log.excludePasswords')"
          @change="(v: unknown) => set('log.excludePasswords', v)"
        />
      </div>
    </div>

    <!-- ===== 清理 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.cleanupSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.maxFileSize') }}</label>
          <span class="settings-row__desc">{{ t('settings.maxFileSizeDesc') }}</span>
        </div>
        <div class="settings-row__input-group">
          <el-input-number
            :model-value="Math.round(getNum('log.maxFileSize') / 1048576)"
            :min="1"
            :max="500"
            :step="10"
            controls-position="right"
            style="width: 120px"
            @change="(v: unknown) => v != null && set('log.maxFileSize', Number(v) * 1048576)"
          />
          <span class="settings-row__unit">MB</span>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.autoClean') }}</label>
          <span class="settings-row__desc">{{ t('settings.autoCleanDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('log.autoClean')"
          @change="(v: unknown) => set('log.autoClean', v)"
        />
      </div>

      <div v-if="getBool('log.autoClean')" class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.retainDays') }}</label>
          <span class="settings-row__desc">{{ t('settings.retainDaysDesc') }}</span>
        </div>
        <div class="settings-row__input-group">
          <el-input-number
            :model-value="getNum('log.retainDays')"
            :min="1"
            :max="365"
            :step="1"
            controls-position="right"
            style="width: 120px"
            @change="(v: unknown) => v != null && set('log.retainDays', v)"
          />
          <span class="settings-row__unit">{{ t('settings.days') }}</span>
        </div>
      </div>
    </div>

    <!-- ===== 录制文件管理 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">
        {{ t('settings.recordingsSection') }}
        <el-button v-if="recordings.length > 0" size="small" text @click="openLogDirectory">
          {{ t('settings.openFolder') }}
        </el-button>
      </h4>

      <div v-if="loadingRecordings" class="log-list__loading">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="recordings.length === 0" class="log-list__empty">
        {{ t('settings.noRecordings') }}
      </div>
      <div v-else class="log-list">
        <div
          v-for="rec in recordings"
          :key="rec.id"
          class="log-list__item"
        >
          <div class="log-list__info">
            <span class="log-list__name">{{ extractFileName(rec.file_path) }}</span>
            <span class="log-list__meta">
              {{ formatSize(rec.file_size) }} &middot; {{ formatDate(rec.started_at) }}
            </span>
          </div>
          <el-button
            type="danger"
            size="small"
            text
            @click="deleteRecording(rec.id)"
          >
            {{ t('settings.deleteRecording') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings.store'
import { useIpc } from '../../composables/useIpc'
import { IPC_LOG } from '@shared/types/ipc-channels'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'

const { t } = useI18n()

const settingsStore = useSettingsStore()
const { invoke } = useIpc()
const home = window.electronAPI?.homePath || '~'
const sep = window.electronAPI?.platform === 'win32' ? '\\' : '/'
const defaultLogDir = `${home}${sep}STerminal${sep}logs`

function getStr(key: string): string {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return String(v ?? '')
}

function getNum(key: string): number {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return Number(v) || 0
}

function getBool(key: string): boolean {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return !!v
}

function set(key: string, value: unknown): void {
  settingsStore.setSetting(key, value)
}

// ===== 录制文件管理 =====
interface Recording {
  id: string
  file_path: string
  file_size: number | null
  started_at: string
  host_label: string | null
}

const recordings = ref<Recording[]>([])
const loadingRecordings = ref(false)

async function fetchRecordings(): Promise<void> {
  loadingRecordings.value = true
  try {
    const list = await invoke<Recording[]>(IPC_LOG.LIST)
    recordings.value = list || []
  } finally {
    loadingRecordings.value = false
  }
}

async function deleteRecording(id: string): Promise<void> {
  await invoke(IPC_LOG.DELETE, { logId: id })
  recordings.value = recordings.value.filter(r => r.id !== id)
}

async function openLogDirectory(): Promise<void> {
  await invoke(IPC_LOG.OPEN_DIRECTORY)
}

function extractFileName(filePath: string): string {
  if (!filePath) return '-'
  return filePath.split(/[/\\]/).pop() || filePath
}

function formatSize(bytes: number | null): string {
  if (bytes == null || isNaN(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(async () => {
  const keys = Object.keys(DEFAULT_SETTINGS).filter(k => k.startsWith('log.'))
  await Promise.all(keys.map(k => settingsStore.getSetting(k)))
  fetchRecordings()
})
</script>

<style lang="scss" scoped>
.log-settings {
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

.settings-block {
  margin-bottom: 32px;

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}

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

  &__input-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__unit {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__loading,
  &__empty {
    padding: 16px 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-tertiary);
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-radius: 6px;
    transition: background-color 0.15s;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  &__info {
    flex: 1;
    overflow: hidden;
  }

  &__name {
    display: block;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    font-size: 11px;
    color: var(--text-tertiary);
  }
}
</style>
