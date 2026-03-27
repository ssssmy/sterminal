import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.electronAPI before importing the service
vi.stubGlobal('window', {
  ...globalThis.window,
  electronAPI: {
    platform: 'darwin',
    ipc: {
      invoke: vi.fn().mockResolvedValue([]),
    },
  },
})

// We need to test the class directly, not the singleton
// Re-create the service logic for testing
import { keybindingService } from '../keybinding.service'

describe('keybindingService', () => {
  beforeEach(() => {
    // Reset by unregistering all
    for (const b of keybindingService.getAllBindings()) {
      keybindingService.unregister(b.action)
    }
  })

  describe('parseShortcut', () => {
    it('parses simple shortcut', () => {
      const result = keybindingService.parseShortcut('Ctrl+P')
      expect(result).toEqual({ ctrl: true, shift: false, alt: false, meta: false, key: 'p' })
    })

    it('parses multi-modifier shortcut', () => {
      const result = keybindingService.parseShortcut('Ctrl+Shift+P')
      expect(result).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: 'p' })
    })

    it('parses CmdOrCtrl based on platform', () => {
      // In test env, platform defaults to what window.electronAPI.platform returns
      // The singleton reads platform at construction time
      const result = keybindingService.parseShortcut('CmdOrCtrl+T')
      expect(result).not.toBeNull()
      // CmdOrCtrl resolves to either ctrl or meta depending on platform
      expect(result!.key).toBe('t')
      expect(result!.ctrl || result!.meta).toBe(true)
    })

    it('parses Cmd as Meta', () => {
      const result = keybindingService.parseShortcut('Cmd+K')
      expect(result).toEqual({ ctrl: false, shift: false, alt: false, meta: true, key: 'k' })
    })

    it('parses Alt modifier', () => {
      const result = keybindingService.parseShortcut('Alt+F4')
      expect(result).toEqual({ ctrl: false, shift: false, alt: true, meta: false, key: 'f4' })
    })

    it('handles + key at end (e.g., Ctrl++)', () => {
      const result = keybindingService.parseShortcut('Ctrl++')
      expect(result).not.toBeNull()
      expect(result!.ctrl).toBe(true)
      expect(result!.key).toBe('+')
    })

    it('returns null for empty string', () => {
      expect(keybindingService.parseShortcut('')).toBeNull()
    })

    it('returns null for whitespace only', () => {
      expect(keybindingService.parseShortcut('   ')).toBeNull()
    })

    it('treats Ctrl+ as Ctrl with + key', () => {
      // "Ctrl+" is parsed as Ctrl + "+" key (the plus sign is a valid key)
      const result = keybindingService.parseShortcut('Ctrl+')
      expect(result).not.toBeNull()
      expect(result!.ctrl).toBe(true)
      expect(result!.key).toBe('+')
    })

    it('is case insensitive for modifiers', () => {
      const result = keybindingService.parseShortcut('ctrl+shift+p')
      expect(result).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: 'p' })
    })

    it('lowercases the key', () => {
      const result = keybindingService.parseShortcut('Ctrl+P')
      expect(result!.key).toBe('p')
    })
  })

  describe('matchEvent', () => {
    it('matches correct event', () => {
      const parsed = keybindingService.parseShortcut('Ctrl+Shift+P')!
      const event = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'p' } as KeyboardEvent
      expect(keybindingService.matchEvent(event, parsed)).toBe(true)
    })

    it('rejects wrong modifier', () => {
      const parsed = keybindingService.parseShortcut('Ctrl+P')!
      const event = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, key: 'p' } as KeyboardEvent
      expect(keybindingService.matchEvent(event, parsed)).toBe(false)
    })

    it('rejects wrong key', () => {
      const parsed = keybindingService.parseShortcut('Ctrl+P')!
      const event = { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'k' } as KeyboardEvent
      expect(keybindingService.matchEvent(event, parsed)).toBe(false)
    })

    it('rejects extra modifier on event', () => {
      const parsed = keybindingService.parseShortcut('Ctrl+P')!
      const event = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'p' } as KeyboardEvent
      expect(keybindingService.matchEvent(event, parsed)).toBe(false)
    })
  })

  describe('register / unregister', () => {
    it('registers a binding', () => {
      keybindingService.register('test-action', 'Ctrl+T', () => {})
      const bindings = keybindingService.getAllBindings()
      expect(bindings).toHaveLength(1)
      expect(bindings[0].action).toBe('test-action')
    })

    it('unregisters a binding', () => {
      keybindingService.register('test-action', 'Ctrl+T', () => {})
      keybindingService.unregister('test-action')
      expect(keybindingService.getAllBindings()).toHaveLength(0)
    })

    it('skips registration with invalid shortcut', () => {
      keybindingService.register('bad-action', '', () => {})
      expect(keybindingService.getAllBindings()).toHaveLength(0)
    })
  })

  describe('findConflict', () => {
    it('detects conflict', () => {
      keybindingService.register('action-a', 'Ctrl+K', () => {})
      const conflict = keybindingService.findConflict('Ctrl+K')
      expect(conflict).toBe('action-a')
    })

    it('returns null when no conflict', () => {
      keybindingService.register('action-a', 'Ctrl+K', () => {})
      expect(keybindingService.findConflict('Ctrl+J')).toBeNull()
    })

    it('excludes specified action', () => {
      keybindingService.register('action-a', 'Ctrl+K', () => {})
      expect(keybindingService.findConflict('Ctrl+K', 'action-a')).toBeNull()
    })

    it('returns null for invalid shortcut', () => {
      expect(keybindingService.findConflict('')).toBeNull()
    })
  })

  describe('handleKeyEvent', () => {
    it('executes callback on match', () => {
      const callback = vi.fn()
      keybindingService.register('my-action', 'Ctrl+P', callback)
      const event = {
        ctrlKey: true, shiftKey: false, altKey: false, metaKey: false,
        key: 'p', preventDefault: vi.fn(),
      } as unknown as KeyboardEvent

      const consumed = keybindingService.handleKeyEvent(event)
      expect(consumed).toBe(true)
      expect(callback).toHaveBeenCalledOnce()
      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('returns false when no match', () => {
      keybindingService.register('my-action', 'Ctrl+P', vi.fn())
      const event = {
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
        key: 'a', preventDefault: vi.fn(),
      } as unknown as KeyboardEvent

      expect(keybindingService.handleKeyEvent(event)).toBe(false)
    })
  })
})
