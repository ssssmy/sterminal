<template>
  <!-- 根组件：只负责路由视图渲染 -->
  <RouterView />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useUiStore } from './stores/ui.store'

const uiStore = useUiStore()

onMounted(() => {
  // 恢复保存的主题设置
  uiStore.restoreTheme()
})
</script>
