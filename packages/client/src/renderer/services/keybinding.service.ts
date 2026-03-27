import { IPC_DB } from '@shared/types/ipc-channels'

// Parsed shortcut representation
interface ParsedShortcut {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  key: string // lowercase key name
}

// Registered binding
interface RegisteredBinding {
  action: string
  shortcut: ParsedShortcut
  shortcutStr: string
  callback: () => void
  defaultShortcut: string
}

class KeybindingService {
  private bindings: Map<string, RegisteredBinding> = new Map()
  private customBindings: Map<string, string> = new Map() // action → shortcut override from DB
  private platform: 'darwin' | 'win32' | 'linux' = 'linux'

  constructor() {
    this.platform = ((window as any).electronAPI?.platform as 'darwin' | 'win32' | 'linux') || 'linux'
  }

  // Load custom bindings from DB
  async loadFromDb(): Promise<void> {
    try {
      const rows = await (window as any).electronAPI.ipc.invoke(IPC_DB.KEYBINDINGS_LIST) as { action: string; shortcut: string }[] | undefined
      if (!Array.isArray(rows)) return
      for (const row of rows) {
        this.customBindings.set(row.action, row.shortcut)
      }
      // Re-apply custom bindings to any already-registered actions
      for (const [action, binding] of this.bindings.entries()) {
        const custom = this.customBindings.get(action)
        const shortcutStr = custom || binding.defaultShortcut
        const parsed = this.parseShortcut(shortcutStr)
        if (parsed) {
          binding.shortcut = parsed
          binding.shortcutStr = shortcutStr
        }
      }
    } catch {
      // DB load failure → use defaults silently
    }
  }

  // Register an action with a default shortcut and callback.
  // The actual shortcut used is: customBindings[action] || defaultShortcut
  register(action: string, defaultShortcut: string, callback: () => void): void {
    const custom = this.customBindings.get(action)
    const shortcutStr = custom || defaultShortcut
    const parsed = this.parseShortcut(shortcutStr)
    if (!parsed) {
      console.warn(`[keybinding] Invalid shortcut "${shortcutStr}" for action "${action}", skipping`)
      return
    }
    this.bindings.set(action, {
      action,
      shortcut: parsed,
      shortcutStr,
      callback,
      defaultShortcut,
    })
  }

  // Unregister an action
  unregister(action: string): void {
    this.bindings.delete(action)
  }

  // Handle a keyboard event. Returns true if consumed.
  handleKeyEvent(e: KeyboardEvent): boolean {
    for (const binding of this.bindings.values()) {
      if (this.matchEvent(e, binding.shortcut)) {
        e.preventDefault()
        binding.callback()
        return true
      }
    }
    return false
  }

  // Parse a shortcut string like "Ctrl+Shift+P" or "CmdOrCtrl+T"
  // "CmdOrCtrl" resolves to Meta on macOS, Ctrl on others
  parseShortcut(shortcut: string): ParsedShortcut | null {
    if (!shortcut || shortcut.trim() === '') return null

    // Split on '+' but preserve a trailing '+' as the key itself (e.g. "Ctrl++")
    // Strategy: split normally, then check if the last part is empty (meaning the original ended with '+')
    const raw = shortcut.trim()
    let parts: string[]
    if (raw.endsWith('+') && raw.length > 1) {
      // e.g. "Ctrl++" → ["Ctrl", "", ""] after split, or "Ctrl++" → key is "+"
      const withoutLast = raw.slice(0, -1)
      parts = withoutLast.split('+')
      // The last part after removing trailing '+' may be empty if there was "Ctrl++"
      // e.g. "Ctrl++" → withoutLast = "Ctrl+" → split('+') = ["Ctrl", ""]
      // Replace last empty part with "+"
      if (parts[parts.length - 1] === '') {
        parts[parts.length - 1] = '+'
      } else {
        parts.push('+')
      }
    } else {
      parts = raw.split('+')
    }

    let ctrl = false
    let shift = false
    let alt = false
    let meta = false
    let key = ''

    for (const part of parts) {
      const lower = part.toLowerCase()
      if (lower === 'ctrl') {
        ctrl = true
      } else if (lower === 'shift') {
        shift = true
      } else if (lower === 'alt') {
        alt = true
      } else if (lower === 'meta' || lower === 'cmd') {
        meta = true
      } else if (lower === 'cmdorctrl') {
        if (this.platform === 'darwin') {
          meta = true
        } else {
          ctrl = true
        }
      } else if (part !== '') {
        // This is the key
        key = lower
      }
    }

    if (!key) return null

    return { ctrl, shift, alt, meta, key }
  }

  // Check if a KeyboardEvent matches a ParsedShortcut
  matchEvent(e: KeyboardEvent, parsed: ParsedShortcut): boolean {
    if (e.ctrlKey !== parsed.ctrl) return false
    if (e.shiftKey !== parsed.shift) return false
    if (e.altKey !== parsed.alt) return false
    if (e.metaKey !== parsed.meta) return false
    return e.key.toLowerCase() === parsed.key
  }

  // Get all registered bindings (for settings UI)
  getAllBindings(): { action: string; shortcut: string }[] {
    return Array.from(this.bindings.values()).map(b => ({
      action: b.action,
      shortcut: b.shortcutStr,
    }))
  }

  // Update a binding (saves to DB)
  async updateBinding(action: string, newShortcut: string): Promise<void> {
    const parsed = this.parseShortcut(newShortcut)
    if (!parsed) {
      console.warn(`[keybinding] Invalid shortcut "${newShortcut}" for updateBinding`)
      return
    }
    // Save previous state for rollback on DB failure
    const prevCustom = this.customBindings.get(action)
    const binding = this.bindings.get(action)
    const prevShortcut = binding?.shortcut
    const prevShortcutStr = binding?.shortcutStr
    // Optimistic update
    this.customBindings.set(action, newShortcut)
    if (binding) {
      binding.shortcut = parsed
      binding.shortcutStr = newShortcut
    }
    try {
      await (window as any).electronAPI.ipc.invoke(IPC_DB.KEYBINDINGS_SET, action, newShortcut)
    } catch (err) {
      // Rollback on DB failure
      console.warn(`[keybinding] Failed to persist "${action}" → "${newShortcut}", rolling back`, err)
      if (prevCustom !== undefined) {
        this.customBindings.set(action, prevCustom)
      } else {
        this.customBindings.delete(action)
      }
      if (binding && prevShortcut && prevShortcutStr) {
        binding.shortcut = prevShortcut
        binding.shortcutStr = prevShortcutStr
      }
    }
  }

  // Check for conflicts — returns conflicting action name or null
  findConflict(shortcut: string, excludeAction?: string): string | null {
    const parsed = this.parseShortcut(shortcut)
    if (!parsed) return null
    for (const binding of this.bindings.values()) {
      if (excludeAction && binding.action === excludeAction) continue
      if (
        binding.shortcut.ctrl === parsed.ctrl &&
        binding.shortcut.shift === parsed.shift &&
        binding.shortcut.alt === parsed.alt &&
        binding.shortcut.meta === parsed.meta &&
        binding.shortcut.key === parsed.key
      ) {
        return binding.action
      }
    }
    return null
  }

  // Reset a binding to its registered default
  async resetBinding(action: string): Promise<void> {
    const binding = this.bindings.get(action)
    if (!binding) return
    const defaultShortcut = binding.defaultShortcut
    await (window as any).electronAPI.ipc.invoke(IPC_DB.KEYBINDINGS_SET, action, defaultShortcut)
    this.customBindings.delete(action)
    const parsed = this.parseShortcut(defaultShortcut)
    if (parsed) {
      binding.shortcut = parsed
      binding.shortcutStr = defaultShortcut
    }
  }
}

// Singleton export
export const keybindingService = new KeybindingService()
