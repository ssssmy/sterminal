<template>
  <!-- 根组件：路由视图渲染，缓存工作区避免切换设置时终端被销毁 -->
  <RouterView v-slot="{ Component, route }">
    <KeepAlive include="WorkspaceView">
      <component :is="Component" :key="route.name" />
    </KeepAlive>
  </RouterView>
  <OnboardingWizard v-if="showOnboarding" @complete="handleOnboardingComplete" />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import OnboardingWizard from './components/common/OnboardingWizard.vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { useUiStore } from './stores/ui.store'
import { useSettingsStore } from './stores/settings.store'
import { useAuthStore } from './stores/auth.store'
import { useSyncStore } from './stores/sync.store'
import { api } from './services/api'
import { IPC_WINDOW, IPC_SSH, IPC_SERVER, IPC_SYNC } from '@shared/types/ipc-channels'
import { useHostsStore } from './stores/hosts.store'
import { useTerminalsStore } from './stores/terminals.store'
import { useSnippetsStore } from './stores/snippets.store'
import { usePortForwardsStore } from './stores/port-forwards.store'
import { useSessionsStore } from './stores/sessions.store'

const { locale, t } = useI18n()
const router = useRouter()
const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const syncStore = useSyncStore()
const hostsStore = useHostsStore()
const terminalsStore = useTerminalsStore()
const snippetsStore = useSnippetsStore()
const portForwardsStore = usePortForwardsStore()

const showOnboarding = ref(false)

function handleOnboardingComplete(): void {
  settingsStore.setSetting('app.onboardingCompleted', true)
  showOnboarding.value = false
}

onMounted(async () => {
  // 从数据库恢复保存的主题设置
  uiStore.restoreTheme()

  // 同步服务器地址到主进程（localStorage 为权威源，主进程需要同步读取）
  const savedServerUrl = api.getServerUrl()
  window.electronAPI?.ipc.invoke(IPC_SERVER.SET_URL, savedServerUrl).catch(() => {})

  // 恢复登录状态（静默降级为离线模式，不阻塞启动）
  authStore.restoreSession().then(() => {
    // 登录成功后自动启动同步
    if (authStore.isLoggedIn && authStore.token) {
      syncStore.startSync(authStore.token).catch(() => { /* 静默忽略 */ })
    }
  }).catch(() => { /* 静默忽略 */ })

  // 恢复语言
  const lang = await settingsStore.getSetting<string>('app.language')
  if (lang && lang !== 'zh-CN') {
    locale.value = lang
  }

  // 恢复缩放（有效范围 0.8~1.5）
  const zoom = await settingsStore.getSetting<number>('app.zoomLevel')
  if (zoom && zoom >= 0.8 && zoom <= 1.5 && zoom !== 1.0) {
    window.electronAPI?.ipc.invoke(IPC_WINDOW.SET_ZOOM, zoom)
  }

  // 恢复紧凑模式
  const compact = await settingsStore.getSetting<boolean>('app.compactMode')
  if (compact) {
    document.documentElement.classList.add('compact')
  }

  // 首次启动引导向导：未完成时显示
  const onboardingCompleted = await settingsStore.getSetting('app.onboardingCompleted')
  if (!onboardingCompleted) {
    showOnboarding.value = true
  }

  // 系统托盘事件：快速连接主机
  const sessionsStore = useSessionsStore()
  window.electronAPI?.ipc.on('system:tray-connect', (data: unknown) => {
    const { hostId } = data as { hostId: string }
    if (hostId) {
      sessionsStore.createTab(undefined, 'ssh', hostId)
      router.push('/')
    }
  })

  // 系统托盘事件：新建终端
  window.electronAPI?.ipc.on('system:tray-new-terminal', () => {
    sessionsStore.createTab()
    router.push('/')
  })

  // Deep Link 事件：sterminal:// URI Scheme
  window.electronAPI?.ipc.on('system:deep-link', (data: unknown) => {
    const { action, params } = data as { action: string; params: Record<string, string> }
    router.push('/')
    switch (action) {
      case 'connect': {
        // 按优先级匹配主机：id > name/label > host+port+user
        let targetHost = null as typeof hostsStore.hosts[0] | null
        if (params.id) {
          targetHost = hostsStore.hosts.find(h => h.id === params.id) || null
        } else if (params.name) {
          // sterminal://connect?name=prod-server
          targetHost = hostsStore.hosts.find(h =>
            (h.label || '').toLowerCase() === params.name.toLowerCase() ||
            h.address.toLowerCase() === params.name.toLowerCase()
          ) || null
        } else if (params.host) {
          targetHost = hostsStore.hosts.find(h =>
            h.address === params.host &&
            (!params.port || h.port === parseInt(params.port)) &&
            (!params.user || h.username === params.user)
          ) || null
        }
        if (targetHost) {
          sessionsStore.createTab(targetHost.label || targetHost.address, 'ssh', targetHost.id)
        }
        break
      }
      case 'sftp': {
        // SFTP 需要先建立 SSH 连接，CLI 先打开 SSH 终端，用户再手动切 SFTP
        // 未来可优化为自动打开 SFTP 面板
        const sftpHost = hostsStore.hosts.find(h =>
          h.address === params.host &&
          (!params.port || h.port === parseInt(params.port)) &&
          (!params.user || h.username === params.user)
        )
        if (sftpHost) {
          sessionsStore.createTab(sftpHost.label || sftpHost.address, 'ssh', sftpHost.id)
        }
        break
      }
      case 'new-terminal':
        sessionsStore.createTab()
        break
      case 'open':
        // 仅打开窗口（已在主进程处理）
        break
    }
  })

  // 监听主机密钥验证请求
  window.electronAPI?.ipc.on(IPC_SSH.HOST_VERIFY, async (data: unknown) => {
    const { verifyId, host, port, keyType, fingerprint, oldFingerprint, type } = data as {
      verifyId: string; host: string; port: number; keyType: string
      fingerprint: string; oldFingerprint?: string; type: 'new' | 'changed'
    }

    try {
      if (type === 'changed') {
        await ElMessageBox.confirm(
          t('knownHosts.changedMsg', { host, port, fingerprint, oldFingerprint }),
          t('knownHosts.changedTitle'),
          { confirmButtonText: t('knownHosts.acceptUpdate'), cancelButtonText: t('knownHosts.rejectConnect'), type: 'warning' }
        )
      } else {
        await ElMessageBox.confirm(
          t('knownHosts.newMsg', { host, port, keyType, fingerprint }),
          t('knownHosts.newTitle'),
          { confirmButtonText: t('knownHosts.trustConnect'), cancelButtonText: t('knownHosts.cancelConnect'), type: 'info' }
        )
      }
      window.electronAPI?.ipc.invoke('ssh:host-verify-response', { verifyId, accept: true })
    } catch {
      window.electronAPI?.ipc.invoke('ssh:host-verify-response', { verifyId, accept: false })
    }
  })

  // 同步完成后刷新所有数据 Store
  window.electronAPI?.ipc.on(IPC_SYNC.DATA_CHANGED, () => {
    hostsStore.fetchHosts()
    hostsStore.fetchGroups()
    hostsStore.fetchTags()
    terminalsStore.fetchTerminals()
    terminalsStore.fetchGroups()
    snippetsStore.fetchSnippets()
    snippetsStore.fetchGroups()
    portForwardsStore.fetchRules()
  })
})
</script>
