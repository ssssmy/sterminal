<template>
  <div class="audit-view">
    <h3 class="audit-view__title">{{ t('settings.auditTitle') }}</h3>
    <p class="audit-view__desc">{{ t('settings.auditDesc') }}</p>

    <!-- 过滤栏 -->
    <div class="audit-view__filters">
      <el-select v-model="filterCategory" :placeholder="t('settings.auditAllCategories')" clearable size="small" style="width: 140px" @change="loadLogs">
        <el-option :label="t('settings.auditCatConnection')" value="connection" />
        <el-option :label="t('settings.auditCatTransfer')" value="transfer" />
        <el-option :label="t('settings.auditCatConfig')" value="config" />
        <el-option :label="t('settings.auditCatSecurity')" value="security" />
        <el-option :label="t('settings.auditCatSystem')" value="system" />
      </el-select>

      <el-input
        v-model="searchQuery"
        :placeholder="t('settings.auditSearch')"
        clearable
        size="small"
        style="width: 200px"
        @input="debouncedLoad"
      />

      <div class="audit-view__spacer" />

      <el-button size="small" @click="handleExport('json')">
        {{ t('settings.auditExportJson') }}
      </el-button>
      <el-button size="small" @click="handleExport('csv')">
        {{ t('settings.auditExportCsv') }}
      </el-button>
      <el-popconfirm :title="t('settings.auditClearConfirm')" @confirm="handleClear">
        <template #reference>
          <el-button size="small" type="danger">{{ t('settings.auditClear') }}</el-button>
        </template>
      </el-popconfirm>
    </div>

    <!-- 日志表格 -->
    <el-table :data="logs" stripe size="small" class="audit-view__table" v-loading="loading" empty-text=" ">
      <el-table-column prop="created_at" :label="t('settings.auditTime')" width="170" />
      <el-table-column prop="category" :label="t('settings.auditCategory')" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="categoryTagType(row.category)">{{ categoryLabel(row.category) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="event_type" :label="t('settings.auditEventType')" width="140" />
      <el-table-column prop="summary" :label="t('settings.auditSummary')" min-width="200" show-overflow-tooltip />
      <el-table-column prop="host_label" :label="t('settings.auditHost')" width="120" show-overflow-tooltip />
    </el-table>

    <!-- 空状态 -->
    <div v-if="!loading && logs.length === 0" class="audit-view__empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <span>{{ t('settings.auditEmpty') }}</span>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="audit-view__pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        small
        @current-change="loadLogs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useIpc } from '../../composables/useIpc'
import { IPC_LOG } from '@shared/types/ipc-channels'

const { t } = useI18n()
const { invoke } = useIpc()

interface AuditLog {
  id: string
  event_type: string
  category: string
  summary: string
  detail: string | null
  host_id: string | null
  host_label: string | null
  created_at: string
}

const logs = ref<AuditLog[]>([])
const total = ref(0)
const loading = ref(false)
const currentPage = ref(1)
const pageSize = 50
const filterCategory = ref('')
const searchQuery = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | null = null
function debouncedLoad() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => loadLogs(), 300)
}

async function loadLogs(): Promise<void> {
  loading.value = true
  try {
    const result = await invoke<{ rows: AuditLog[]; total: number }>(IPC_LOG.AUDIT_LIST, {
      category: filterCategory.value || undefined,
      search: searchQuery.value || undefined,
      limit: pageSize,
      offset: (currentPage.value - 1) * pageSize,
    })
    logs.value = result?.rows ?? []
    total.value = result?.total ?? 0
  } catch {
    logs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function categoryTagType(cat: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (cat) {
    case 'connection': return 'info'
    case 'transfer': return 'success'
    case 'config': return 'warning'
    case 'security': return 'danger'
    default: return 'primary'
  }
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    connection: t('settings.auditCatConnection'),
    transfer: t('settings.auditCatTransfer'),
    config: t('settings.auditCatConfig'),
    security: t('settings.auditCatSecurity'),
    system: t('settings.auditCatSystem'),
  }
  return map[cat] || cat
}

async function handleExport(format: 'json' | 'csv'): Promise<void> {
  try {
    const allLogs = await invoke<AuditLog[]>(IPC_LOG.AUDIT_EXPORT, {
      category: filterCategory.value || undefined,
    })
    if (!allLogs || allLogs.length === 0) {
      ElMessage.warning(t('settings.auditEmpty'))
      return
    }

    let content: string
    let ext: string
    if (format === 'json') {
      content = JSON.stringify(allLogs, null, 2)
      ext = 'json'
    } else {
      const headers = ['time', 'category', 'event_type', 'summary', 'host', 'detail']
      const csvRows = allLogs.map(l => [
        l.created_at, l.category, l.event_type, `"${(l.summary || '').replace(/"/g, '""')}"`, l.host_label || '', `"${(l.detail || '').replace(/"/g, '""')}"`
      ].join(','))
      content = [headers.join(','), ...csvRows].join('\n')
      ext = 'csv'
    }

    const outputPath = await invoke<string | null>('system:save-file', {
      title: t('settings.auditExport'),
      defaultPath: `sterminal-audit-${new Date().toISOString().slice(0, 10)}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    })
    if (!outputPath) return

    await invoke('system:write-file', { path: outputPath, content })
    ElMessage.success(t('settings.auditExportSuccess'))
  } catch {
    ElMessage.error(t('settings.auditExportError'))
  }
}

async function handleClear(): Promise<void> {
  await invoke(IPC_LOG.AUDIT_CLEAR)
  await loadLogs()
  ElMessage.success(t('settings.auditCleared'))
}

onMounted(loadLogs)
</script>

<style lang="scss" scoped>
.audit-view {
  &__title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 16px;
  }

  &__filters {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__spacer {
    flex: 1;
  }

  &__table {
    border-radius: 6px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px 0;
    color: var(--text-tertiary);
    font-size: 13px;

    svg { opacity: 0.4; }
  }

  &__pagination {
    display: flex;
    justify-content: center;
    margin-top: 12px;
  }
}
</style>
