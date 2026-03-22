// 国际化配置入口

import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import en from './en.json'
import zhTW from './zh-TW.json'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: 'zh-CN',
  messages: {
    'zh-CN': zhCN,
    'en': en,
    'zh-TW': zhTW,
  },
})

export default i18n
