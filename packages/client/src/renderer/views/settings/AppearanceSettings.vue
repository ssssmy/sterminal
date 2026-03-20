<template>
  <div class="appearance-settings">
    <h3 class="section-title">外观</h3>
    <p class="section-desc">配置界面主题和显示选项。</p>

    <!-- 主题选择 -->
    <div class="settings-group">
      <label class="settings-label">界面主题</label>
      <el-radio-group v-model="selectedTheme" @change="handleThemeChange">
        <el-radio-button value="dark">暗色</el-radio-button>
        <el-radio-button value="light">亮色</el-radio-button>
        <el-radio-button value="system">跟随系统</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '../../stores/ui.store'
import type { AppTheme } from '../../stores/ui.store'

const uiStore = useUiStore()
const selectedTheme = ref<AppTheme>(uiStore.theme)

function handleThemeChange(theme: AppTheme): void {
  uiStore.setTheme(theme)
}
</script>

<style lang="scss" scoped>
.appearance-settings {
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

  .settings-group {
    margin-bottom: 24px;
  }

  .settings-label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 10px;
  }
}
</style>
