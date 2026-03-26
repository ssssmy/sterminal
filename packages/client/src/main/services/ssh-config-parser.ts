// OpenSSH config (~/.ssh/config) 解析器

export interface SshConfigHost {
  label: string
  address: string
  port: number
  username?: string
  identityFile?: string
  proxyJump?: string
}

/**
 * 解析 OpenSSH config 文件内容
 * 跳过 Host * 通配符和 Match 块
 */
export function parseSshConfig(content: string): SshConfigHost[] {
  const hosts: SshConfigHost[] = []
  let current: Partial<SshConfigHost> | null = null

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const [directive, ...rest] = line.split(/\s+/)
    const value = rest.join(' ').replace(/^["']|["']$/g, '')
    const key = directive.toLowerCase()

    if (key === 'host') {
      // 保存上一个 host
      if (current && current.label && current.address) {
        hosts.push({
          label: current.label,
          address: current.address,
          port: current.port ?? 22,
          username: current.username,
          identityFile: current.identityFile,
          proxyJump: current.proxyJump,
        })
      }
      // 跳过通配符
      if (value === '*' || value.includes('*') || value.includes('?')) {
        current = null
        continue
      }
      current = { label: value }
    } else if (key === 'match') {
      // Match 块不解析
      if (current && current.label && current.address) {
        hosts.push({
          label: current.label,
          address: current.address,
          port: current.port ?? 22,
          username: current.username,
          identityFile: current.identityFile,
          proxyJump: current.proxyJump,
        })
      }
      current = null
    } else if (current) {
      switch (key) {
        case 'hostname': current.address = value; break
        case 'user': current.username = value; break
        case 'port': current.port = parseInt(value, 10) || 22; break
        case 'identityfile': current.identityFile = value; break
        case 'proxyjump': current.proxyJump = value; break
      }
    }
  }

  // 最后一个 host
  if (current && current.label && current.address) {
    hosts.push({
      label: current.label,
      address: current.address,
      port: current.port ?? 22,
      username: current.username,
      identityFile: current.identityFile,
      proxyJump: current.proxyJump,
    })
  }

  return hosts
}
