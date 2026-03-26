// OpenSSH config (~/.ssh/config) 解析器

export interface SshConfigHost {
  label: string
  address: string
  port: number
  username?: string
  identityFile?: string
  proxyJump?: string
}

export function parseSshConfig(content: string): SshConfigHost[] {
  const hosts: SshConfigHost[] = []
  let current: Partial<SshConfigHost> | null = null

  function flush(): void {
    if (current?.label && current.address) {
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
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const [directive, ...rest] = line.split(/\s+/)
    const value = rest.join(' ').replace(/^["']|["']$/g, '')
    const key = directive.toLowerCase()

    if (key === 'host') {
      flush()
      if (value.includes('*') || value.includes('?')) continue
      current = { label: value }
    } else if (key === 'match') {
      flush()
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

  flush()
  return hosts
}
