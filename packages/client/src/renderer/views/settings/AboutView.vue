<template>
  <div class="about-view">
    <!-- Logo + 版本 -->
    <div class="about-view__header">
      <div class="about-view__logo">
        <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
          <rect width="64" height="64" rx="14" fill="#6366f1" />
          <text x="10" y="42" font-size="32" font-weight="800" fill="white" font-family="Inter, system-ui, sans-serif">S</text>
          <rect x="40" y="40" width="14" height="3" rx="1" fill="white" />
          <rect x="10" y="48" width="44" height="2" rx="1" fill="rgba(255,255,255,0.4)" />
        </svg>
      </div>
      <div class="about-view__info">
        <h2 class="about-view__name">STerminal</h2>
        <span class="about-view__version">v{{ version }}</span>
        <span class="about-view__desc">{{ t('about.tagline') }}</span>
      </div>
    </div>

    <!-- 功能列表 -->
    <div class="about-view__features">
      <div v-for="section in featureSections" :key="section.title" class="about-view__section">
        <h4 class="about-view__section-title">
          <el-icon :size="16"><component :is="section.icon" /></el-icon>
          {{ section.title }}
        </h4>
        <ul class="about-view__list">
          <li v-for="item in section.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </div>

    <!-- 底部链接 -->
    <div class="about-view__footer">
      <el-button text size="small" @click="openExternal('https://github.com/ssssmy/sterminal')">
        <el-icon><Link /></el-icon>
        GitHub
      </el-button>
      <el-button text size="small" @click="openExternal('https://github.com/ssssmy/sterminal/issues')">
        <el-icon><ChatDotRound /></el-icon>
        {{ t('about.feedback') }}
      </el-button>
      <el-button text size="small" @click="openExternal('https://github.com/ssssmy/sterminal/blob/main/LICENSE')">
        <el-icon><Document /></el-icon>
        MIT License
      </el-button>
    </div>

    <p class="about-view__copyright">{{ t('about.copyright') }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Monitor, FolderOpened, Ticket, Switch, Key, Lock, Document,
  Connection, Brush, Bell, Link, ChatDotRound, Setting
} from '@element-plus/icons-vue'

const { t } = useI18n()

// 从 package.json 读取版本号（Vite 会在构建时注入）
const version = __APP_VERSION__ ?? '0.1.0'

function openExternal(url: string): void {
  window.electronAPI?.ipc.invoke('system:open-external', url)
}

const featureSections = computed(() => [
  {
    title: t('about.sectionTerminal'),
    icon: Monitor,
    items: [
      t('about.featureSSH'),
      t('about.featureLocalTerminal'),
      t('about.featureMultiTab'),
      t('about.featureSplitPane'),
      t('about.featureBroadcast'),
      t('about.featureSearch'),
      t('about.featureAutoComplete'),
      t('about.featureRightClick'),
      t('about.featureEnvBorder'),
      t('about.featureSSHHealth'),
    ],
  },
  {
    title: t('about.sectionFileTransfer'),
    icon: FolderOpened,
    items: [
      t('about.featureSFTP'),
      t('about.featureFileEdit'),
      t('about.featureTransferQueue'),
    ],
  },
  {
    title: t('about.sectionProductivity'),
    icon: Ticket,
    items: [
      t('about.featureSnippets'),
      t('about.featurePortForward'),
      t('about.featureCommandPalette'),
      t('about.featureRecording'),
      t('about.featureGifExport'),
    ],
  },
  {
    title: t('about.sectionSecurity'),
    icon: Lock,
    items: [
      t('about.featureKeyManagement'),
      t('about.featureVault'),
      t('about.featureE2EE'),
      t('about.featureAudit'),
    ],
  },
  {
    title: t('about.sectionCustomization'),
    icon: Brush,
    items: [
      t('about.featureThemeEngine'),
      t('about.featureKeybindings'),
      t('about.featureI18n'),
      t('about.featureDesignTokens'),
    ],
  },
  {
    title: t('about.sectionSystem'),
    icon: Setting,
    items: [
      t('about.featureAutoUpdate'),
      t('about.featureTray'),
      t('about.featureURIScheme'),
      t('about.featureCLI'),
      t('about.featureCloudSync'),
    ],
  },
])
</script>

<style lang="scss" scoped>
.about-view {
  max-width: 640px;

  &__header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  &__logo {
    flex-shrink: 0;
  }

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__name {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
  }

  &__version {
    font-size: 13px;
    color: var(--accent);
    font-weight: 600;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-secondary);
  }

  &__features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 24px;
  }

  &__section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 8px;
    color: var(--text-primary);
  }

  &__list {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.8;

    li { padding-left: 2px; }
  }

  &__footer {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__copyright {
    font-size: 11px;
    color: var(--text-tertiary);
    margin: 0;
  }
}
</style>
