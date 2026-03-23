<template>
  <!-- 根组件：路由视图渲染，缓存工作区避免切换设置时终端被销毁 -->
  <RouterView v-slot="{ Component, route }">
    <KeepAlive include="WorkspaceView">
      <component :is="Component" :key="route.name" />
    </KeepAlive>
  </RouterView>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { useUiStore } from './stores/ui.store'
import { useSettingsStore } from './stores/settings.store'
import { useAuthStore } from './stores/auth.store'
import { useSyncStore } from './stores/sync.store'
import { api } from './services/api'
import { IPC_WINDOW, IPC_SSH, IPC_SERVER } from '@shared/types/ipc-channels'

const { locale } = useI18n()
const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const authStore = useAuthStore()
const syncStore = useSyncStore()

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

  // 恢复缩放
  const zoom = await settingsStore.getSetting<number>('app.zoomLevel')
  if (zoom && zoom !== 1.0) {
    window.electronAPI?.ipc.invoke(IPC_WINDOW.SET_ZOOM, zoom)
  }

  // 恢复紧凑模式
  const compact = await settingsStore.getSetting<boolean>('app.compactMode')
  if (compact) {
    document.documentElement.classList.add('compact')
  }

  // 监听主机密钥验证请求
  window.electronAPI?.ipc.on(IPC_SSH.HOST_VERIFY, async (data: unknown) => {
    const { verifyId, host, port, keyType, fingerprint, oldFingerprint, type } = data as {
      verifyId: string; host: string; port: number; keyType: string
      fingerprint: string; oldFingerprint?: string; type: 'new' | 'changed'
    }

    try {
      if (type === 'changed') {
        await ElMessageBox.confirm(
          `WARNING: Host key for ${host}:${port} has changed!\n\n` +
          `Old fingerprint: ${oldFingerprint}\n` +
          `New fingerprint: ${fingerprint}\n\n` +
          `This could indicate a man-in-the-middle attack.\nDo you want to continue and update the key?`,
          'Host Key Changed',
          { confirmButtonText: 'Accept & Update', cancelButtonText: 'Reject', type: 'warning' }
        )
      } else {
        await ElMessageBox.confirm(
          `First connection to ${host}:${port}\n\n` +
          `Key type: ${keyType}\n` +
          `Fingerprint: ${fingerprint}\n\n` +
          `Do you want to trust this host and continue?`,
          'Unknown Host',
          { confirmButtonText: 'Trust & Connect', cancelButtonText: 'Cancel', type: 'info' }
        )
      }
      window.electronAPI?.ipc.invoke('ssh:host-verify-response', { verifyId, accept: true })
    } catch {
      window.electronAPI?.ipc.invoke('ssh:host-verify-response', { verifyId, accept: false })
    }
  })
})
</script>
