<template>
  <!-- 登录页面：垂直水平居中布局 -->
  <div class="login-page">
    <div class="login-card">
      <!-- Logo 区域 -->
      <div class="login-card__logo">
        <!-- 应用图标：带终端符号的圆角方块 -->
        <div class="login-card__icon">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8L10 14L4 20" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13 20H24" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <!-- 应用名称 -->
        <span class="login-card__app-name">STerminal</span>
        <!-- 副标题 -->
        <span class="login-card__subtitle">跨平台终端管理工具</span>
      </div>

      <!-- 登录表单 -->
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        class="login-card__form"
        @submit.prevent="handleLogin"
      >
        <!-- 邮箱输入框 -->
        <el-form-item prop="email">
          <label class="field-label">邮箱地址</label>
          <el-input
            v-model="form.email"
            placeholder="请输入邮箱地址"
            :prefix-icon="Message"
            autocomplete="email"
          />
        </el-form-item>

        <!-- 密码输入框 -->
        <el-form-item prop="password">
          <label class="field-label">密码</label>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>

        <!-- 记住我 + 忘记密码 -->
        <div class="login-card__options">
          <el-checkbox v-model="form.remember" class="login-card__remember">
            记住我
          </el-checkbox>
          <el-link class="login-card__forgot" @click="handleForgotPassword">
            忘记密码?
          </el-link>
        </div>

        <!-- 登录按钮 -->
        <el-button
          type="primary"
          :loading="loading"
          class="login-card__submit"
          native-type="submit"
        >
          登录
        </el-button>

        <!-- "或" 分割线 -->
        <div class="login-card__divider">
          <span>或</span>
        </div>

        <!-- OAuth 按钮行 -->
        <div class="login-card__oauth">
          <!-- GitHub OAuth -->
          <el-button class="oauth-btn" @click="handleOAuth('github')">
            <template #icon>
              <!-- GitHub SVG 图标 -->
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </template>
            GitHub
          </el-button>
          <!-- Google OAuth -->
          <el-button class="oauth-btn" @click="handleOAuth('google')">
            <template #icon>
              <!-- Google SVG 图标 -->
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

      <!-- 底部：注册入口 -->
      <div class="login-card__footer">
        <span class="footer-text">没有账户？</span>
        <router-link to="/register" class="footer-link">立即注册</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Message, Lock } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../../stores/auth.store'

const router = useRouter()
const authStore = useAuthStore()

// 表单 ref
const formRef = ref<FormInstance>()
// 提交 loading 状态
const loading = ref(false)

// 表单数据
const form = reactive({
  email: '',
  password: '',
  remember: true,
})

// 表单验证规则
const rules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 1, message: '密码不能为空', trigger: 'blur' },
  ],
}

// 提交登录
async function handleLogin(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authStore.login(form.email, form.password, form.remember)
    ElMessage.success('登录成功')
    router.push('/')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '登录失败，请重试')
  } finally {
    loading.value = false
  }
}

// 忘记密码占位处理
function handleForgotPassword(): void {
  ElMessage.info('密码重置功能即将上线')
}

// OAuth 登录占位处理
function handleOAuth(provider: 'github' | 'google'): void {
  ElMessage.info(`${provider === 'github' ? 'GitHub' : 'Google'} 登录功能即将上线`)
}
</script>

<style lang="scss" scoped>
/* 页面整体：垂直水平居中 */
.login-page {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-primary);

  /* 窗口过小时可滚动 */
  overflow: auto;
  padding: 24px 16px;
}

/* 登录卡片：宽 480px，padding 48px */
.login-card {
  width: 480px;
  min-width: 320px;
  padding: 48px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 32px; /* Logo区和表单区之间的间距 */

  /* 响应式：窗口过小时缩小 */
  @media (max-width: 540px) {
    width: 100%;
    padding: 32px 24px;
  }

  /* Logo 区域：垂直居中排列 */
  &__logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  /* 图标方块：48x48 圆角 12px accent 背景 */
  &__icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background-color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* 应用名称 */
  &__app-name {
    font-family: 'Inter', sans-serif;
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  /* 副标题 */
  &__subtitle {
    font-family: 'Inter', sans-serif;
    font-size: 14px;
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
      margin-bottom: 16px;
    }

    /* 输入框样式覆盖 */
    :deep(.el-input__wrapper) {
      height: 44px;
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

  /* 记住我 + 忘记密码 行 */
  &__options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    margin-top: -4px;
  }

  /* 记住我 checkbox 文字 */
  &__remember {
    :deep(.el-checkbox__label) {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: var(--text-secondary);
    }

    :deep(.el-checkbox__inner) {
      background-color: var(--bg-input);
      border-color: var(--border);
    }

    :deep(.el-checkbox.is-checked .el-checkbox__inner) {
      background-color: var(--accent);
      border-color: var(--accent);
    }
  }

  /* 忘记密码链接 */
  &__forgot {
    font-family: 'Inter', sans-serif;
    font-size: 13px;
    color: var(--accent) !important;
    text-decoration: none;

    :deep(.el-link__inner) {
      color: var(--accent);
    }
  }

  /* 登录按钮 */
  &__submit {
    width: 100%;
    height: 44px;
    border-radius: 8px;
    background-color: var(--accent);
    border-color: var(--accent);
    font-family: 'Inter', sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;

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
    margin: 16px 0;
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

  /* OAuth 按钮行：两个等宽按钮 */
  &__oauth {
    display: flex;
    gap: 12px;

    .oauth-btn {
      flex: 1;
      height: 44px;
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

/* 底部文字 */
.footer-text {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--text-secondary);
}

/* 底部注册链接 */
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
