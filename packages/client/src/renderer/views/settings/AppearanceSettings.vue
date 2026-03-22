<template>
  <div class="appearance-settings">
    <h3 class="section-title">外观</h3>
    <p class="section-desc">配置界面主题和显示选项。</p>

    <!-- ===== 主题 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">主题</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">界面主题</label>
          <span class="settings-row__desc">选择暗色、亮色或跟随系统自动切换</span>
        </div>
        <el-radio-group :model-value="uiStore.theme" @change="handleThemeChange">
          <el-radio-button value="dark">暗色</el-radio-button>
          <el-radio-button value="light">亮色</el-radio-button>
          <el-radio-button value="system">跟随系统</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- ===== 界面 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">界面</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">语言</label>
          <span class="settings-row__desc">界面显示语言（修改后需重启生效）</span>
        </div>
        <el-select
          :model-value="getStr('app.language')"
          style="width: 180px"
          @change="(v: unknown) => set('app.language', v)"
        >
          <el-option label="简体中文" value="zh-CN" />
          <el-option label="English" value="en" />
          <el-option label="繁體中文" value="zh-TW" />
          <el-option label="日本語" value="ja" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">界面缩放</label>
          <span class="settings-row__desc">整体缩放比例（0.8x - 1.5x）</span>
        </div>
        <div class="settings-row__slider-group">
          <el-slider
            :model-value="getNum('app.zoomLevel')"
            :min="0.8"
            :max="1.5"
            :step="0.1"
            :show-tooltip="false"
            style="width: 160px"
            @change="handleZoomChange"
          />
          <span class="settings-row__value">{{ getNum('app.zoomLevel').toFixed(1) }}x</span>
          <el-button
            v-if="getNum('app.zoomLevel') !== 1.0"
            size="small"
            @click="handleZoomChange(1.0)"
          >
            重置
          </el-button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">紧凑模式</label>
          <span class="settings-row__desc">减小界面间距，适合小屏幕</span>
        </div>
        <el-switch
          :model-value="getBool('app.compactMode')"
          @change="(v: unknown) => set('app.compactMode', v)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useUiStore } from '../../stores/ui.store'
import type { AppTheme } from '../../stores/ui.store'
import { useSettingsStore } from '../../stores/settings.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'
import { IPC_WINDOW } from '@shared/types/ipc-channels'

const uiStore = useUiStore()
const settingsStore = useSettingsStore()

function getStr(key: string): string {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return String(v ?? '')
}

function getNum(key: string): number {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return Number(v) || 0
}

function getBool(key: string): boolean {
  const v = settingsStore.settings.has(key) ? settingsStore.settings.get(key) : DEFAULT_SETTINGS[key]
  return !!v
}

function set(key: string, value: unknown): void {
  settingsStore.setSetting(key, value)
}

function handleThemeChange(val: string | number | boolean | undefined): void {
  uiStore.setTheme(val as AppTheme)
}

function handleZoomChange(val: unknown): void {
  const level = Number(val) || 1.0
  set('app.zoomLevel', level)
  window.electronAPI?.ipc.invoke(IPC_WINDOW.SET_ZOOM, level)
}

onMounted(async () => {
  await Promise.all([
    settingsStore.getSetting('app.language'),
    settingsStore.getSetting('app.zoomLevel'),
    settingsStore.getSetting('app.compactMode'),
  ])
})
</script>

<style lang="scss" scoped>
.appearance-settings {
  max-width: 680px;

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

.settings-block {
  margin-bottom: 32px;

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider);
  }
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  min-height: 48px;

  &__info {
    flex: 1;
    margin-right: 24px;
  }

  &__label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__slider-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 32px;
    text-align: right;
  }
}
</style>
