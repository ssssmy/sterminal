// 认证状态 Store
// 管理用户登录/注册/登出状态和 JWT Token
// 当前 API 调用使用 mock 数据（setTimeout 模拟），后续对接真实后端

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface UserInfo {
  id: string
  username: string
  email: string
  emailVerified: boolean
  avatarUrl?: string
  createdAt: string
}

// localStorage key 常量
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

export const useAuthStore = defineStore('auth', () => {
  // ===== 状态 =====
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const savedUser = (() => {
    try {
      const saved = localStorage.getItem(USER_KEY)
      return saved ? (JSON.parse(saved) as UserInfo) : null
    } catch {
      return null
    }
  })()
  const user = ref<UserInfo | null>(savedUser)

  // ===== 计算属性 =====
  const isLoggedIn = computed(() => !!token.value && !!user.value)

  // ===== 内部方法 =====

  /**
   * 持久化 token 和用户信息到 localStorage
   */
  function persistSession(newToken: string, userInfo: UserInfo): void {
    token.value = newToken
    user.value = userInfo
    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
  }

  /**
   * 清除本地持久化数据
   */
  function clearSession(): void {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  // ===== 公开操作 =====

  /**
   * 登录
   * @param email 邮箱
   * @param password 密码
   * @param remember 是否记住登录（持久化 token）
   */
  async function login(email: string, password: string, remember = true): Promise<void> {
    // Mock 模拟：延迟 800ms 后返回假数据
    // TODO: 替换为真实 API 调用 POST /api/v1/auth/login
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        // 模拟邮箱/密码校验（真实环境由后端校验）
        if (!email || !password) {
          reject(new Error('邮箱或密码不能为空'))
          return
        }
        // 模拟登录成功，返回假 token 和用户信息
        const mockToken = `mock_token_${Date.now()}`
        const mockUser: UserInfo = {
          id: 'mock_user_001',
          username: email.split('@')[0],
          email,
          emailVerified: true,
          avatarUrl: undefined,
          createdAt: new Date().toISOString(),
        }
        if (remember) {
          // 记住登录：持久化到 localStorage
          persistSession(mockToken, mockUser)
        } else {
          // 不记住：只写入内存状态
          token.value = mockToken
          user.value = mockUser
        }
        resolve()
      }, 800)
    })
  }

  /**
   * 注册
   * @param username 用户名
   * @param email 邮箱
   * @param password 密码
   */
  async function register(username: string, email: string, password: string): Promise<void> {
    // Mock 模拟：延迟 1000ms 后返回假数据
    // TODO: 替换为真实 API 调用 POST /api/v1/auth/register
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (!username || !email || !password) {
          reject(new Error('注册信息不完整'))
          return
        }
        // 模拟注册成功（真实环境后端会发送验证邮件）
        resolve()
      }, 1000)
    })
  }

  /**
   * 退出登录
   */
  function logout(): void {
    clearSession()
  }

  /**
   * 从本地存储恢复会话（应用启动时调用）
   */
  async function restoreSession(): Promise<void> {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) return

    try {
      const savedUser = localStorage.getItem(USER_KEY)
      if (savedUser) {
        token.value = savedToken
        user.value = JSON.parse(savedUser) as UserInfo
        // TODO: 向后端验证 token 有效性，无效则清除
        // const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${savedToken}` } })
        // if (!response.ok) clearSession()
      }
    } catch {
      // 解析失败时清除无效数据
      clearSession()
    }
  }

  /**
   * 保存 token 到本地存储（供 OAuth 回调等场景使用）
   */
  function saveToken(newToken: string): void {
    token.value = newToken
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    logout,
    restoreSession,
    saveToken,
  }
})
