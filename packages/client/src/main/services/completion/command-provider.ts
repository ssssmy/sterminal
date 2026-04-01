// 常用命令补全提供器 + 参数提示

import type { CompletionProvider, CompletionRequest, CompletionItem } from './types'

interface CommandDef {
  cmd: string
  desc: string
  args?: string  // 参数提示
}

// 常用 Linux/macOS 命令字典（可扩展）
const COMMANDS: CommandDef[] = [
  { cmd: 'ls', desc: 'List directory', args: '[-la] [path]' },
  { cmd: 'cd', desc: 'Change directory', args: '<path>' },
  { cmd: 'cat', desc: 'Print file', args: '<file>' },
  { cmd: 'grep', desc: 'Search text', args: '[-ri] <pattern> [files]' },
  { cmd: 'find', desc: 'Find files', args: '<path> [-name pattern]' },
  { cmd: 'ps', desc: 'Process status', args: '[-aux]' },
  { cmd: 'kill', desc: 'Kill process', args: '[-9] <pid>' },
  { cmd: 'top', desc: 'System monitor' },
  { cmd: 'htop', desc: 'Interactive monitor' },
  { cmd: 'df', desc: 'Disk free', args: '[-h]' },
  { cmd: 'du', desc: 'Disk usage', args: '[-sh] [path]' },
  { cmd: 'free', desc: 'Memory usage', args: '[-m]' },
  { cmd: 'tail', desc: 'File tail', args: '[-f] [-n N] <file>' },
  { cmd: 'head', desc: 'File head', args: '[-n N] <file>' },
  { cmd: 'less', desc: 'Page viewer', args: '<file>' },
  { cmd: 'vim', desc: 'Text editor', args: '<file>' },
  { cmd: 'nano', desc: 'Text editor', args: '<file>' },
  { cmd: 'chmod', desc: 'Change permissions', args: '<mode> <file>' },
  { cmd: 'chown', desc: 'Change owner', args: '<user:group> <file>' },
  { cmd: 'cp', desc: 'Copy', args: '[-r] <src> <dst>' },
  { cmd: 'mv', desc: 'Move/rename', args: '<src> <dst>' },
  { cmd: 'rm', desc: 'Remove', args: '[-rf] <file>' },
  { cmd: 'mkdir', desc: 'Create directory', args: '[-p] <dir>' },
  { cmd: 'rmdir', desc: 'Remove directory', args: '<dir>' },
  { cmd: 'touch', desc: 'Create file', args: '<file>' },
  { cmd: 'wget', desc: 'Download URL', args: '<url>' },
  { cmd: 'curl', desc: 'HTTP client', args: '[-X method] <url>' },
  { cmd: 'ssh', desc: 'SSH connect', args: '<user@host>' },
  { cmd: 'scp', desc: 'Secure copy', args: '<src> <dst>' },
  { cmd: 'rsync', desc: 'Sync files', args: '[-avz] <src> <dst>' },
  { cmd: 'tar', desc: 'Archive', args: '[-xzf|-czf] <file>' },
  { cmd: 'zip', desc: 'Compress', args: '<out.zip> <files>' },
  { cmd: 'unzip', desc: 'Extract', args: '<file.zip>' },
  { cmd: 'systemctl', desc: 'Service manager', args: '<start|stop|restart|status> <service>' },
  { cmd: 'journalctl', desc: 'System logs', args: '[-u service] [-f]' },
  { cmd: 'docker', desc: 'Docker CLI', args: '<ps|run|stop|logs|exec> ...' },
  { cmd: 'docker-compose', desc: 'Compose CLI', args: '<up|down|ps|logs> ...' },
  { cmd: 'git', desc: 'Git VCS', args: '<clone|pull|push|status|log|diff> ...' },
  { cmd: 'npm', desc: 'Node package', args: '<install|run|test|build> ...' },
  { cmd: 'yarn', desc: 'Yarn package', args: '<add|install|run> ...' },
  { cmd: 'pnpm', desc: 'Pnpm package', args: '<add|install|run> ...' },
  { cmd: 'python', desc: 'Python', args: '[-m module] [script.py]' },
  { cmd: 'pip', desc: 'Python package', args: '<install|freeze|list> ...' },
  { cmd: 'nginx', desc: 'Nginx', args: '-s <reload|stop|start>' },
  { cmd: 'pm2', desc: 'PM2 process', args: '<start|stop|list|logs> ...' },
  { cmd: 'ufw', desc: 'Firewall', args: '<enable|disable|allow|deny> ...' },
  { cmd: 'iptables', desc: 'Packet filter', args: '[-A|-D|-L] ...' },
  { cmd: 'crontab', desc: 'Cron jobs', args: '[-e|-l]' },
  { cmd: 'whoami', desc: 'Current user' },
  { cmd: 'hostname', desc: 'Host name' },
  { cmd: 'uname', desc: 'System info', args: '[-a]' },
  { cmd: 'uptime', desc: 'System uptime' },
  { cmd: 'ping', desc: 'Network ping', args: '<host>' },
  { cmd: 'traceroute', desc: 'Trace route', args: '<host>' },
  { cmd: 'netstat', desc: 'Network stats', args: '[-tlnp]' },
  { cmd: 'ss', desc: 'Socket stats', args: '[-tlnp]' },
  { cmd: 'ifconfig', desc: 'Network config' },
  { cmd: 'ip', desc: 'IP utility', args: '<addr|route|link> ...' },
]

export class CommandProvider implements CompletionProvider {
  readonly name = 'command'
  readonly priority = 3

  getCompletions(request: CompletionRequest): CompletionItem[] {
    const { input, limit = 8 } = request
    if (!input || input.length < 1) return []

    const lower = input.toLowerCase()
    const matches = COMMANDS.filter(c => c.cmd.startsWith(lower))
      .slice(0, limit)

    return matches.map((c, i) => ({
      text: c.cmd,
      label: c.cmd,
      source: 'command' as const,
      description: c.desc + (c.args ? `  ${c.args}` : ''),
      score: 60 - i,
    }))
  }
}
