<template>
  <!-- 设置页面框架：左侧导航 + 右侧内容区域 -->
  <div class="settings-layout">
    <!-- 左侧导航 -->
    <nav class="settings-layout__nav">
      <!-- macOS 交通灯占位 -->
      <div v-if="isMacOS" class="settings-layout__traffic-light" />
      <div class="settings-layout__nav-header">
        <el-button
          :icon="ArrowLeft"
          text
          class="settings-layout__back"
          @click="router.push('/')"
        >
          {{ t('settings.back') }}
        </el-button>
        <h2 class="settings-layout__title">{{ t('settings.title') }}</h2>
      </div>

      <el-menu
        :default-active="activeSection"
        class="settings-layout__menu"
        @select="handleSelect"
      >
        <el-menu-item index="account">
          <el-icon><User /></el-icon>
          <span>{{ t('settings.account') }}</span>
        </el-menu-item>
        <el-menu-item index="terminal">
          <el-icon><Monitor /></el-icon>
          <span>{{ t('settings.terminal') }}</span>
        </el-menu-item>
        <el-menu-item index="appearance">
          <el-icon><Brush /></el-icon>
          <span>{{ t('settings.appearance') }}</span>
        </el-menu-item>
        <el-menu-item index="keybindings">
          <el-icon>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 17h10"/>
            </svg>
          </el-icon>
          <span>{{ t('settings.keybindings') }}</span>
        </el-menu-item>
        <el-menu-item index="keys">
          <el-icon><Key /></el-icon>
          <span>{{ t('settings.keys') }}</span>
        </el-menu-item>
        <el-menu-item index="known-hosts">
          <el-icon><Connection /></el-icon>
          <span>{{ t('settings.knownHosts') }}</span>
        </el-menu-item>
        <el-menu-item index="vault">
          <el-icon><Lock /></el-icon>
          <span>{{ t('settings.vault') }}</span>
        </el-menu-item>
        <el-menu-item index="logs">
          <el-icon><Document /></el-icon>
          <span>{{ t('settings.logs') }}</span>
        </el-menu-item>
        <el-menu-item index="audit">
          <el-icon><Tickets /></el-icon>
          <span>{{ t('settings.audit') }}</span>
        </el-menu-item>
        <el-menu-item index="data">
          <el-icon><DataAnalysis /></el-icon>
          <span>{{ t('settings.data') }}</span>
        </el-menu-item>
      </el-menu>
    </nav>

    <!-- 右侧内容区域 -->
    <main class="settings-layout__content">
      <div class="settings-layout__section">
        <!-- 根据 activeSection 渲染对应设置页（keep-alive 缓存，避免重复加载） -->
        <KeepAlive>
          <AccountSettings v-if="activeSection === 'account'" />
          <TerminalSettings v-else-if="activeSection === 'terminal'" />
          <AppearanceSettings v-else-if="activeSection === 'appearance'" />
          <KeybindingsSettings v-else-if="activeSection === 'keybindings'" />
          <LogSettings v-else-if="activeSection === 'logs'" />
          <KnownHostsSettings v-else-if="activeSection === 'known-hosts'" />
          <KeysSettings v-else-if="activeSection === 'keys'" />
          <VaultSettings v-else-if="activeSection === 'vault'" />
          <LogsAuditView v-else-if="activeSection === 'audit'" />
          <DataSettings v-else-if="activeSection === 'data'" />
          <div v-else class="settings-layout__placeholder">
            <el-empty :description="t('settings.underDevelopment')" />
          </div>
        </KeepAlive>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft, User, Monitor, Brush, Key, Connection, Lock, Document, DataAnalysis, Tickets
} from '@element-plus/icons-vue'
import AccountSettings from './AccountSettings.vue'
import TerminalSettings from './TerminalSettings.vue'
import AppearanceSettings from './AppearanceSettings.vue'
import LogSettings from './LogSettings.vue'
import KnownHostsSettings from './KnownHostsSettings.vue'
import KeysSettings from './KeysSettings.vue'
import VaultSettings from './VaultSettings.vue'
import DataSettings from './DataSettings.vue'
import LogsAuditView from './LogsAuditView.vue'
import KeybindingsSettings from './KeybindingsSettings.vue'

const router = useRouter()
const { t } = useI18n()
const isMacOS = window.electronAPI?.platform === 'darwin'
const activeSection = ref('account')

function handleSelect(key: string): void {
  activeSection.value = key
}
</script>

<style lang="scss" scoped>
.settings-layout {
  display: flex;
  width: 100%;
  height: 100%;
  background-color: var(--bg-primary);
  overflow: hidden;

  &__nav {
    width: 220px;
    min-width: 220px;
    background-color: var(--bg-inset);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  &__traffic-light {
    height: 38px;
    flex-shrink: 0;
    -webkit-app-region: drag;
  }

  &__nav-header {
    padding: 20px 16px 12px;
    border-bottom: 1px solid var(--divider);
  }

  &__back {
    padding: 4px 12px;
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 12px;

    &:hover {
      color: var(--accent);
    }
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__menu {
    flex: 1;
    padding: 8px 0;
    background-color: transparent;
    border: none;

    :deep(.el-menu-item) {
      height: 36px;
      line-height: 36px;
      margin: 2px 8px;
      border-radius: 6px;
      font-size: 13px;
    }
  }

  &__content {
    flex: 1;
    overflow-y: auto;
    background-color: var(--bg-primary);
  }

  &__section {
    max-width: 720px;
    padding: 32px 40px;
  }

  &__placeholder {
    padding: 40px 0;
  }
}
</style>
