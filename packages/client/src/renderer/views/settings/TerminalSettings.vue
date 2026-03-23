<template>
  <div class="terminal-settings">
    <h3 class="section-title">{{ t('settings.terminal_section') }}</h3>
    <p class="section-desc">{{ t('settings.terminal_desc') }}</p>

    <!-- ===== 外观 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.terminalAppearance') }}</h4>

      <!-- 终端主题 -->
      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.terminalTheme') }}</label>
          <span class="settings-row__desc">{{ t('settings.terminalThemeDesc') }}</span>
        </div>
        <el-select
          :model-value="getStr('terminal.theme')"
          style="width: 240px"
          @change="(v: unknown) => set('terminal.theme', v)"
        >
          <el-option
            v-for="preset in terminalThemePresets"
            :key="preset.id"
            :value="preset.id"
          >
            <div class="theme-option">
              <div class="theme-option__swatches">
                <span
                  class="theme-option__swatch"
                  :style="{ background: preset.colors.background }"
                />
                <span
                  class="theme-option__swatch"
                  :style="{ background: preset.colors.foreground }"
                />
                <span
                  class="theme-option__swatch"
                  :style="{ background: preset.colors.cursor }"
                />
                <span
                  class="theme-option__swatch"
                  :style="{ background: preset.colors.green }"
                />
              </div>
              <span class="theme-option__name">{{ preset.name }}</span>
            </div>
          </el-option>
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.fontFamily') }}</label>
          <span class="settings-row__desc">{{ t('settings.fontFamilyDesc') }}</span>
        </div>
        <el-select
          :model-value="getStr('terminal.fontFamily')"
          filterable
          allow-create
          style="width: 240px"
          @change="(v: unknown) => set('terminal.fontFamily', v)"
        >
          <el-option label="JetBrains Mono" value="'JetBrains Mono', monospace" />
          <el-option label="Fira Code" value="'Fira Code', monospace" />
          <el-option label="Cascadia Code" value="'Cascadia Code', monospace" />
          <el-option label="Menlo" value="Menlo, monospace" />
          <el-option label="Consolas" value="Consolas, monospace" />
          <el-option label="Source Code Pro" value="'Source Code Pro', monospace" />
          <el-option label="Monaco" value="Monaco, monospace" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.fontSize') }}</label>
          <span class="settings-row__desc">{{ t('settings.fontSizeDesc') }}</span>
        </div>
        <div class="settings-row__slider-group">
          <el-slider
            :model-value="getNum('terminal.fontSize')"
            :min="8"
            :max="32"
            :step="1"
            :show-tooltip="false"
            style="width: 160px"
            @input="(v: unknown) => set('terminal.fontSize', v)"
          />
          <el-input-number
            :model-value="getNum('terminal.fontSize')"
            :min="8"
            :max="32"
            :step="1"
            controls-position="right"
            style="width: 90px"
            @change="(v: unknown) => v != null && set('terminal.fontSize', v)"
          />
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.lineHeight') }}</label>
          <span class="settings-row__desc">{{ t('settings.lineHeightDesc') }}</span>
        </div>
        <div class="settings-row__slider-group">
          <el-slider
            :model-value="getNum('terminal.lineHeight')"
            :min="1.0"
            :max="2.0"
            :step="0.1"
            :show-tooltip="false"
            style="width: 160px"
            @input="(v: unknown) => set('terminal.lineHeight', v)"
          />
          <span class="settings-row__value">{{ (getNum('terminal.lineHeight')).toFixed(1) }}</span>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.cursorStyle') }}</label>
          <span class="settings-row__desc">{{ t('settings.cursorStyleDesc') }}</span>
        </div>
        <el-radio-group
          :model-value="getStr('terminal.cursorStyle')"
          @change="(v: unknown) => set('terminal.cursorStyle', v)"
        >
          <el-radio-button value="block">{{ t('settings.cursorBlock') }}</el-radio-button>
          <el-radio-button value="underline">{{ t('settings.cursorUnderline') }}</el-radio-button>
          <el-radio-button value="bar">{{ t('settings.cursorBar') }}</el-radio-button>
        </el-radio-group>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.cursorBlink') }}</label>
          <span class="settings-row__desc">{{ t('settings.cursorBlinkDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.cursorBlink')"
          @change="(v: unknown) => set('terminal.cursorBlink', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.scrollback') }}</label>
          <span class="settings-row__desc">{{ t('settings.scrollbackDesc') }}</span>
        </div>
        <el-input-number
          :model-value="getNum('terminal.scrollback')"
          :min="500"
          :max="100000"
          :step="500"
          controls-position="right"
          style="width: 140px"
          @change="(v: unknown) => v != null && set('terminal.scrollback', v)"
        />
      </div>
    </div>

    <!-- ===== 行为 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">{{ t('settings.terminalBehavior') }}</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.rightClickPaste') }}</label>
          <span class="settings-row__desc">{{ t('settings.rightClickPasteDesc') }}</span>
        </div>
        <el-switch
          :model-value="getStr('terminal.rightClickAction') === 'paste'"
          @change="(v: unknown) => set('terminal.rightClickAction', v ? 'paste' : 'none')"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.pasteWarning') }}</label>
          <span class="settings-row__desc">{{ t('settings.pasteWarningDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.pasteWarning')"
          @change="(v: unknown) => set('terminal.pasteWarning', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.trimPasteNewlines') }}</label>
          <span class="settings-row__desc">{{ t('settings.trimPasteNewlinesDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.trimPasteNewlines')"
          @change="(v: unknown) => set('terminal.trimPasteNewlines', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.bell') }}</label>
          <span class="settings-row__desc">{{ t('settings.bellDesc') }}</span>
        </div>
        <el-select
          :model-value="getStr('terminal.bell')"
          style="width: 160px"
          @change="(v: unknown) => set('terminal.bell', v)"
        >
          <el-option :label="t('settings.bellNone')" value="none" />
          <el-option :label="t('settings.bellSound')" value="sound" />
          <el-option :label="t('settings.bellVisual')" value="visual" />
          <el-option :label="t('settings.bellBoth')" value="both" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.scrollSensitivity') }}</label>
          <span class="settings-row__desc">{{ t('settings.scrollSensitivityDesc') }}</span>
        </div>
        <div class="settings-row__slider-group">
          <el-slider
            :model-value="getNum('terminal.scrollSensitivity')"
            :min="1"
            :max="10"
            :step="1"
            :show-tooltip="false"
            style="width: 160px"
            @input="(v: unknown) => set('terminal.scrollSensitivity', v)"
          />
          <span class="settings-row__value">{{ getNum('terminal.scrollSensitivity') }}x</span>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">{{ t('settings.focusFollowMouse') }}</label>
          <span class="settings-row__desc">{{ t('settings.focusFollowMouseDesc') }}</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.focusFollowMouse')"
          @change="(v: unknown) => set('terminal.focusFollowMouse', v)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'
import { TERMINAL_THEME_PRESETS } from '@shared/constants/terminal-themes'

const terminalThemePresets = TERMINAL_THEME_PRESETS

const { t } = useI18n()

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

onMounted(async () => {
  // 预加载终端相关设置到缓存
  const keys = Object.keys(DEFAULT_SETTINGS).filter(k => k.startsWith('terminal.'))
  await Promise.all(keys.map(k => settingsStore.getSetting(k)))
})
</script>

<style lang="scss" scoped>
.terminal-settings {
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

.theme-option {
  display: flex;
  align-items: center;
  gap: 10px;

  &__swatches {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  &__swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  &__name {
    font-size: 13px;
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
