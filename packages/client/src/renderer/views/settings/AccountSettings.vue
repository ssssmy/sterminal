<template>
  <div class="account-settings">
    <h3 class="section-title">{{ t('settings.account') }}</h3>
    <p class="section-desc">{{ t('settings.account_desc') }}</p>
    <!-- TODO: 实现账号设置页 -->
    <el-empty :description="t('settings.underDevelopment')" />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style lang="scss" scoped>
.account-settings {
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
