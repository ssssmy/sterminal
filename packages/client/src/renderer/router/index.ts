// Vue Router 路由定义

import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/auth/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/auth/RegisterView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    name: 'Workspace',
    component: () => import('../views/workspace/WorkspaceView.vue'),
    meta: { requiresAuth: false }, // 支持离线模式，暂不强制登录
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/settings/SettingsLayout.vue'),
    meta: { requiresAuth: false },
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

export default router
