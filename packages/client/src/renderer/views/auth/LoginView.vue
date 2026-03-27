<template>
  <div class="login-page">
    <!-- 左侧品牌区 -->
    <div class="login-brand">
      <div class="login-brand__top">
        <div class="login-brand__logo">
          <div class="login-brand__icon">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <path d="M4 8L10 14L4 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M13 20H24" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <span class="login-brand__name">STerminal</span>
        </div>
        <p class="login-brand__tagline">{{ t('loginView.subtitle') }}</p>
      </div>

      <div class="login-brand__features">
        <div class="login-brand__feature">
          <div class="login-brand__feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </div>
          <div class="login-brand__feature-text">
            <span class="login-brand__feature-title">SSH / SFTP {{ t('loginView.featConnTitle') }}</span>
            <span class="login-brand__feature-desc">{{ t('loginView.featConnDesc') }}</span>
          </div>
        </div>
        <div class="login-brand__feature">
          <div class="login-brand__feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
            </svg>
          </div>
          <div class="login-brand__feature-text">
            <span class="login-brand__feature-title">{{ t('loginView.featSyncTitle') }}</span>
            <span class="login-brand__feature-desc">{{ t('loginView.featSyncDesc') }}</span>
          </div>
        </div>
        <div class="login-brand__feature">
          <div class="login-brand__feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="login-brand__feature-text">
            <span class="login-brand__feature-title">{{ t('loginView.featCrossTitle') }}</span>
            <span class="login-brand__feature-desc">{{ t('loginView.featCrossDesc') }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧表单区 -->
    <div class="login-form-panel">
      <div class="login-form-panel__inner">
        <h2 class="login-form-panel__title">{{ t('loginView.loginBtn') }}</h2>
        <p class="login-form-panel__subtitle">{{ t('loginView.welcomeBack') }}</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="email">
            <label class="field-label">{{ t('loginView.emailLabel') }}</label>
            <el-input v-model="form.email" :placeholder="t('loginView.emailPlaceholder')" :prefix-icon="Message" autocomplete="email" />
          </el-form-item>

          <el-form-item prop="password">
            <label class="field-label">{{ t('loginView.passwordLabel') }}</label>
            <el-input v-model="form.password" type="password" :placeholder="t('loginView.passwordPlaceholder')" :prefix-icon="Lock" show-password autocomplete="current-password" />
          </el-form-item>

          <div class="login-form__options">
            <el-checkbox v-model="form.remember">{{ t('loginView.rememberMe') }}</el-checkbox>
            <el-link @click="handleForgotPassword">{{ t('loginView.forgotPassword') }}</el-link>
          </div>

          <el-button type="primary" :loading="loading" class="login-form__submit" native-type="submit">
            {{ t('loginView.loginBtn') }}
          </el-button>

          <el-button class="login-form__offline" @click="handleOfflineMode">
            {{ t('loginView.offlineMode') }}
          </el-button>

          <!-- 服务器设置（折叠） -->
          <div class="login-form__server">
            <el-link :underline="false" class="login-form__server-toggle" @click="showServerUrl = !showServerUrl">
              <el-icon :size="13"><Setting /></el-icon>
              {{ t('loginView.serverSettings') }}
              <el-icon :size="12"><ArrowDown v-if="!showServerUrl" /><ArrowUp v-else /></el-icon>
            </el-link>
            <el-collapse-transition>
              <div v-show="showServerUrl" class="login-form__server-input">
                <label class="field-label">{{ t('loginView.serverUrl') }}</label>
                <el-input v-model="serverUrl" placeholder="http://localhost:3000" clearable @change="handleServerUrlChange">
                  <template #append>
                    <el-button :loading="testingServer" @click="handleTestServer">
                      {{ t('loginView.testConnection') }}
                    </el-button>
                  </template>
                </el-input>
                <span class="login-form__server-hint">{{ t('loginView.serverUrlHint') }}</span>
              </div>
            </el-collapse-transition>
          </div>

          <div class="login-form__divider"><span>{{ t('loginView.or') }}</span></div>

          <div class="login-form__oauth">
            <el-button class="oauth-btn" @click="handleOAuth('github')">
              <template #icon>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
              </template>
              GitHub
            </el-button>
            <el-button class="oauth-btn" @click="handleOAuth('google')">
              <template #icon>
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.31a3.68 3.68 0 01-1.6 2.42v2.01h2.59c1.52-1.4 2.39-3.45 2.39-5.9z" fill="#4285F4"/><path d="M8 16c2.16 0 3.97-.72 5.29-1.93l-2.59-2.01c-.71.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.28H.86v2.07A8 8 0 008 16z" fill="#34A853"/><path d="M3.53 9.54A4.81 4.81 0 013.28 8c0-.53.09-1.04.25-1.54V4.39H.86A8 8 0 000 8c0 1.29.31 2.51.86 3.61l2.67-2.07z" fill="#FBBC05"/><path d="M8 3.18c1.17 0 2.22.4 3.05 1.2l2.28-2.28C11.97.72 10.16 0 8 0A8 8 0 00.86 4.39l2.67 2.07C4.16 4.58 5.92 3.18 8 3.18z" fill="#EA4335"/></svg>
              </template>
              Google
            </el-button>
          </div>
        </el-form>

        <div class="login-form-panel__footer">
          <span>{{ t('loginView.noAccount') }}</span>
          <router-link to="/register">{{ t('loginView.registerLink') }}</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Message, Lock, Setting, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth.store'
import { api } from '../../services/api'
import { normalizeServerUrl } from '../../../shared/utils/server-url'
import { IPC_SERVER } from '../../../shared/types/ipc-channels'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({ email: '', password: '', remember: true })

const rules: FormRules = {
  email: [
    { required: true, message: t('loginView.validEmailRequired'), trigger: 'blur' },
    { type: 'email', message: t('loginView.validEmailFormat'), trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: t('loginView.validPasswordRequired'), trigger: 'blur' },
  ],
}

async function handleLogin(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await authStore.login(form.email, form.password, form.remember)
    ElMessage.success(t('loginView.loginSuccess'))
    router.push('/')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('loginView.loginFailed'))
  } finally {
    loading.value = false
  }
}

function handleForgotPassword(): void {
  ElMessage.info(t('loginView.forgotPasswordTip'))
}

function handleOfflineMode(): void {
  router.push('/')
}

function handleOAuth(provider: 'github' | 'google'): void {
  ElMessage.info(t('loginView.oauthTip', { provider: provider === 'github' ? 'GitHub' : 'Google' }))
}

// ===== 服务器设置 =====
const showServerUrl = ref(false)
const serverUrl = ref(api.getServerUrl())
const testingServer = ref(false)

function handleServerUrlChange(): void {
  const url = serverUrl.value.trim()
  if (!url) return
  try {
    new URL(url)
  } catch {
    ElMessage.error(t('loginView.invalidUrl'))
    return
  }
  api.setServerUrl(url)
  api.setToken(null)
  window.electronAPI?.ipc.invoke(IPC_SERVER.SET_URL, url)
}

async function handleTestServer(): Promise<void> {
  handleServerUrlChange()
  testingServer.value = true
  try {
    await fetch(`${normalizeServerUrl(serverUrl.value)}/health`, { signal: AbortSignal.timeout(5000) })
    ElMessage.success(t('loginView.testSuccess'))
  } catch {
    ElMessage.error(t('loginView.testFailed'))
  } finally {
    testingServer.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  background-color: var(--bg-primary);
}

// ===== 左侧品牌区 =====
.login-brand {
  width: 420px;
  min-width: 320px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 48px 40px;
  gap: 40px;
  background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-primary) 100%);
  border-right: 1px solid var(--border);
  flex-shrink: 0;

  @media (max-width: 860px) {
    display: none;
  }

  &__top {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background-color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__name {
    font-size: 26px;
    font-weight: 700;
    color: var(--text-primary);
  }

  &__tagline {
    font-size: 16px;
    color: var(--text-secondary);
    margin: 0;
  }

  &__features {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &__feature {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  &__feature-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background-color: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  &__feature-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__feature-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__feature-desc {
    font-size: 12px;
    color: var(--text-tertiary);
  }
}

// ===== 右侧表单区 =====
.login-form-panel {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow-y: auto;

  &::-webkit-scrollbar { width: 0; }

  &__inner {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  &__subtitle {
    font-size: 14px;
    color: var(--text-secondary);
    margin: -8px 0 0;
  }

  &__footer {
    text-align: center;
    font-size: 13px;
    color: var(--text-secondary);
    display: flex;
    justify-content: center;
    gap: 4px;

    a {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  }
}

// ===== 表单样式 =====
.login-form {
  display: flex;
  flex-direction: column;

  :deep(.el-form-item) { margin-bottom: 14px; }

  :deep(.el-input__wrapper) {
    height: 40px;
    border-radius: 8px;
    background-color: var(--bg-input);
    border: 1px solid var(--border);
    box-shadow: none;
    padding: 0 14px;
    &:hover, &.is-focus { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  }

  :deep(.el-input__inner) {
    font-size: 14px;
    color: var(--text-primary);
    background: transparent;
    &::placeholder { color: var(--text-tertiary); }
  }

  :deep(.el-input__prefix-inner .el-icon) { color: var(--text-tertiary); }

  &__options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    :deep(.el-checkbox__label) { font-size: 13px; color: var(--text-secondary); }
    :deep(.el-link__inner) { font-size: 13px; color: var(--accent); }
  }

  &__submit {
    width: 100%;
    height: 42px;
    border-radius: 8px;
    background-color: var(--accent);
    border-color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    &:hover { background-color: color-mix(in srgb, var(--accent) 85%, white); border-color: color-mix(in srgb, var(--accent) 85%, white); }
  }

  &__offline {
    width: 100%;
    height: 38px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-secondary);
    margin-left: 0 !important;
    margin-top: 8px;
    &:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-hover); }
  }

  &__server {
    margin-top: 12px;
  }

  &__server-toggle {
    font-size: 12px;
    color: var(--text-tertiary);
    display: flex;
    align-items: center;
    gap: 4px;
    &:hover { color: var(--text-secondary); }
  }

  &__server-input {
    margin-top: 8px;
    .field-label { margin-bottom: 4px; }
  }

  &__server-hint {
    font-size: 11px;
    color: var(--text-tertiary);
    margin-top: 4px;
    display: block;
  }

  &__divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    color: var(--text-tertiary);
    font-size: 12px;
    &::before, &::after { content: ''; flex: 1; height: 1px; background: var(--divider); }
  }

  &__oauth {
    display: flex;
    gap: 12px;

    .oauth-btn {
      flex: 1;
      height: 40px;
      border-radius: 8px;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-size: 13px;
      gap: 8px;
      &:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-hover); }
    }
  }
}

.field-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
</style>
