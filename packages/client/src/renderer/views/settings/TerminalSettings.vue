<template>
  <div class="terminal-settings">
    <h3 class="section-title">终端</h3>
    <p class="section-desc">配置终端外观和行为，修改后立即生效。</p>

    <!-- ===== 外观 ===== -->
    <div class="settings-block">
      <h4 class="settings-block__title">外观</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">终端字体</label>
          <span class="settings-row__desc">仅影响终端窗口，不影响界面其他区域</span>
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
          <label class="settings-row__label">终端字号</label>
          <span class="settings-row__desc">终端窗口中的字体大小（8-32px），不影响界面字号</span>
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
          <label class="settings-row__label">终端行高</label>
          <span class="settings-row__desc">终端窗口行距倍数（1.0-2.0）</span>
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
          <label class="settings-row__label">光标样式</label>
          <span class="settings-row__desc">终端光标的显示形态</span>
        </div>
        <el-radio-group
          :model-value="getStr('terminal.cursorStyle')"
          @change="(v: unknown) => set('terminal.cursorStyle', v)"
        >
          <el-radio-button value="block">方块</el-radio-button>
          <el-radio-button value="underline">下划线</el-radio-button>
          <el-radio-button value="bar">竖线</el-radio-button>
        </el-radio-group>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">光标闪烁</label>
          <span class="settings-row__desc">光标是否闪烁</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.cursorBlink')"
          @change="(v: unknown) => set('terminal.cursorBlink', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">滚动缓冲区</label>
          <span class="settings-row__desc">终端可回滚的最大行数</span>
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
      <h4 class="settings-block__title">行为</h4>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">选中即复制</label>
          <span class="settings-row__desc">鼠标选中文本后自动复制到剪贴板</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.copyOnSelect')"
          @change="(v: unknown) => set('terminal.copyOnSelect', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">复制保留格式</label>
          <span class="settings-row__desc">复制时保留终端文本的颜色和样式</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.copyWithFormat')"
          @change="(v: unknown) => set('terminal.copyWithFormat', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">右键行为</label>
          <span class="settings-row__desc">在终端区域右键点击的操作</span>
        </div>
        <el-select
          :model-value="getStr('terminal.rightClickAction')"
          style="width: 160px"
          @change="(v: unknown) => set('terminal.rightClickAction', v)"
        >
          <el-option label="粘贴" value="paste" />
          <el-option label="右键菜单" value="contextMenu" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">粘贴换行警告</label>
          <span class="settings-row__desc">粘贴的内容包含换行符时弹出确认</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.pasteWarning')"
          @change="(v: unknown) => set('terminal.pasteWarning', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">粘贴去尾换行</label>
          <span class="settings-row__desc">粘贴时自动去除末尾多余的换行符</span>
        </div>
        <el-switch
          :model-value="getBool('terminal.trimPasteNewlines')"
          @change="(v: unknown) => set('terminal.trimPasteNewlines', v)"
        />
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">响铃</label>
          <span class="settings-row__desc">终端收到 BEL 字符时的反馈方式</span>
        </div>
        <el-select
          :model-value="getStr('terminal.bell')"
          style="width: 160px"
          @change="(v: unknown) => set('terminal.bell', v)"
        >
          <el-option label="无" value="none" />
          <el-option label="声音" value="sound" />
          <el-option label="视觉闪烁" value="visual" />
          <el-option label="声音 + 视觉" value="both" />
        </el-select>
      </div>

      <div class="settings-row">
        <div class="settings-row__info">
          <label class="settings-row__label">滚动灵敏度</label>
          <span class="settings-row__desc">鼠标滚轮滚动的速度倍数</span>
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
          <label class="settings-row__label">焦点跟随鼠标</label>
          <span class="settings-row__desc">鼠标移入分屏区域时自动聚焦该终端</span>
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
import { useSettingsStore } from '../../stores/settings.store'
import { DEFAULT_SETTINGS } from '@shared/constants/defaults'

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
