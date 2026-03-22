<template>
  <div class="log-settings">
    <h3 class="section-title">日志</h3>
    <p class="section-desc">配置会话录制和日志文件管理。</p>

    <!-- ===== 录制设置 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">录制</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">自动录制</label>
          <span class="settings-row__desc">打开新终端时自动开始录制会话</span>
        </div>
        <el-switch
          :model-value="getBool('log.autoRecord')"
          @change="(v: unknown) => set('log.autoRecord', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">录制格式</label>
          <span class="settings-row__desc">会话录制文件的存储格式</span>
        </div>
        <el-select
          :model-value="getStr('log.format')"
          style="width: 180px"
          @change="(v: unknown) => set('log.format', v)"
        >
          <el-option label="asciicast (可回放)" value="asciicast" />
          <el-option label="纯文本" value="text" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">存储目录</label>
          <span class="settings-row__desc">录制文件保存位置，留空使用默认目录</span>
        </div>
        <div class="settings-row__input-group">
          <el-input
            :model-value="getStr('log.directory')"
            placeholder="默认目录"
            style="width: 260px"
            @change="(v: unknown) => set('log.directory', v)"
          />
          <el-button @click="openLogDirectory">打开</el-button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">文件名模板</label>
          <span class="settings-row__desc">可用变量：{host} 主机名、{datetime} 时间</span>
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
          <label class="settings-row__label">添加时间戳</label>
          <span class="settings-row__desc">每行输出前添加时间标记</span>
        </div>
        <el-switch
          :model-value="getBool('log.timestamp')"
          @change="(v: unknown) => set('log.timestamp', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">过滤密码</label>
          <span class="settings-row__desc">尝试检测并过滤录制中的密码输入</span>
        </div>
        <el-switch
          :model-value="getBool('log.excludePasswords')"
          @change="(v: unknown) => set('log.excludePasswords', v)"
        />
      </div>
    </div>

    <!-- ===== 清理 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">清理</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">单文件大小上限</label>
          <span class="settings-row__desc">超过此大小自动停止录制</span>
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
          <label class="settings-row__label">自动清理</label>
          <span class="settings-row__desc">自动删除过期的录制文件</span>
        </div>
        <el-switch
          :model-value="getBool('log.autoClean')"
          @change="(v: unknown) => set('log.autoClean', v)"
        />
      </div>

      <div v-if="getBool('log.autoClean')" class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">保留天数</label>
          <span class="settings-row__desc">超过天数的录制文件将被自动删除</span>
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
          <span class="settings-row__unit">天</span>
        </div>
      </div>
    </div>

    <!-- ===== 录制文件管理 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">
        录制文件
        <el-button v-if="recordings.length > 0" size="small" text @click="openLogDirectory">
          打开文件夹
        </el-button>
      </h4>

      <div v-if="loadingRecordings" class="log-list__loading">
        加载中...
      </div>
      <div v-else-if="recordings.length === 0" class="log-list__empty">
        暂无录制文件
      </div>
      <div v-else class="log-list">
        <div
          v-for="rec in recordings"
          :key="rec.id"
          class="log-list__item"
        >
          <div class="log-list__info">
            <span class="log-list__name">{{ rec.fileName }}</span>
            <span class="log-list__meta">
              {{ formatSize(rec.fileSize) }} &middot; {{ formatDate(rec.createdAt) }}
            </span>
          </div>
          <el-button
            type="danger"
            size="small"
            text
            @click="deleteRecording(rec.id)"
          >
            删除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../../stores/settings.store'
import { useIpc } from '../../composables/useIpc'
import { IPC_LOG } from '@shared/types/ipc-channels'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'

const settingsStore = useSettingsStore()
const { invoke } = useIpc()

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
  fileName: string
  fileSize: number
  createdAt: string
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
  await invoke(IPC_LOG.DELETE, id)
  recordings.value = recordings.value.filter(r => r.id !== id)
}

async function openLogDirectory(): Promise<void> {
  await invoke(IPC_LOG.OPEN_DIRECTORY)
}

function formatSize(bytes: number): string {
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
