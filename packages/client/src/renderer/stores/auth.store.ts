// 认证状态 Store
// 管理用户登录/注册/登出状态和 JWT Token

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../services/api'

export interface UserInfo {
  id: string
  username: string
  email: string
  emailVerified: boolean
  avatarUrl?: string
  createdAt: string
}

// 后端返回的用户字段（snake_case）
interface ApiUserRecord {
  id: string
  username: string
  email: string
  email_verified: number
  avatar_url: string | null
  created_at: string
}

// localStorage key 常量
const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

function mapApiUser(u: ApiUserRecord): UserInfo {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    emailVerified: !!u.email_verified,
    avatarUrl: u.avatar_url ?? undefined,
    createdAt: u.created_at,
  }
}

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
  const isOfflineMode = computed(() => !token.value)

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
    api.setToken(null)
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
    const result = await api.post<{ token: string; user: ApiUserRecord }>('/auth/login', { email, password, remember })
    const userInfo = mapApiUser(result.user)
    api.setToken(result.token)
    if (remember) {
      persistSession(result.token, userInfo)
    } else {
      token.value = result.token
      user.value = userInfo
    }
  }

  /**
   * 注册
   * @param username 用户名
   * @param email 邮箱
   * @param password 密码
   */
  async function register(username: string, email: string, password: string): Promise<void> {
    await api.post('/auth/register', { username, email, password })
  }

  /**
   * 退出登录
   */
  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout')
    } catch {
      // 忽略退出登录的网络错误，仍然清除本地状态
    }
    clearSession()
  }

  /**
   * 从本地存储恢复会话（应用启动时调用）
   * 失败时静默降级为离线模式
   */
  async function restoreSession(): Promise<void> {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (!savedToken) return

    // 先从本地恢复状态（即使服务器不可达也能正常使用）
    api.setToken(savedToken)
    token.value = savedToken
    const savedUser = (() => {
      try {
        const s = localStorage.getItem(USER_KEY)
        return s ? (JSON.parse(s) as UserInfo) : null
      } catch { return null }
    })()
    if (savedUser) user.value = savedUser

    // 后台验证 token 是否仍然有效，同时续签
    try {
      const result = await api.get<ApiUserRecord & { token?: string }>('/user/me')
      // 服务端返回续签的新 token
      if (result.token) {
        persistSession(result.token, mapApiUser(result))
      } else {
        const userInfo = mapApiUser(result)
        user.value = userInfo
        localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
      }
    } catch (err) {
      // 只有明确的 401/403 才清除 session（token 已过期/失效）
      // 网络不可达时保留本地登录状态
      const status = (err as Error & { status?: number }).status
      if (status === 401 || status === 403) {
        clearSession()
      }
    }
  }

  /**
   * 更新用户资料
   */
  async function updateProfile(data: { username?: string; avatarUrl?: string }): Promise<void> {
    const userRecord = await api.patch<ApiUserRecord>('/user/me', data)
    const userInfo = mapApiUser(userRecord)
    user.value = userInfo
    localStorage.setItem(USER_KEY, JSON.stringify(userInfo))
  }

  /**
   * 修改密码
   */
  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/user/me/password', { currentPassword, newPassword })
  }

  /**
   * 删除账户（需密码确认）
   */
  async function deleteAccount(password: string): Promise<void> {
    await api.delete('/user/me', { password })
    token.value = null
    user.value = null
    api.setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  /**
   * 保存 token 到本地存储（供 OAuth 回调等场景使用）
   */
  function saveToken(newToken: string): void {
    token.value = newToken
    api.setToken(newToken)
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  return {
    token,
    user,
    isLoggedIn,
    isOfflineMode,
    login,
    register,
    logout,
    restoreSession,
    updateProfile,
    changePassword,
    deleteAccount,
    saveToken,
  }
})
