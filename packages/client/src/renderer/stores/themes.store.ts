// 主题管理 Store
// 合并内置终端预设 + 数据库自定义主题，提供统一主题列表
// 管理自定义 CSS 覆盖注入 (<style> 元素)

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { TERMINAL_THEME_PRESETS, type TerminalThemePreset } from '@shared/constants/terminal-themes'
import { IPC_DB } from '@shared/types/ipc-channels'
import { COLORS } from '@shared/constants/design-tokens'

// ===== IPC 辅助（直接调用，不走 useIpc，避免监听器自动清理干扰） =====

const _ipc = window.electronAPI?.ipc
function ipcInvoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!_ipc) return Promise.resolve(undefined as T)
  return _ipc.invoke(channel, ...args) as Promise<T>
}

// ===== 类型定义 =====

/** 数据库 custom_themes 表的行类型 */
interface CustomThemeRow {
  id: string
  name: string
  type: 'dark' | 'light'
  foreground: string
  background: string
  cursor: string
  selection: string
  ansi_colors: string // JSON string of 16 colors
  sync_version: number
  sync_updated_at: string
  created_at: string
}

/** 创建自定义主题时传入的数据（不含自动生成字段） */
type CreateCustomThemeInput = Omit<CustomThemeRow, 'id' | 'sync_version' | 'sync_updated_at' | 'created_at'>

/** 更新自定义主题时传入的部分数据 */
type UpdateCustomThemeInput = Partial<Omit<CustomThemeRow, 'id' | 'sync_version' | 'sync_updated_at' | 'created_at'>>

// ===== 默认 ANSI 颜色（fallback） =====

/** ANSI 16 色的顺序：black, red, green, yellow, blue, magenta, cyan, white + 8 bright 变体 */
const DEFAULT_ANSI_COLORS: string[] = [
  COLORS.dark.bgPrimary, // black
  '#ef4444', // red
  '#22c55e', // green
  '#eab308', // yellow
  '#3b82f6', // blue
  '#a855f7', // magenta
  '#06b6d4', // cyan
  '#e2e8f0', // white
  '#64748b', // bright black
  '#f87171', // bright red
  '#4ade80', // bright green
  '#facc15', // bright yellow
  '#60a5fa', // bright blue
  '#c084fc', // bright magenta
  '#22d3ee', // bright cyan
  '#f8fafc', // bright white
]

/** ANSI 颜色数组索引到 TerminalThemePreset.colors 字段名的映射 */
const ANSI_COLOR_KEYS = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const

// ===== WCAG 对比度工具函数 =====

/**
 * 将 hex 颜色字符串解析为 [r, g, b]（0-255）。
 * 仅支持 3/6 位 hex，不支持 rgb() / rgba()。
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    return [r, g, b]
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16)
    const g = parseInt(clean.slice(2, 4), 16)
    const b = parseInt(clean.slice(4, 6), 16)
    return [r, g, b]
  }
  return null
}

/**
 * 计算单通道的相对亮度分量（WCAG 2.0 公式）。
 */
function linearizeChannel(c8bit: number): number {
  const c = c8bit / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * 计算 hex 颜色的相对亮度（0–1）。
 * 解析失败时返回 0。
 */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
}

// ===== Store =====

export const useThemesStore = defineStore('themes', () => {
  // ===== 状态 =====
  const customThemes = ref<TerminalThemePreset[]>([])
  const loading = ref(false)

  // ===== Computed =====

  /** 所有主题：内置预设在前，自定义主题追加在后 */
  const allTerminalThemes = computed<TerminalThemePreset[]>(() => [
    ...TERMINAL_THEME_PRESETS,
    ...customThemes.value,
  ])

  // ===== 数据转换 =====

  /**
   * 将数据库行转换为 TerminalThemePreset。
   * ansi_colors JSON 解析失败时使用内置默认颜色。
   */
  function dbRowToPreset(row: CustomThemeRow): TerminalThemePreset {
    let ansiColors: string[] = DEFAULT_ANSI_COLORS

    try {
      const parsed = JSON.parse(row.ansi_colors)
      if (Array.isArray(parsed) && parsed.length === 16 && parsed.every(c => typeof c === 'string')) {
        ansiColors = parsed
      } else {
        console.warn(`[ThemesStore] Invalid ansi_colors for theme "${row.id}", using defaults`)
      }
    } catch {
      console.warn(`[ThemesStore] Failed to parse ansi_colors for theme "${row.id}", using defaults`)
    }

    const ansiEntries = Object.fromEntries(
      ANSI_COLOR_KEYS.map((key, i) => [key, ansiColors[i] ?? DEFAULT_ANSI_COLORS[i]]),
    ) as Record<(typeof ANSI_COLOR_KEYS)[number], string>

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      colors: {
        background: row.background,
        foreground: row.foreground,
        cursor: row.cursor,
        cursorAccent: row.background, // 使用背景色作为 cursorAccent（DB 中不单独存储）
        selectionBackground: row.selection,
        ...ansiEntries,
      },
    }
  }

  // ===== 数据加载 =====

  /**
   * 从数据库加载自定义主题列表。
   */
  async function loadCustomThemes(): Promise<void> {
    loading.value = true
    try {
      const rows = await ipcInvoke<CustomThemeRow[]>(IPC_DB.THEMES_LIST)
      customThemes.value = (rows ?? []).map(dbRowToPreset)
    } catch (err) {
      console.error('[ThemesStore] Failed to load custom themes:', err)
      customThemes.value = []
    } finally {
      loading.value = false
    }
  }

  // ===== 主题查找 =====

  /**
   * 按 ID 查找主题，先搜内置预设再搜自定义主题。
   * 找不到时返回第一个内置预设（sterminal-dark）。
   */
  function findTheme(id: string): TerminalThemePreset {
    return allTerminalThemes.value.find(t => t.id === id) ?? TERMINAL_THEME_PRESETS[0]
  }

  // ===== CRUD =====

  /**
   * 创建自定义主题，返回新主题的 ID。
   */
  async function createCustomTheme(theme: CreateCustomThemeInput): Promise<string> {
    const id = await ipcInvoke<string>(IPC_DB.THEMES_CREATE, theme)
    await loadCustomThemes()
    return id
  }

  /**
   * 更新自定义主题的部分字段。
   */
  async function updateCustomTheme(id: string, updates: UpdateCustomThemeInput): Promise<void> {
    await ipcInvoke(IPC_DB.THEMES_UPDATE, id, updates)
    await loadCustomThemes()
  }

  /**
   * 删除自定义主题。
   */
  async function deleteCustomTheme(id: string): Promise<void> {
    await ipcInvoke(IPC_DB.THEMES_DELETE, id)
    customThemes.value = customThemes.value.filter(t => t.id !== id)
  }

  // ===== WCAG 对比度验证 =====

  /**
   * 验证前景色与背景色的 WCAG AA 对比度。
   *
   * 对比度计算：(L1 + 0.05) / (L2 + 0.05)，其中 L1 是较亮颜色的亮度。
   * WCAG AA 标准：普通文本 ≥ 4.5:1，大文本 ≥ 3:1。
   * 本函数以 4.5:1 作为通过阈值（普通文本标准）。
   *
   * @param fg - 前景色 hex（如 "#e2e8f0"）
   * @param bg - 背景色 hex（如 "#1a1b2e"）
   * @returns ratio（对比度，保留两位小数）和 passes（是否通过 WCAG AA）
   */
  function validateContrast(fg: string, bg: string): { ratio: number; passes: boolean } {
    const l1 = relativeLuminance(fg)
    const l2 = relativeLuminance(bg)
    const lighter = Math.max(l1, l2)
    const darker = Math.min(l1, l2)
    const ratio = Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
    return { ratio, passes: ratio >= 4.5 }
  }

  // ===== CSS 自定义属性注入 =====

  /**
   * 将一组 CSS 自定义属性写入 `<style id="st-custom-theme">` 元素。
   * 每次调用覆盖上次内容（整块替换，不做增量合并）。
   *
   * @param overrides - CSS 变量名到值的映射，如 `{ '--el-color-primary': '#6366f1' }`
   */
  function applyCustomCssOverrides(overrides: Record<string, string>): void {
    let styleEl = document.getElementById('st-custom-theme') as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = 'st-custom-theme'
      document.head.appendChild(styleEl)
    }
    const cssText =
      ':root {\n' +
      Object.entries(overrides)
        .map(([k, v]) => `  ${k}: ${v};`)
        .join('\n') +
      '\n}'
    styleEl.textContent = cssText
  }

  /**
   * 移除通过 `applyCustomCssOverrides` 注入的 `<style>` 元素。
   */
  function clearCustomCssOverrides(): void {
    const styleEl = document.getElementById('st-custom-theme')
    if (styleEl) {
      styleEl.remove()
    }
  }

  // ===== 返回 =====

  return {
    // 状态
    customThemes,
    loading,
    // Computed
    allTerminalThemes,
    // 操作
    loadCustomThemes,
    findTheme,
    createCustomTheme,
    updateCustomTheme,
    deleteCustomTheme,
    validateContrast,
    applyCustomCssOverrides,
    clearCustomCssOverrides,
    // 工具（供测试或外部复用）
    dbRowToPreset,
  }
})
