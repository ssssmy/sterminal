// 主机分享链接解析器
//
// 当前支持 Termius 风格的链接：
//   https://account.termius.com/host-sharing#ip=ssssmy.com&port=7822&label=macmini.remote&username=shenmingyuan&os=osx
// 链接的 query 也可能位于 ? 之后，做兼容处理。

export interface SharedLinkHost {
  label: string
  address: string
  port: number
  username?: string
  os?: string
}

const KNOWN_OS = new Set(['osx', 'macos', 'linux', 'windows', 'unix', 'freebsd', 'openbsd'])

/**
 * 解析单个分享链接。失败返回 null。
 */
export function parseSharedLink(input: string): SharedLinkHost | null {
  const raw = input.trim()
  if (!raw) return null

  // 取出参数串（兼容 #fragment 与 ?query 两种）
  let params = ''
  const hashIdx = raw.indexOf('#')
  const queryIdx = raw.indexOf('?')
  if (hashIdx >= 0) {
    params = raw.slice(hashIdx + 1)
  } else if (queryIdx >= 0) {
    params = raw.slice(queryIdx + 1)
  } else if (raw.includes('=')) {
    // 用户直接粘贴了参数串
    params = raw
  } else {
    return null
  }

  if (!params.includes('=')) return null

  const data = new Map<string, string>()
  for (const pair of params.split('&')) {
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const key = decodeURIComponent(pair.slice(0, eq)).trim().toLowerCase()
    const value = decodeURIComponent(pair.slice(eq + 1)).trim()
    if (key) data.set(key, value)
  }

  const address = data.get('ip') || data.get('host') || data.get('hostname') || data.get('address')
  if (!address) return null

  const portStr = data.get('port')
  const port = portStr ? Number.parseInt(portStr, 10) : NaN
  const finalPort = Number.isFinite(port) && port > 0 && port <= 65535 ? port : 22

  const username = data.get('username') || data.get('user') || undefined
  const label = data.get('label') || data.get('name') || address

  const osRaw = (data.get('os') || '').toLowerCase()
  const os = KNOWN_OS.has(osRaw) ? osRaw : undefined

  return {
    label,
    address,
    port: finalPort,
    username: username || undefined,
    os,
  }
}

/**
 * 解析多行输入，每行视作一个链接。返回成功解析的条目列表。
 */
export function parseSharedLinks(input: string): SharedLinkHost[] {
  return input
    .split(/\r?\n/)
    .map(line => parseSharedLink(line))
    .filter((h): h is SharedLinkHost => h !== null)
}
