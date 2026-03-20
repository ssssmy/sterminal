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
          返回
        </el-button>
        <h2 class="settings-layout__title">设置</h2>
      </div>

      <el-menu
        :default-active="activeSection"
        class="settings-layout__menu"
        @select="handleSelect"
      >
        <el-menu-item index="account">
          <el-icon><User /></el-icon>
          <span>账号与同步</span>
        </el-menu-item>
        <el-menu-item index="terminal">
          <el-icon><Monitor /></el-icon>
          <span>终端</span>
        </el-menu-item>
        <el-menu-item index="appearance">
          <el-icon><Brush /></el-icon>
          <span>外观</span>
        </el-menu-item>
        <el-menu-item index="keys">
          <el-icon><Key /></el-icon>
          <span>SSH 密钥</span>
        </el-menu-item>
        <el-menu-item index="known-hosts">
          <el-icon><Connection /></el-icon>
          <span>已知主机</span>
        </el-menu-item>
        <el-menu-item index="vault">
          <el-icon><Lock /></el-icon>
          <span>密钥库</span>
        </el-menu-item>
        <el-menu-item index="logs">
          <el-icon><Document /></el-icon>
          <span>日志</span>
        </el-menu-item>
        <el-menu-item index="data">
          <el-icon><DataAnalysis /></el-icon>
          <span>数据管理</span>
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
          <div v-else class="settings-layout__placeholder">
            <el-empty description="功能开发中" />
          </div>
        </KeepAlive>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft, User, Monitor, Brush, Key, Connection, Lock, Document, DataAnalysis
} from '@element-plus/icons-vue'
import AccountSettings from './AccountSettings.vue'
import TerminalSettings from './TerminalSettings.vue'
import AppearanceSettings from './AppearanceSettings.vue'

const router = useRouter()
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
    padding: 0;
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
