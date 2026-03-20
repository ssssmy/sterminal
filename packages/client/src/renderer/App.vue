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

const uiStore = useUiStore()

onMounted(async () => {
  // 从数据库恢复保存的主题设置
  await uiStore.restoreTheme()
})
</script>
