// Vue Router 路由定义

import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import WorkspaceView from '../views/workspace/WorkspaceView.vue'
import { useAuthStore } from '../stores/auth.store'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: { requiresGuest: true },
  },
  {
    path: '/',
    name: 'Workspace',
    component: WorkspaceView,
    meta: {},
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/settings/SettingsLayout.vue'),
    meta: {},
  },
  {
    // 未匹配路由重定向到主工作区
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  // Electron 使用 hash 路由模式（不依赖服务端）
  history: createWebHashHistory(),
  routes,
})

// 已登录用户访问 /login 或 /register 时重定向到主工作区
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresGuest) {
    const authStore = useAuthStore()
    if (authStore.isLoggedIn) {
      next('/')
      return
    }
  }
  next()
})

export default router
