<template>
  <div class="known-hosts-settings">
    <h3 class="section-title">{{ t('settings.knownHosts') }}</h3>
    <p class="section-desc">{{ t('knownHosts.desc') }}</p>

    <!-- 搜索栏 + 计数 -->
    <div class="known-hosts__toolbar">
      <el-input
        v-model="search"
        :placeholder="t('knownHosts.search')"
        clearable
        size="small"
        class="known-hosts__search"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <span v-if="!loading" class="known-hosts__count">
        {{ t('knownHosts.total', { count: filtered.length }) }}
      </span>
    </div>

    <div v-if="loading" class="known-hosts__empty">{{ t('common.loading') }}</div>
    <div v-else-if="filtered.length === 0" class="known-hosts__empty">
      {{ search ? t('common.noResults') : t('knownHosts.empty') }}
    </div>

    <div v-else class="known-hosts__list">
      <div
        v-for="host in filtered"
        :key="host.id"
        class="known-hosts__item"
      >
        <div class="known-hosts__info">
          <div class="known-hosts__row1">
            <span class="known-hosts__host">{{ host.host }}:{{ host.port }}</span>
            <el-tag size="small" type="info" class="known-hosts__keytype">{{ host.key_type }}</el-tag>
          </div>
          <div class="known-hosts__fingerprint-row">
            <code class="known-hosts__fingerprint">SHA256:{{ host.fingerprint }}</code>
            <el-tooltip :content="t('knownHosts.copyFingerprint')" placement="top">
              <el-button
                size="small"
                text
                class="known-hosts__copy-btn"
                @click="copyFingerprint(host)"
              >
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          <div class="known-hosts__dates">
            <span>{{ t('knownHosts.firstSeen') }}: {{ formatDate(host.first_seen) }}</span>
            <span class="known-hosts__sep">&middot;</span>
            <span>{{ t('knownHosts.lastSeen') }}: {{ formatDate(host.last_seen) }}</span>
          </div>
        </div>
        <el-button
          type="danger"
          size="small"
          text
          class="known-hosts__del-btn"
          @click="confirmRemove(host)"
        >
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Search, CopyDocument } from '@element-plus/icons-vue'
import { useIpc } from '../../composables/useIpc'
import { IPC_DB } from '@shared/types/ipc-channels'

const { t } = useI18n()
const { invoke } = useIpc()

interface KnownHost {
  id: string
  host: string
  port: number
  key_type: string
  fingerprint: string
  first_seen: string
  last_seen: string
}

const hosts = ref<KnownHost[]>([])
const loading = ref(false)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return hosts.value
  return hosts.value.filter(h =>
    h.host.toLowerCase().includes(q) ||
    h.fingerprint.toLowerCase().includes(q) ||
    h.key_type.toLowerCase().includes(q)
  )
})

async function fetchHosts(): Promise<void> {
  loading.value = true
  try {
    const list = await invoke<KnownHost[]>(IPC_DB.KNOWN_HOSTS_LIST)
    hosts.value = list || []
  } finally {
    loading.value = false
  }
}

async function confirmRemove(host: KnownHost): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('knownHosts.deleteConfirm'),
      t('knownHosts.deleteConfirmTitle'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return
  }
  await invoke(IPC_DB.KNOWN_HOSTS_DELETE, host.id)
  hosts.value = hosts.value.filter(h => h.id !== host.id)
  ElMessage.success(`${host.host}:${host.port} ${t('knownHosts.deleted')}`)
}

async function copyFingerprint(host: KnownHost): Promise<void> {
  const text = `SHA256:${host.fingerprint}`
  await navigator.clipboard.writeText(text)
  ElMessage.success(t('knownHosts.copied'))
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  if (isNaN(d.getTime())) return iso.substring(0, 16)
  return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => fetchHosts())
</script>

<style lang="scss" scoped>
.known-hosts-settings {
  max-width: 720px;

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  .section-desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin-bottom: 20px;
  }
}

.known-hosts {
  &__toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  &__search { flex: 1; max-width: 320px; }

  &__count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    white-space: nowrap;
  }

  &__empty {
    padding: 32px 0;
    text-align: center;
    font-size: 13px;
    color: var(--el-text-color-placeholder);
  }

  &__list { display: flex; flex-direction: column; gap: 2px; }

  &__item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 10px 12px;
    border-radius: 6px;
    transition: background-color var(--st-duration-fast, 0.15s);
    &:hover { background-color: var(--el-fill-color-light); }
  }

  &__info { flex: 1; min-width: 0; overflow: hidden; }

  &__row1 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  &__host {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__keytype { font-size: 10px; }

  &__fingerprint-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    min-width: 0;
  }

  &__fingerprint {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--el-text-color-regular);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 480px;
  }

  &__copy-btn {
    flex-shrink: 0;
    padding: 2px !important;
    height: auto !important;
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    &:hover { color: var(--el-color-primary); }
  }

  &__dates {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }

  &__sep { color: var(--el-border-color); }

  &__del-btn {
    flex-shrink: 0;
    margin-left: 12px;
    align-self: center;
  }
}
</style>
