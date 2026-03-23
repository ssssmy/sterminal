<template>
  <div class="appearance-settings">
    <h3 class="section-title">{{ t('settings.appearance_section') }}</h3>
    <p class="section-desc">{{ t('settings.appearance_desc') }}</p>

    <!-- ===== 主题 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.themeSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.uiTheme') }}</label>
          <span class="settings-row__desc">{{ t('settings.uiThemeDesc') }}</span>
        </div>
        <el-radio-group :model-value="uiStore.theme" @change="handleThemeChange">
          <el-radio-button value="dark">{{ t('settings.themeDark') }}</el-radio-button>
          <el-radio-button value="light">{{ t('settings.themeLight') }}</el-radio-button>
          <el-radio-button value="system">{{ t('settings.themeSystem') }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- ===== 界面 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.uiSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.language') }}</label>
          <span class="settings-row__desc">{{ t('settings.languageDesc') }}</span>
        </div>
        <el-select
          :model-value="getStr('app.language')"
          style="width: 180px"
          @change="handleLanguageChange"
        >
          <el-option label="简体中文" value="zh-CN" />
          <el-option label="English" value="en" />
          <el-option label="繁體中文" value="zh-TW" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.zoomLevel') }}</label>
          <span class="settings-row__desc">{{ t('settings.zoomLevelDesc') }}</span>
        </div>
        <div class="settings-row__slider-group">
          <el-slider
            v-model="zoomLevel"
            :min="0.8"
            :max="1.5"
            :step="0.1"
            :show-tooltip="false"
            style="width: 160px"
            @change="handleZoomChange"
          />
          <span class="settings-row__value">{{ zoomLevel.toFixed(1) }}x</span>
          <el-button
            v-if="zoomLevel !== 1.0"
            size="small"
            @click="handleZoomChange(1.0)"
          >
            {{ t('settings.resetZoom') }}
          </el-button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.compactMode') }}</label>
          <span class="settings-row__desc">{{ t('settings.compactModeDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('app.compactMode')"
          @change="handleCompactChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../../stores/ui.store'
import type { AppTheme } from '../../stores/ui.store'
import { useSettingsStore } from '../../stores/settings.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'
import { IPC_WINDOW } from '@shared/types/ipc-channels'

const { t, locale } = useI18n()
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

function handleLanguageChange(val: unknown): void {
  const lang = String(val)
  set('app.language', lang)
  locale.value = lang
}

function handleCompactChange(val: unknown): void {
  const compact = !!val
  set('app.compactMode', compact)
  document.documentElement.classList.toggle('compact', compact)
}

const zoomLevel = ref(1.0)

function handleZoomChange(val: unknown): void {
  const level = Number(val) || 1.0
  zoomLevel.value = level
  set('app.zoomLevel', level)
  window.electronAPI?.ipc.invoke(IPC_WINDOW.SET_ZOOM, level)
}

onMounted(async () => {
  await Promise.all([
    settingsStore.getSetting('app.language'),
    settingsStore.getSetting('app.zoomLevel'),
    settingsStore.getSetting('app.compactMode'),
  ])
  // 从 store 初始化本地 ref
  zoomLevel.value = getNum('app.zoomLevel') || 1.0
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
