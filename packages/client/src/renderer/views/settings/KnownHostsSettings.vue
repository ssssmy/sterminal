<template>
  <div class="known-hosts-settings">
    <h3 class="section-title">{{ t('settings.knownHosts') }}</h3>
    <p class="section-desc">{{ t('knownHosts.desc') }}</p>

    <div v-if="loading" class="known-hosts__loading">{{ t('common.loading') }}</div>
    <div v-else-if="hosts.length === 0" class="known-hosts__empty">{{ t('knownHosts.empty') }}</div>
    <div v-else class="known-hosts__list">
      <div
        v-for="host in hosts"
        :key="host.id"
        class="known-hosts__item"
      >
        <div class="known-hosts__info">
          <span class="known-hosts__host">{{ host.host }}:{{ host.port }}</span>
          <span class="known-hosts__meta">
            {{ host.key_type }} &middot; SHA256:{{ host.fingerprint?.substring(0, 16) }}...
          </span>
          <span class="known-hosts__date">
            {{ t('knownHosts.firstSeen') }}: {{ formatDate(host.first_seen) }}
            &middot; {{ t('knownHosts.lastSeen') }}: {{ formatDate(host.last_seen) }}
          </span>
        </div>
        <el-button type="danger" size="small" text @click="removeHost(host.id)">
          {{ t('common.delete') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIpc } from '../../composables/useIpc'

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

async function fetchHosts(): Promise<void> {
  loading.value = true
  try {
    const list = await invoke<KnownHost[]>('db:known-hosts:list')
    hosts.value = list || []
  } finally {
    loading.value = false
  }
}

async function removeHost(id: string): Promise<void> {
  await invoke('db:known-hosts:delete', id)
  hosts.value = hosts.value.filter(h => h.id !== id)
}

function formatDate(iso: string): string {
  if (!iso) return '-'
  return iso.replace('T', ' ').substring(0, 16)
}

onMounted(() => fetchHosts())
</script>

<style lang="scss" scoped>
.known-hosts-settings {
  max-width: 680px;

  .section-title { font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
  .section-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; }
}

.known-hosts {
  &__loading, &__empty {
    padding: 16px 0; text-align: center; font-size: 13px; color: var(--text-tertiary);
  }

  &__list { display: flex; flex-direction: column; gap: 2px; }

  &__item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 6px; transition: background-color 0.15s;
    &:hover { background-color: var(--bg-hover); }
  }

  &__info { flex: 1; overflow: hidden; }

  &__host {
    display: block; font-family: 'JetBrains Mono', monospace; font-size: 13px;
    font-weight: 500; color: var(--text-primary);
  }

  &__meta { display: block; font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  &__date { display: block; font-size: 11px; color: var(--text-tertiary); margin-top: 1px; }
}
</style>
