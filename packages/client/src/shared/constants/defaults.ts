// 设置项默认值（来自架构文档附录 B）

export const DEFAULT_SETTINGS: Record<string, string | number | boolean> = {
  // === 终端外观 ===
  'terminal.theme':             'sterminal-dark',
  'terminal.fontFamily':        '"JetBrains Mono", "Fira Code", "Menlo", monospace',
  'terminal.fontSize':          14,
  'terminal.fontWeight':        'normal',
  'terminal.lineHeight':        1.2,
  'terminal.letterSpacing':     0,
  'terminal.fontLigatures':     true,
  'terminal.cursorStyle':       'block',
  'terminal.cursorBlink':       true,
  'terminal.scrollback':        5000,
  'terminal.padding':           8,
  'terminal.backgroundOpacity': 100,
  'terminal.backgroundBlur':    false,
  'terminal.gpuAcceleration':   true,

  // === 终端行为 ===
  'terminal.rightClickAction':   'contextMenu',
  'terminal.copyOnSelect':       false,
  'terminal.copyWithFormat':     false,
  'terminal.trimTrailingSpaces': true,
  'terminal.pasteWarning':       true,
  'terminal.trimPasteNewlines':  false,
  'terminal.wordSeparators':     ' .;:\'"~!@#$%^&*()+-=[]{}\\|,.<>?/',
  'terminal.bell':               'none',
  'terminal.focusFollowMouse':   false,
  'terminal.linkModifier':       'ctrl',
  'terminal.scrollSensitivity':  3,

  // === Shell 集成 ===
  'shell.default':               '',
  'shell.defaultCwd':            '',
  'shell.inheritEnv':            true,
  'shell.customEnv':             '{}',
  'shell.loginShell':            false,
  'shell.termEnv':               'xterm-256color',

  // === 应用外观 ===
  'app.theme':                   'system',
  'app.accentColor':             '#6366f1',
  'app.sidebarPosition':         'left',
  'app.sidebarWidth':            260,
  'app.sidebarAutoHide':         false,
  'app.compactMode':             false,
  'app.tabBarPosition':          'top',
  'app.showToolbar':             true,
  'app.showMenuBar':             true,
  'app.titleBarStyle':           'custom',
  'app.windowOpacity':           100,
  'app.language':                'system',
  'app.zoomLevel':               100,

  // === 同步 ===
  'sync.enabled':                true,
  'sync.autoSync':               true,

  // === 通知 ===
  'notification.system':         true,
  'notification.sound':          false,
  'notification.events':         '["disconnect","transferComplete"]',

  // === SFTP ===
  'sftp.panelPosition':          'tab',
  'sftp.defaultView':            'list',
  'sftp.showHidden':             false,
  'sftp.defaultLocalDir':        '',
  'sftp.defaultRemoteDir':       '~',
  'sftp.concurrency':            3,
  'sftp.conflictStrategy':       'ask',
  'sftp.uploadSpeedLimit':       0,
  'sftp.downloadSpeedLimit':     0,
  'sftp.preserveMtime':          true,

  // === 会话 ===
  'session.restoreOnStartup':    true,
  'session.autoReconnect':       true,
  'session.maxReconnectAttempts': 10,

  // === 日志 ===
  'log.autoRecord':              false,
  'log.format':                  'text',
  'log.directory':               '',
  'log.fileNameTemplate':        '{host}_{datetime}.log',
  'log.maxFileSize':             52428800,
  'log.autoClean':               false,
  'log.retainDays':              90,
  'log.timestamp':               false,
  'log.excludePasswords':        false,

  // === 补全 ===
  'autocomplete.enabled':        true,
  'autocomplete.trigger':        'auto',
  'autocomplete.delay':          300,
  'autocomplete.maxSuggestions': 10,
  'autocomplete.sources':        '["history","path","command","snippet"]',

  // === Ping ===
  'ping.enabled':                false,
  'ping.interval':               300,
  'ping.timeout':                3000,
  'ping.method':                 'tcp',

  // === Vault ===
  'vault.clipboardClearTime':    30,
  'vault.lockTimeout':           900,

  // === 备份 ===
  'backup.auto':                 false,
  'backup.interval':             'weekly',
  'backup.retainCount':          5,
  'backup.directory':            '',

  // === 系统 ===
  'system.minimizeToTray':       true,
  'system.startOnBoot':          false,
  'system.startHidden':          false,

  // === 更新 ===
  'update.checkFrequency':       'startup',
  'update.autoDownload':         false,
  'update.channel':              'stable',
}
