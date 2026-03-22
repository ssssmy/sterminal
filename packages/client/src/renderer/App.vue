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
import { useUiStore } from './stores/ui.store'
import { useSettingsStore } from './stores/settings.store'
import { IPC_WINDOW } from '@shared/types/ipc-channels'

const uiStore = useUiStore()
const settingsStore = useSettingsStore()

onMounted(async () => {
  // 从数据库恢复保存的主题设置
  uiStore.restoreTheme()

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
})
</script>
