import { describe, it, expect } from 'vitest'
import { parseSshConfig, type SshConfigHost } from '../ssh-config-parser'

describe('parseSshConfig', () => {
  it('parses a simple host entry', () => {
    const config = `
Host myserver
  HostName 192.168.1.1
  User admin
  Port 2222
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(1)
    expect(hosts[0]).toEqual({
      label: 'myserver',
      address: '192.168.1.1',
      port: 2222,
      username: 'admin',
      identityFile: undefined,
      proxyJump: undefined,
    })
  })

  it('defaults port to 22', () => {
    const config = `
Host test
  HostName test.example.com
`
    const hosts = parseSshConfig(config)
    expect(hosts[0].port).toBe(22)
  })

  it('parses IdentityFile', () => {
    const config = `
Host prod
  HostName prod.example.com
  IdentityFile ~/.ssh/id_ed25519
`
    const hosts = parseSshConfig(config)
    expect(hosts[0].identityFile).toBe('~/.ssh/id_ed25519')
  })

  it('parses ProxyJump', () => {
    const config = `
Host internal
  HostName 10.0.0.5
  ProxyJump bastion
`
    const hosts = parseSshConfig(config)
    expect(hosts[0].proxyJump).toBe('bastion')
  })

  it('parses multiple hosts', () => {
    const config = `
Host server1
  HostName 10.0.0.1

Host server2
  HostName 10.0.0.2
  User deploy
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(2)
    expect(hosts[0].label).toBe('server1')
    expect(hosts[1].label).toBe('server2')
    expect(hosts[1].username).toBe('deploy')
  })

  it('skips wildcard host patterns', () => {
    const config = `
Host *
  ServerAliveInterval 60

Host production
  HostName prod.example.com
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].label).toBe('production')
  })

  it('skips host patterns with ?', () => {
    const config = `
Host web?
  HostName web.example.com

Host real
  HostName real.example.com
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].label).toBe('real')
  })

  it('skips comments and blank lines', () => {
    const config = `
# This is a comment
Host myhost
  # Another comment
  HostName myhost.example.com

`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(1)
  })

  it('handles Match directive (flushes current)', () => {
    const config = `
Host before
  HostName before.example.com

Match host *.example.com
  ForwardAgent yes

Host after
  HostName after.example.com
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(2)
    expect(hosts.map(h => h.label)).toEqual(['before', 'after'])
  })

  it('strips quotes from values', () => {
    const config = `
Host quoted
  HostName "quoted.example.com"
  User 'deploy'
`
    const hosts = parseSshConfig(config)
    expect(hosts[0].address).toBe('quoted.example.com')
    expect(hosts[0].username).toBe('deploy')
  })

  it('returns empty for empty input', () => {
    expect(parseSshConfig('')).toHaveLength(0)
  })

  it('returns empty for comments-only input', () => {
    expect(parseSshConfig('# just comments\n# nothing here')).toHaveLength(0)
  })

  it('skips host without HostName', () => {
    const config = `
Host noaddress
  User admin
  Port 22
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(0)
  })

  it('handles invalid port gracefully', () => {
    const config = `
Host badport
  HostName example.com
  Port abc
`
    const hosts = parseSshConfig(config)
    expect(hosts[0].port).toBe(22) // fallback to default
  })

  it('is case insensitive for directives', () => {
    const config = `
host myhost
  hostname example.com
  user root
  port 2222
`
    const hosts = parseSshConfig(config)
    expect(hosts).toHaveLength(1)
    expect(hosts[0].address).toBe('example.com')
    expect(hosts[0].username).toBe('root')
    expect(hosts[0].port).toBe(2222)
  })
})
