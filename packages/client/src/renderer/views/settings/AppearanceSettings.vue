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

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.terminalTheme') }}</label>
          <span class="settings-row__desc">{{ t('settings.terminalThemeDesc') }}</span>
        </div>
        <el-select v-model="terminalTheme" @change="handleTerminalThemeChange" style="width: 200px">
          <el-option
            v-for="theme in allTerminalThemes"
            :key="theme.id"
            :label="theme.name"
            :value="theme.id"
          />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.accentColor') }}</label>
          <span class="settings-row__desc">{{ t('settings.accentColorDesc') }}</span>
        </div>
        <el-color-picker v-model="accentColor" @change="handleAccentColorChange" :predefine="presetColors" />
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

    <!-- ===== 导出 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.exportTerminalThemeSection') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.exportTerminalTheme') }}</label>
          <span class="settings-row__desc">{{ t('settings.exportTerminalThemeDesc') }}</span>
        </div>
        <el-button
          :loading="exporting"
          @click="handleExportTheme"
        >
          {{ t('settings.exportTerminalThemeBtn') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { useUiStore } from '../../stores/ui.store'
import type { AppTheme } from '../../stores/ui.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useThemesStore } from '../../stores/themes.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'
import { IPC_WINDOW } from '@shared/types/ipc-channels'

const { t, locale } = useI18n()
const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const themesStore = useThemesStore()

const allTerminalThemes = computed(() => themesStore.allTerminalThemes)

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

// ===== 终端主题 =====

const terminalTheme = ref('sterminal-dark')

function handleTerminalThemeChange(val: unknown): void {
  set('terminal.theme', String(val))
}

// ===== 强调色 =====

const accentColor = ref('#6366f1')
const presetColors = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6',
]

function handleAccentColorChange(val: unknown): void {
  const color = String(val ?? '#6366f1')
  set('app.accentColor', color)
  themesStore.applyCustomCssOverrides({ '--accent': color })
}

onMounted(async () => {
  await Promise.all([
    settingsStore.getSetting('app.language'),
    settingsStore.getSetting('app.zoomLevel'),
    settingsStore.getSetting('app.compactMode'),
    settingsStore.getSetting('terminal.theme'),
    settingsStore.getSetting('app.accentColor'),
    themesStore.loadCustomThemes(),
  ])
  // 从 store 初始化本地 ref
  zoomLevel.value = getNum('app.zoomLevel') || 1.0
  terminalTheme.value = getStr('terminal.theme') || 'sterminal-dark'
  accentColor.value = getStr('app.accentColor') || '#6366f1'
})

// ===== 导出终端主题 =====

const exporting = ref(false)

async function handleExportTheme(): Promise<void> {
  exporting.value = true
  try {
    const themeId = getStr('terminal.theme') || 'sterminal-dark'
    const preset = themesStore.findTheme(themeId)
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'STerminal',
      type: 'terminal-theme',
      theme: {
        id: preset.id,
        name: preset.name,
        type: preset.type,
        colors: preset.colors,
      },
    }
    const json = JSON.stringify(exportData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sterminal-theme-${preset.id}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success(t('settings.exportTerminalThemeSuccess'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('settings.exportTerminalThemeFailed'))
  } finally {
    exporting.value = false
  }
}
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
