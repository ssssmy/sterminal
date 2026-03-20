// 国际化配置入口

import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'

const i18n = createI18n({
  legacy: false,                  // 使用 Composition API 模式
  locale: 'zh-CN',               // 默认语言
  fallbackLocale: 'zh-CN',       // 回退语言
  messages: {
    'zh-CN': zhCN,
  },
})

export default i18n
