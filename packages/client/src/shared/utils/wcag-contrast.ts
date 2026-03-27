// WCAG 2.0 对比度计算工具
// 从 themes.store.ts 提取为独立模块以便单元测试

/**
 * 将 hex 颜色字符串解析为 [r, g, b]（0-255）。
 * 仅支持 3/6 位 hex，不支持 rgb() / rgba()。
 */
export function hexToRgb(hex: string): [number, number, number] | null {
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
export function linearizeChannel(c8bit: number): number {
  const c = c8bit / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/**
 * 计算 hex 颜色的相对亮度（0–1）。
 * 解析失败时返回 0。
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
}

/**
 * 计算两种颜色的 WCAG 2.0 对比度比率。
 * 返回值范围 1:1 到 21:1。
 */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 验证前景/背景色是否满足 WCAG AA 标准（4.5:1）。
 */
export function validateContrast(fg: string, bg: string): { ratio: number; passes: boolean } {
  const ratio = contrastRatio(fg, bg)
  return { ratio, passes: ratio >= 4.5 }
}
