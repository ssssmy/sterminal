// Vue 渲染进程入口
// 初始化 Vue 应用，注册全局插件

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'element-plus/theme-chalk/el-overlay.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-button.css'

import App from './App.vue'
import router from './router/index'
import i18n from './i18n/index'
import './styles/global.scss'

// 创建 Vue 应用实例
const app = createApp(App)

// 注册 Pinia 状态管理
app.use(createPinia())

// 注册 Vue Router
app.use(router)

// 注册国际化
app.use(i18n)

// 挂载到 DOM
app.mount('#app')
