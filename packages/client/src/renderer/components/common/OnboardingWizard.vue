<template>
  <!-- 首次启动引导向导 -->
  <Teleport to="body">
    <Transition name="st-fade-slow">
      <div class="onboarding-overlay">
        <Transition name="st-scale" mode="out-in">
          <div class="onboarding-card" :key="currentStep">
            <!-- 步骤 1：欢迎 + 导入 SSH 配置 -->
            <div v-if="currentStep === 1" class="onboarding-step">
              <div class="onboarding-step__icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="12" fill="rgba(99,102,241,0.15)" />
                  <path d="M14 24h20M24 14l10 10-10 10" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
              <h1 class="onboarding-step__title">欢迎使用 STerminal</h1>
              <p class="onboarding-step__desc">跨平台终端管理工具，让服务器管理更简单</p>

              <div class="onboarding-step__action-group">
                <div class="onboarding-import-card" :class="{ 'is-success': importResult !== null }">
                  <div class="onboarding-import-card__content">
                    <div class="onboarding-import-card__icon">
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M3 5h14M3 10h9M3 15h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                      </svg>
                    </div>
                    <div class="onboarding-import-card__text">
                      <div class="onboarding-import-card__label">导入 OpenSSH 配置</div>
                      <div class="onboarding-import-card__hint">
                        <template v-if="importResult === null && !importError">从 ~/.ssh/config 自动导入主机配置</template>
                        <template v-else-if="importResult !== null">已找到 {{ importResult }} 台主机，将在完成向导后导入</template>
                        <template v-else>{{ importError }}</template>
                      </div>
                    </div>
                  </div>
                  <el-button
                    v-if="importResult === null"
                    class="onboarding-import-card__btn"
                    :loading="importing"
                    size="small"
                    @click="handleImportSshConfig"
                  >
                    导入
                  </el-button>
                  <div v-else class="onboarding-import-card__check">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8l3.5 3.5L13 4" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <div class="onboarding-step__footer">
                <el-button text @click="nextStep">跳过</el-button>
                <el-button type="primary" class="onboarding-primary-btn" @click="nextStep">下一步</el-button>
              </div>
            </div>

            <!-- 步骤 2：选择主题 -->
            <div v-else-if="currentStep === 2" class="onboarding-step">
              <div class="onboarding-step__icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="12" fill="rgba(99,102,241,0.15)" />
                  <circle cx="24" cy="24" r="10" stroke="#6366f1" stroke-width="2.5" />
                  <circle cx="24" cy="24" r="4" fill="#6366f1" />
                </svg>
              </div>
              <h2 class="onboarding-step__title">选择界面风格</h2>
              <p class="onboarding-step__desc">选择你喜欢的外观主题</p>

              <div class="onboarding-theme-grid">
                <div
                  v-for="theme in appThemeOptions"
                  :key="theme.id"
                  class="onboarding-theme-card"
                  :class="{ 'is-active': selectedAppTheme === theme.id }"
                  @click="selectAppTheme(theme.id)"
                >
                  <div class="onboarding-theme-card__preview" :style="theme.previewStyle">
                    <div class="onboarding-theme-card__preview-bar" :style="theme.barStyle" />
                    <div class="onboarding-theme-card__preview-lines">
                      <div class="line" :style="{ background: theme.lineColor, opacity: 0.6, width: '70%' }" />
                      <div class="line" :style="{ background: theme.lineColor, opacity: 0.4, width: '50%' }" />
                      <div class="line" :style="{ background: theme.lineColor, opacity: 0.3, width: '60%' }" />
                    </div>
                  </div>
                  <div class="onboarding-theme-card__label">{{ theme.label }}</div>
                  <div v-if="selectedAppTheme === theme.id" class="onboarding-theme-card__check">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l2.5 2.5L10 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                </div>
              </div>

              <div class="onboarding-terminal-theme">
                <label class="onboarding-terminal-theme__label">终端配色</label>
                <el-select
                  v-model="selectedTerminalTheme"
                  size="small"
                  class="onboarding-terminal-theme__select"
                  @change="applyTerminalTheme"
                >
                  <el-option
                    v-for="t in terminalThemeOptions"
                    :key="t.id"
                    :label="t.name"
                    :value="t.id"
                  />
                </el-select>
              </div>

              <div class="onboarding-step__footer">
                <el-button text @click="prevStep">上一步</el-button>
                <el-button type="primary" class="onboarding-primary-btn" @click="nextStep">下一步</el-button>
              </div>
            </div>

            <!-- 步骤 3：完成 -->
            <div v-else-if="currentStep === 3" class="onboarding-step">
              <div class="onboarding-step__icon onboarding-step__icon--success">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="12" fill="rgba(34,197,94,0.15)" />
                  <path d="M14 24l6 6 14-14" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </div>
              <h2 class="onboarding-step__title">一切就绪！</h2>
              <p class="onboarding-step__desc">开始使用 STerminal，高效管理你的服务器</p>

              <div class="onboarding-quick-actions">
                <button class="onboarding-action-card" @click="handleCreateSshConnection">
                  <div class="onboarding-action-card__icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                  <div class="onboarding-action-card__text">
                    <div class="onboarding-action-card__title">创建 SSH 连接</div>
                    <div class="onboarding-action-card__hint">添加远程服务器主机配置</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="onboarding-action-card__arrow">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>

                <button class="onboarding-action-card" @click="handleOpenLocalTerminal">
                  <div class="onboarding-action-card__icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M4 17l6-6-6-6M12 19h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </div>
                  <div class="onboarding-action-card__text">
                    <div class="onboarding-action-card__title">打开本地终端</div>
                    <div class="onboarding-action-card__hint">在本地运行命令和脚本</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" class="onboarding-action-card__arrow">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>

              <div class="onboarding-step__footer onboarding-step__footer--center">
                <el-button type="primary" class="onboarding-primary-btn onboarding-primary-btn--wide" @click="handleComplete">
                  开始使用
                </el-button>
              </div>
            </div>
          </div>
        </Transition>

        <!-- 步骤指示器 -->
        <div class="onboarding-dots">
          <button
            v-for="n in 3"
            :key="n"
            class="onboarding-dot"
            :class="{ 'is-active': currentStep === n }"
            @click="currentStep = n"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '../../stores/ui.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useSessionsStore } from '../../stores/sessions.store'
import { TERMINAL_THEME_PRESETS } from '@shared/constants/terminal-themes'
import type { AppTheme } from '../../stores/ui.store'

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const uiStore = useUiStore()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()

// ===== 步骤管理 =====
const currentStep = ref(1)

function nextStep(): void {
  if (currentStep.value < 3) currentStep.value++
}

function prevStep(): void {
  if (currentStep.value > 1) currentStep.value--
}

// ===== 步骤 1：SSH 配置导入 =====
const importing = ref(false)
const importResult = ref<number | null>(null)
const importError = ref<string>('')
let parsedHosts: unknown[] = []

async function handleImportSshConfig(): Promise<void> {
  importing.value = true
  importError.value = ''
  try {
    const hosts = await window.electronAPI?.ipc.invoke('system:parse-ssh-config') as unknown[]
    if (Array.isArray(hosts) && hosts.length > 0) {
      parsedHosts = hosts
      importResult.value = hosts.length
    } else {
      importError.value = '未找到 SSH 配置，或配置文件为空'
    }
  } catch {
    importError.value = 'SSH 配置导入将在后续版本支持'
  } finally {
    importing.value = false
  }
}

// ===== 步骤 2：主题选择 =====

interface AppThemeOption {
  id: AppTheme
  label: string
  previewStyle: Record<string, string>
  barStyle: Record<string, string>
  lineColor: string
}

const appThemeOptions: AppThemeOption[] = [
  {
    id: 'dark',
    label: '深色',
    previewStyle: { background: '#1a1b2e', borderColor: 'rgba(99,102,241,0.3)' },
    barStyle: { background: '#16172a' },
    lineColor: '#e2e8f0',
  },
  {
    id: 'light',
    label: '浅色',
    previewStyle: { background: '#f8f9fc', borderColor: 'rgba(99,102,241,0.3)' },
    barStyle: { background: '#eef0f5' },
    lineColor: '#1e293b',
  },
  {
    id: 'system',
    label: '跟随系统',
    previewStyle: { background: 'linear-gradient(135deg, #1a1b2e 50%, #f8f9fc 50%)', borderColor: 'rgba(99,102,241,0.3)' },
    barStyle: { background: 'transparent' },
    lineColor: '#8b9abe',
  },
]

const selectedAppTheme = ref<AppTheme>('dark')

function selectAppTheme(themeId: AppTheme): void {
  selectedAppTheme.value = themeId
  uiStore.setTheme(themeId)
}

const terminalThemeOptions = TERMINAL_THEME_PRESETS.map(t => ({ id: t.id, name: t.name }))
const selectedTerminalTheme = ref('sterminal-dark')

function applyTerminalTheme(themeId: string): void {
  settingsStore.setSetting('terminal.theme', themeId)
}

// ===== 步骤 3：快速操作 =====

function handleCreateSshConnection(): void {
  uiStore.openHostConfigDialog()
  handleComplete()
}

function handleOpenLocalTerminal(): void {
  sessionsStore.createTab()
  handleComplete()
}

// ===== 完成 =====

async function handleComplete(): Promise<void> {
  // 如果有解析到的主机，通过 IPC 批量导入
  if (parsedHosts.length > 0) {
    try {
      await window.electronAPI?.ipc.invoke('system:import-ssh-hosts', parsedHosts)
    } catch {
      // 静默忽略导入失败
    }
  }
  emit('complete')
}
</script>

<style scoped lang="scss">
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

.onboarding-card {
  width: 100%;
  max-width: 520px;
  background: var(--bg-secondary, #16172a);
  border: 1px solid var(--border-primary, rgba(99, 102, 241, 0.2));
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.1);
  padding: 40px;
  margin: 0 16px;

  :global(html[data-theme='light']) & {
    background: #ffffff;
    border-color: rgba(99, 102, 241, 0.15);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(99, 102, 241, 0.1);
  }
}

// ===== Step layout =====
.onboarding-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.onboarding-step__icon {
  margin-bottom: 20px;
}

.onboarding-step__title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #e2e8f0);
  margin: 0 0 8px;
  text-align: center;
  letter-spacing: -0.3px;
}

.onboarding-step__desc {
  font-size: 14px;
  color: var(--text-secondary, #94a3b8);
  margin: 0 0 28px;
  text-align: center;
  line-height: 1.6;
}

.onboarding-step__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
  margin-top: 28px;

  &--center {
    justify-content: center;
  }
}

// ===== Primary button =====
.onboarding-primary-btn {
  --el-button-bg-color: #6366f1;
  --el-button-border-color: #6366f1;
  --el-button-hover-bg-color: #5254cc;
  --el-button-hover-border-color: #5254cc;
  --el-button-active-bg-color: #4749b5;
  font-weight: 500;

  &--wide {
    min-width: 140px;
  }
}

// ===== Step 1: SSH Import Card =====
.onboarding-step__action-group {
  width: 100%;
}

.onboarding-import-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  transition: border-color 0.2s;

  &.is-success {
    border-color: rgba(34, 197, 94, 0.3);
    background: rgba(34, 197, 94, 0.05);
  }
}

.onboarding-import-card__content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.onboarding-import-card__icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 8px;
  color: #6366f1;
}

.onboarding-import-card__text {
  min-width: 0;
}

.onboarding-import-card__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  margin-bottom: 2px;
}

.onboarding-import-card__hint {
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.onboarding-import-card__check {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 197, 94, 0.15);
  border-radius: 50%;
}

// ===== Step 2: Theme Grid =====
.onboarding-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
  margin-bottom: 20px;
}

.onboarding-theme-card {
  position: relative;
  cursor: pointer;
  border-radius: 10px;
  border: 2px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  overflow: hidden;
  transition: border-color 0.2s, transform 0.15s;
  user-select: none;

  &:hover {
    border-color: rgba(99, 102, 241, 0.4);
    transform: translateY(-1px);
  }

  &.is-active {
    border-color: #6366f1;
  }
}

.onboarding-theme-card__preview {
  height: 72px;
  display: flex;
  flex-direction: column;
  padding: 6px;
  gap: 4px;
}

.onboarding-theme-card__preview-bar {
  height: 8px;
  border-radius: 3px;
  opacity: 0.6;
}

.onboarding-theme-card__preview-lines {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 2px;
}

.line {
  height: 5px;
  border-radius: 2px;
}

.onboarding-theme-card__label {
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
  text-align: center;
}

.onboarding-theme-card__check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  background: #6366f1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

// ===== Terminal theme selector =====
.onboarding-terminal-theme {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.onboarding-terminal-theme__label {
  font-size: 13px;
  color: var(--text-secondary, #94a3b8);
  white-space: nowrap;
}

.onboarding-terminal-theme__select {
  flex: 1;
}

// ===== Step 3: Quick actions =====
.onboarding-quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.onboarding-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
  text-align: left;
  width: 100%;

  &:hover {
    background: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.onboarding-action-card__icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 10px;
  color: #6366f1;
}

.onboarding-action-card__text {
  flex: 1;
  min-width: 0;
}

.onboarding-action-card__title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary, #e2e8f0);
  margin-bottom: 2px;
}

.onboarding-action-card__hint {
  font-size: 12px;
  color: var(--text-secondary, #94a3b8);
}

.onboarding-action-card__arrow {
  flex-shrink: 0;
  color: var(--text-tertiary, #64748b);
}

// ===== Step indicator dots =====
.onboarding-dots {
  display: flex;
  gap: 8px;
}

.onboarding-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;

  &.is-active {
    background: #6366f1;
    transform: scale(1.25);
  }

  &:hover:not(.is-active) {
    background: rgba(255, 255, 255, 0.4);
  }
}
</style>
