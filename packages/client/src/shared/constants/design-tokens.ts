// Design Tokens — 设计系统的单一事实来源
// 颜色值、间距、阴影等所有视觉常量集中定义
// CSS 变量在 variables.scss 中引用这些值（通过约定保持一致）

// ===== 颜色调色板 =====

export const COLORS = {
  // 品牌色
  accent: '#6366f1',
  accentHover: '#818cf8',
  accentLight: '#a5b4fc',

  // 语义色
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',

  // 暗色主题
  dark: {
    bgPrimary: '#1a1b2e',
    bgSurface: '#232438',
    bgInset: '#16172a',
    bgHover: '#2a2b40',
    bgInput: '#1e1f34',
    textPrimary: '#e4e4e8',
    textSecondary: '#8b8d9e',
    textTertiary: '#5c5e72',
    border: '#2e3048',
    divider: '#262840',
    sidebarBg: '#16172a',
    tabBg: '#1e1f34',
    tabActiveBg: '#232438',
    terminalBg: '#0f1023',
    scrollbarThumb: '#2e3048',
  },

  // 亮色主题
  light: {
    bgPrimary: '#ffffff',
    bgSurface: '#f8f9fa',
    bgInset: '#f0f1f3',
    bgHover: '#e9ecef',
    bgInput: '#ffffff',
    textPrimary: '#1a1b2e',
    textSecondary: '#6c6e82',
    textTertiary: '#9ca0b0',
    border: '#dee2e6',
    divider: '#e9ecef',
    sidebarBg: '#f0f1f3',
    tabBg: '#f8f9fa',
    tabActiveBg: '#ffffff',
    terminalBg: '#f8f9fc',
    scrollbarThumb: '#dee2e6',
  },
} as const

// ===== 间距系统（4px 网格） =====

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const

// ===== 阴影 =====

export const SHADOWS = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
  md: '0 4px 12px rgba(0, 0, 0, 0.15)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.2)',
  xl: '0 12px 40px rgba(0, 0, 0, 0.35)',
  dialog: '0 12px 40px rgba(0, 0, 0, 0.35)',
} as const

// ===== 圆角 =====

export const RADII = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const

// ===== 动效 =====

export const MOTION = {
  durationFast: '0.15s',
  durationNormal: '0.25s',
  durationSlow: '0.4s',
  easingDefault: 'ease',
  easingSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  easingSmooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easingDecelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  easingAccelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  /** prefers-reduced-motion 下使用的近零时长 */
  durationReduced: '0.01s',
} as const

// ===== 布局 =====

export const LAYOUT = {
  sidebarWidth: 260,
  sidebarCollapsedWidth: 0,
  tabHeight: 36,
  toolbarHeight: 40,
  macosTrafficLightPadding: 38,
  windowsTitlebarPadding: 138,
} as const

// ===== Z-Index 层级 =====

export const Z_INDEX = {
  sidebar: 10,
  toolbar: 20,
  dropdown: 100,
  modal: 200,
  overlay: 300,
  toast: 400,
  tooltip: 500,
} as const
