<template>
  <div class="terminal-settings">
    <h3 class="section-title">终端</h3>
    <p class="section-desc">配置终端外观和行为。</p>
    <!-- TODO: 实现终端设置页 -->
    <el-empty description="功能开发中" />
  </div>
</template>

<script setup lang="ts">
</script>

<style lang="scss" scoped>
.terminal-settings {
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
</style>
