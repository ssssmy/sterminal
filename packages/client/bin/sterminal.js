#!/usr/bin/env node

// STerminal CLI — 通过 URI Scheme 与 Electron 应用交互
// 用法：
//   sterminal ssh user@host [-p port] [-i keyfile]
//   sterminal connect <name>
//   sterminal list
//   sterminal open
//   sterminal new
//   sterminal sftp user@host
//   sterminal version
//   sterminal help

const { execSync, exec } = require('child_process')
const path = require('path')
const os = require('os')

const VERSION = '0.1.0'

// ===== 参数解析 =====

const args = process.argv.slice(2)
const command = args[0] || 'help'

function getFlag(flag, alias) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag || args[i] === alias) {
      return args[i + 1] || true
    }
  }
  return null
}

// ===== 平台特定 URL 打开 =====

function openUrl(url) {
  const platform = os.platform()
  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`)
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { shell: true })
    } else {
      // Linux
      execSync(`xdg-open "${url}" 2>/dev/null || open "${url}" 2>/dev/null`, { shell: true })
    }
  } catch {
    console.error('Failed to open STerminal. Is the application installed?')
    process.exit(1)
  }
}

// ===== 解析 user@host:port 格式 =====

function parseTarget(target) {
  if (!target) return {}
  let user, host, port

  // user@host:port
  const atIdx = target.indexOf('@')
  if (atIdx !== -1) {
    user = target.substring(0, atIdx)
    const rest = target.substring(atIdx + 1)
    const colonIdx = rest.lastIndexOf(':')
    if (colonIdx !== -1 && /^\d+$/.test(rest.substring(colonIdx + 1))) {
      host = rest.substring(0, colonIdx)
      port = rest.substring(colonIdx + 1)
    } else {
      host = rest
    }
  } else {
    // host:port (no user)
    const colonIdx = target.lastIndexOf(':')
    if (colonIdx !== -1 && /^\d+$/.test(target.substring(colonIdx + 1))) {
      host = target.substring(0, colonIdx)
      port = target.substring(colonIdx + 1)
    } else {
      host = target
    }
  }

  return { user, host, port }
}

// ===== 构建 URL =====

function buildConnectUrl(params) {
  const searchParams = new URLSearchParams()
  if (params.name) searchParams.set('name', params.name)
  if (params.host) searchParams.set('host', params.host)
  if (params.user) searchParams.set('user', params.user)
  if (params.port) searchParams.set('port', params.port)
  if (params.id) searchParams.set('id', params.id)
  return `sterminal://connect?${searchParams.toString()}`
}

// ===== 命令处理 =====

switch (command) {
  case 'ssh': {
    const target = args[1]
    if (!target) {
      console.error('Usage: sterminal ssh user@host [-p port]')
      process.exit(1)
    }
    const parsed = parseTarget(target)
    const portFlag = getFlag('-p', '--port')
    if (portFlag && portFlag !== true) parsed.port = portFlag
    if (!parsed.host) {
      console.error('Invalid target. Use: user@host or host:port')
      process.exit(1)
    }
    const url = buildConnectUrl(parsed)
    console.log(`Connecting to ${parsed.user ? parsed.user + '@' : ''}${parsed.host}:${parsed.port || 22}...`)
    openUrl(url)
    break
  }

  case 'sftp': {
    const target = args[1]
    if (!target) {
      console.error('Usage: sterminal sftp user@host [-p port]')
      process.exit(1)
    }
    const parsed = parseTarget(target)
    const portFlag = getFlag('-p', '--port')
    if (portFlag && portFlag !== true) parsed.port = portFlag
    const searchParams = new URLSearchParams()
    if (parsed.host) searchParams.set('host', parsed.host)
    if (parsed.user) searchParams.set('user', parsed.user)
    if (parsed.port) searchParams.set('port', parsed.port)
    const url = `sterminal://sftp?${searchParams.toString()}`
    console.log(`Opening SFTP to ${parsed.user ? parsed.user + '@' : ''}${parsed.host}:${parsed.port || 22}...`)
    openUrl(url)
    break
  }

  case 'connect': {
    const name = args[1]
    if (!name) {
      console.error('Usage: sterminal connect <host-name>')
      process.exit(1)
    }
    const url = buildConnectUrl({ name })
    console.log(`Connecting to "${name}"...`)
    openUrl(url)
    break
  }

  case 'list': {
    console.log('Opening STerminal host list...')
    openUrl('sterminal://open')
    break
  }

  case 'open': {
    openUrl('sterminal://open')
    break
  }

  case 'new': {
    console.log('Opening new terminal...')
    openUrl('sterminal://new-terminal')
    break
  }

  case 'version':
  case '-v':
  case '--version': {
    console.log(`STerminal CLI v${VERSION}`)
    break
  }

  case 'help':
  case '-h':
  case '--help':
  default: {
    console.log(`
STerminal CLI v${VERSION}

Usage:
  sterminal <command> [options]

Commands:
  ssh <user@host> [-p port]    Connect via SSH
  sftp <user@host> [-p port]   Open SFTP file manager
  connect <name>               Connect to a saved host by name
  list                         Open STerminal and show hosts
  open                         Open/focus STerminal window
  new                          Open a new local terminal
  version                      Show version
  help                         Show this help

Examples:
  sterminal ssh root@10.0.0.1
  sterminal ssh deploy@prod.example.com -p 2222
  sterminal sftp admin@files.example.com
  sterminal connect "Production Server"
  sterminal new
`.trim())
    break
  }
}
