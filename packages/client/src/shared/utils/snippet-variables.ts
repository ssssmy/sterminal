// 命令片段变量解析与替换工具
//
// 支持的变量语法：
//   ${name}                  — 基本变量，执行时弹窗输入
//   ${name:默认值}            — 带默认值的变量
//   ${name:opt1|opt2|opt3}   — 下拉选择变量（选项用 | 分隔）
//   ${!name}                 — 密码变量，输入时遮蔽显示
//
// 内置变量（自动替换，无需用户输入）：
//   ${__date__}              — 当前日期 YYYY-MM-DD
//   ${__time__}              — 当前时间 HH:MM:SS
//   ${__datetime__}          — 当前日期时间 YYYY-MM-DD HH:MM:SS
//   ${__timestamp__}         — Unix 时间戳（秒）
//   ${__hostname__}          — 当前标签页主机名（如有）

/** 变量类型 */
export type SnippetVariableType = 'text' | 'password' | 'select'

/** 解析出的变量定义 */
export interface SnippetVariable {
  /** 原始匹配文本，如 ${name:default} */
  raw: string
  /** 变量名 */
  name: string
  /** 变量类型 */
  type: SnippetVariableType
  /** 默认值（text/password 类型） */
  defaultValue: string
  /** 下拉选项（select 类型） */
  options: string[]
}

/** 内置变量名集合 */
const BUILTIN_VARS = new Set([
  '__date__', '__time__', '__datetime__', '__timestamp__', '__hostname__',
])

// 匹配 ${...} 模式，支持嵌套内容但不支持嵌套大括号
const VAR_PATTERN = /\$\{(!?)([^}]+)\}/g

/**
 * 从片段内容中解析所有变量
 * @returns 去重后的变量列表（按首次出现顺序）
 */
export function parseVariables(content: string): SnippetVariable[] {
  const seen = new Set<string>()
  const variables: SnippetVariable[] = []

  for (const match of content.matchAll(VAR_PATTERN)) {
    const isPassword = match[1] === '!'
    const body = match[2]
    const raw = match[0]

    // 分离变量名和修饰符（冒号后面的部分）
    const colonIdx = body.indexOf(':')
    const name = colonIdx === -1 ? body : body.substring(0, colonIdx)
    const modifier = colonIdx === -1 ? '' : body.substring(colonIdx + 1)

    // 跳过内置变量
    if (BUILTIN_VARS.has(name)) continue

    // 去重（同名变量只出现一次）
    if (seen.has(name)) continue
    seen.add(name)

    // 判断类型：有 | 分隔符的是下拉选择
    if (modifier && modifier.includes('|')) {
      variables.push({
        raw,
        name,
        type: 'select',
        defaultValue: '',
        options: modifier.split('|').map(o => o.trim()).filter(Boolean),
      })
    } else {
      variables.push({
        raw,
        name,
        type: isPassword ? 'password' : 'text',
        defaultValue: modifier,
        options: [],
      })
    }
  }

  return variables
}

/**
 * 检查内容是否包含用户变量
 */
export function hasVariables(content: string): boolean {
  for (const match of content.matchAll(VAR_PATTERN)) {
    const body = match[2]
    const colonIdx = body.indexOf(':')
    const name = colonIdx === -1 ? body : body.substring(0, colonIdx)
    if (!BUILTIN_VARS.has(name)) return true
  }
  return false
}

/**
 * 用用户提供的值替换内容中的变量
 * @param content 原始片段内容
 * @param values  变量名 → 值 的映射
 * @param hostLabel 当前主机标签（用于内置变量 __hostname__）
 */
export function replaceVariables(
  content: string,
  values: Record<string, string>,
  hostLabel?: string,
): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  return content.replace(VAR_PATTERN, (match, bang: string, body: string) => {
    const colonIdx = body.indexOf(':')
    const name = colonIdx === -1 ? body : body.substring(0, colonIdx)

    // 内置变量
    switch (name) {
      case '__date__': return dateStr
      case '__time__': return timeStr
      case '__datetime__': return `${dateStr} ${timeStr}`
      case '__timestamp__': return String(Math.floor(now.getTime() / 1000))
      case '__hostname__': return hostLabel || ''
    }

    // 用户变量
    if (name in values) return values[name]

    // 未提供值时使用默认值，若无默认值则保留原文
    if (colonIdx !== -1) {
      const modifier = body.substring(colonIdx + 1)
      // 下拉选项取第一项作为默认
      if (modifier.includes('|')) {
        return modifier.split('|')[0].trim()
      }
      return modifier
    }
    return match
  })
}
