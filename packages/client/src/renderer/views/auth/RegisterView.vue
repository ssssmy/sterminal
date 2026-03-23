<template>
  <!-- 注册页面：垂直水平居中布局 -->
  <div class="register-page">
    <div class="register-card">
      <!-- Logo 区域 -->
      <div class="register-card__logo">
        <!-- 应用图标：44x44 圆角 10px -->
        <div class="register-card__icon">
          <svg width="26" height="26" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8L10 14L4 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 20H24" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <!-- 页面标题 -->
        <span class="register-card__title">{{ t('registerView.title') }}</span>
        <!-- 副标题 -->
        <span class="register-card__subtitle">{{ t('registerView.subtitle') }}</span>
      </div>

      <!-- 注册表单 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="register-card__form"
        @submit.prevent="handleRegister"
      >
        <!-- 用户名 -->
        <el-form-item prop="username">
          <label class="field-label">{{ t('registerView.usernameLabel') }}</label>
          <el-input
            v-model="form.username"
            :placeholder="t('registerView.usernamePlaceholder')"
            :prefix-icon="User"
            autocomplete="username"
          />
        </el-form-item>

        <!-- 邮箱地址 -->
        <el-form-item prop="email">
          <label class="field-label">{{ t('registerView.emailLabel') }}</label>
          <el-input
            v-model="form.email"
            :placeholder="t('registerView.emailPlaceholder')"
            :prefix-icon="Message"
            autocomplete="email"
          />
        </el-form-item>

        <!-- 密码 -->
        <el-form-item prop="password">
          <label class="field-label">{{ t('registerView.passwordLabel') }}</label>
          <el-input
            v-model="form.password"
            type="password"
            :placeholder="t('registerView.passwordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            autocomplete="new-password"
            @input="updatePasswordStrength"
          />
          <!-- 密码强度指示器 -->
          <div v-if="form.password" class="password-strength">
            <div class="password-strength__bars">
              <span
                v-for="i in 3"
                :key="i"
                class="password-strength__bar"
                :class="getStrengthBarClass(i)"
              />
            </div>
            <span class="password-strength__label" :class="`strength-${passwordStrength}`">
              {{ passwordStrengthLabel }}
            </span>
          </div>
        </el-form-item>

        <!-- 确认密码 -->
        <el-form-item prop="confirmPassword">
          <label class="field-label">{{ t('registerView.confirmPasswordLabel') }}</label>
          <el-input
            v-model="form.confirmPassword"
            type="password"
            :placeholder="t('registerView.confirmPasswordPlaceholder')"
            :prefix-icon="Lock"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>

        <!-- 注册按钮 -->
        <el-button
          type="primary"
          :loading="loading"
          class="register-card__submit"
          native-type="submit"
        >
          {{ t('registerView.registerBtn') }}
        </el-button>

        <!-- "或" 分割线 -->
        <div class="register-card__divider">
          <span>{{ t('registerView.or') }}</span>
        </div>

        <!-- OAuth 按钮行 -->
        <div class="register-card__oauth">
          <!-- GitHub OAuth -->
          <el-button class="oauth-btn" @click="handleOAuth('github')">
            <template #icon>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </template>
            GitHub
          </el-button>
          <!-- Google OAuth -->
          <el-button class="oauth-btn" @click="handleOAuth('google')">
            <template #icon>
              <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.68 8.18c0-.57-.05-1.12-.14-1.64H8v3.1h4.31a3.68 3.68 0 01-1.6 2.42v2.01h2.59c1.52-1.4 2.39-3.45 2.39-5.9z" fill="#4285F4"/>
                <path d="M8 16c2.16 0 3.97-.72 5.29-1.93l-2.59-2.01c-.71.48-1.63.76-2.7.76-2.08 0-3.84-1.4-4.47-3.28H.86v2.07A8 8 0 008 16z" fill="#34A853"/>
                <path d="M3.53 9.54A4.81 4.81 0 013.28 8c0-.53.09-1.04.25-1.54V4.39H.86A8 8 0 000 8c0 1.29.31 2.51.86 3.61l2.67-2.07z" fill="#FBBC05"/>
                <path d="M8 3.18c1.17 0 2.22.4 3.05 1.2l2.28-2.28C11.97.72 10.16 0 8 0A8 8 0 00.86 4.39l2.67 2.07C4.16 4.58 5.92 3.18 8 3.18z" fill="#EA4335"/>
              </svg>
            </template>
            Google
          </el-button>
        </div>
      </el-form>

      <!-- 底部：登录入口 -->
      <div class="register-card__footer">
        <span class="footer-text">{{ t('registerView.hasAccount') }}</span>
        <router-link to="/login" class="footer-link">{{ t('registerView.loginLink') }}</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { User, Message, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth.store'

const { t } = useI18n()

const router = useRouter()
const authStore = useAuthStore()

// 表单 ref
const formRef = ref<FormInstance>()
// 提交 loading 状态
const loading = ref(false)

// 密码强度：0=无, 1=弱, 2=中, 3=强
const passwordStrength = ref<0 | 1 | 2 | 3>(0)

// 表单数据
const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
})

// 密码强度文字标签
const passwordStrengthLabel = computed(() => {
  const labels: Record<number, string> = { 0: '', 1: t('registerView.strengthWeak'), 2: t('registerView.strengthMedium'), 3: t('registerView.strengthStrong') }
  return labels[passwordStrength.value]
})

/**
 * 计算密码强度（简单 3 级判断）
 * 1级（弱）：长度 >= 8
 * 2级（中）：长度 >= 8 且含字母和数字
 * 3级（强）：长度 >= 8 且含大写、小写、数字
 */
function updatePasswordStrength(): void {
  const pwd = form.password
  if (!pwd || pwd.length < 8) {
    passwordStrength.value = pwd.length > 0 ? 1 : 0
    return
  }
  const hasLower = /[a-z]/.test(pwd)
  const hasUpper = /[A-Z]/.test(pwd)
  const hasNumber = /[0-9]/.test(pwd)

  if (hasLower && hasUpper && hasNumber) {
    passwordStrength.value = 3
  } else if ((hasLower || hasUpper) && hasNumber) {
    passwordStrength.value = 2
  } else {
    passwordStrength.value = 1
  }
}

/**
 * 获取密码强度指示条的 CSS 类名
 * @param barIndex 1, 2, 3
 */
function getStrengthBarClass(barIndex: number): string {
  if (passwordStrength.value >= barIndex) {
    return `strength-bar--active strength-${passwordStrength.value}`
  }
  return ''
}

// 确认密码校验器
const validateConfirmPassword = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void
): void => {
  if (!value) {
    callback(new Error(t('registerView.validConfirmRequired')))
  } else if (value !== form.password) {
    callback(new Error(t('registerView.validConfirmMatch')))
  } else {
    callback()
  }
}

// 密码强度校验器：至少8位且含大小写和数字
const validatePassword = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void
): void => {
  if (!value) {
    callback(new Error(t('registerView.validPasswordRequired')))
    return
  }
  if (value.length < 8) {
    callback(new Error(t('registerView.validPasswordLength')))
    return
  }
  if (!/[a-z]/.test(value)) {
    callback(new Error(t('registerView.validPasswordLower')))
    return
  }
  if (!/[A-Z]/.test(value)) {
    callback(new Error(t('registerView.validPasswordUpper')))
    return
  }
  if (!/[0-9]/.test(value)) {
    callback(new Error(t('registerView.validPasswordNumber')))
    return
  }
  callback()
}

// 表单验证规则
const rules: FormRules = {
  username: [
    { required: true, message: t('registerView.validUsernameRequired'), trigger: 'blur' },
    { min: 3, max: 32, message: t('registerView.validUsernameLength'), trigger: ['blur', 'change'] },
    {
      pattern: /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/,
      message: t('registerView.validUsernamePattern'),
      trigger: 'blur',
    },
  ],
  email: [
    { required: true, message: t('registerView.validEmailRequired'), trigger: 'blur' },
    { type: 'email', message: t('registerView.validEmailFormat'), trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, validator: validatePassword, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

// 提交注册
async function handleRegister(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authStore.register(form.username, form.email, form.password)
    ElMessage.success(t('registerView.registerSuccess'))
    router.push('/login')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('registerView.registerFailed'))
  } finally {
    loading.value = false
  }
}

// OAuth 注册占位处理
function handleOAuth(provider: 'github' | 'google'): void {
  ElMessage.info(t('registerView.oauthTip', { provider: provider === 'github' ? 'GitHub' : 'Google' }))
}
</script>

<style lang="scss" scoped>
/* 页面整体：垂直水平居中 */
.register-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);
  overflow: hidden;
  padding: 16px;
}

.register-card {
  width: 480px;
  min-width: 320px;
  max-height: 100%;
  padding: 28px 40px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 540px) {
    width: 100%;
    padding: 28px 20px;
  }

  /* Logo 区域 */
  &__logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  /* 图标方块：44x44 圆角 10px */
  &__icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background-color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* 页面标题 */
  &__title {
    font-family: 'Inter', sans-serif;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  /* 副标题 */
  &__subtitle {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  /* 表单区域 */
  &__form {
    display: flex;
    flex-direction: column;
    gap: 0;

    /* el-form-item 间距 */
    :deep(.el-form-item) {
      margin-bottom: 10px;
    }

    /* 输入框样式覆盖 */
    :deep(.el-input__wrapper) {
      height: 42px;
      border-radius: 8px;
      background-color: var(--bg-input);
      border: 1px solid var(--border);
      box-shadow: none;
      padding: 0 14px;

      &:hover,
      &.is-focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent);
      }
    }

    :deep(.el-input__inner) {
      font-size: 14px;
      color: var(--text-primary);
      background-color: transparent;

      &::placeholder {
        color: var(--text-tertiary);
      }
    }

    :deep(.el-input__prefix-inner .el-icon) {
      color: var(--text-tertiary);
    }
  }

  /* 注册按钮 */
  &__submit {
    width: 100%;
    height: 42px;
    border-radius: 8px;
    background-color: var(--accent);
    border-color: var(--accent);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    margin-top: 4px;

    &:hover,
    &:focus {
      background-color: color-mix(in srgb, var(--accent) 85%, white);
      border-color: color-mix(in srgb, var(--accent) 85%, white);
    }

    &:active {
      background-color: color-mix(in srgb, var(--accent) 75%, black);
    }
  }

  /* "或" 分割线 */
  &__divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 14px 0;
    color: var(--text-tertiary);
    font-family: 'Inter', sans-serif;
    font-size: 13px;

    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background-color: var(--divider);
    }
  }

  /* OAuth 按钮行 */
  &__oauth {
    display: flex;
    gap: 12px;

    .oauth-btn {
      flex: 1;
      height: 42px;
      border-radius: 8px;
      background-color: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;

      :deep(.el-button__icon) {
        margin-right: 4px;
      }

      &:hover {
        border-color: var(--accent);
        color: var(--text-primary);
        background-color: var(--bg-hover);
      }
    }
  }

  /* 底部链接 */
  &__footer {
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }
}

/* 字段标签 */
.field-label {
  display: block;
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

/* 密码强度指示器 */
.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;

  &__bars {
    display: flex;
    gap: 4px;
  }

  &__bar {
    width: 40px;
    height: 3px;
    border-radius: 2px;
    background-color: var(--divider);
    transition: background-color 0.2s ease;

    /* 激活状态 */
    &.strength-bar--active {
      &.strength-1 {
        background-color: var(--error);
      }
      &.strength-2 {
        background-color: var(--warning);
      }
      &.strength-3 {
        background-color: var(--success);
      }
    }
  }

  &__label {
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;

    &.strength-1 {
      color: var(--error);
    }
    &.strength-2 {
      color: var(--warning);
    }
    &.strength-3 {
      color: var(--success);
    }
  }
}

/* 底部文字 */
.footer-text {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 底部登录链接 */
.footer-link {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>
