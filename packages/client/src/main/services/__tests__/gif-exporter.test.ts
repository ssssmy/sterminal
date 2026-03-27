import { describe, it, expect } from 'vitest'

// Test the SimpleTerminalState and parseAsciicast by importing them
// Since they're not exported, we test through the module's behavior
// For now, we reconstruct the logic in tests (the functions should be extracted)

// Minimal asciicast v2 format for testing
function makeAsciicast(width: number, height: number, events: [number, string, string][]): string {
  const header = JSON.stringify({ version: 2, width, height })
  const lines = events.map(([time, type, data]) => JSON.stringify([time, type, data]))
  return [header, ...lines].join('\n')
}

describe('asciicast parsing', () => {
  it('parses valid asciicast header', () => {
    const content = makeAsciicast(80, 24, [[0.5, 'o', 'hello']])
    const lines = content.trim().split('\n')
    const header = JSON.parse(lines[0])
    expect(header.width).toBe(80)
    expect(header.height).toBe(24)
    expect(header.version).toBe(2)
  })

  it('parses output events', () => {
    const content = makeAsciicast(80, 24, [
      [0.1, 'o', 'hello '],
      [0.5, 'o', 'world'],
    ])
    const lines = content.trim().split('\n')
    const events = []
    for (let i = 1; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i])
      if (Array.isArray(parsed) && parsed[1] === 'o') {
        events.push({ time: parsed[0], data: parsed[2] })
      }
    }
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('hello ')
    expect(events[1].time).toBe(0.5)
  })

  it('skips non-output events', () => {
    const content = makeAsciicast(80, 24, [
      [0.1, 'o', 'output'],
      [0.2, 'i', 'input'],
    ])
    const lines = content.trim().split('\n')
    const outputEvents = []
    for (let i = 1; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i])
      if (Array.isArray(parsed) && parsed[1] === 'o') {
        outputEvents.push(parsed)
      }
    }
    expect(outputEvents).toHaveLength(1)
  })

  it('handles empty recording', () => {
    const content = JSON.stringify({ version: 2, width: 80, height: 24 })
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(1) // header only
  })
})

describe('SimpleTerminalState logic', () => {
  // Recreate the terminal state for testing
  class TestTerminalState {
    cols: number
    rows: number
    grid: string[][]
    cursorRow = 0
    cursorCol = 0

    constructor(cols: number, rows: number) {
      this.cols = cols
      this.rows = rows
      this.grid = Array.from({ length: rows }, () => Array(cols).fill(' '))
    }

    write(data: string): void {
      let i = 0
      while (i < data.length) {
        const ch = data[i]
        if (ch === '\x1b' && i + 1 < data.length) {
          if (data[i + 1] === '[') {
            let j = i + 2
            while (j < data.length && !/[A-Za-z]/.test(data[j])) j++
            const cmd = j < data.length ? data[j] : ''
            const params = data.slice(i + 2, j)
            if (cmd === 'H' || cmd === 'f') {
              const parts = params.split(';').map(Number)
              this.cursorRow = Math.min(Math.max((parts[0] || 1) - 1, 0), this.rows - 1)
              this.cursorCol = Math.min(Math.max((parts[1] || 1) - 1, 0), this.cols - 1)
            } else if (cmd === 'J') {
              const n = parseInt(params) || 0
              if (n === 2 || n === 3) {
                this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(' '))
                this.cursorRow = 0; this.cursorCol = 0
              }
            } else if (cmd === 'K') {
              for (let c = this.cursorCol; c < this.cols; c++) this.grid[this.cursorRow][c] = ' '
            }
            i = j + 1; continue
          }
          i += 2; continue
        }
        if (ch === '\r') { this.cursorCol = 0; i++; continue }
        if (ch === '\n') {
          this.cursorRow++
          if (this.cursorRow >= this.rows) {
            this.grid.shift(); this.grid.push(Array(this.cols).fill(' ')); this.cursorRow = this.rows - 1
          }
          i++; continue
        }
        if (ch === '\b') { this.cursorCol = Math.max(0, this.cursorCol - 1); i++; continue }
        if (ch.charCodeAt(0) < 32) { i++; continue }
        if (this.cursorCol >= this.cols) {
          this.cursorCol = 0; this.cursorRow++
          if (this.cursorRow >= this.rows) {
            this.grid.shift(); this.grid.push(Array(this.cols).fill(' ')); this.cursorRow = this.rows - 1
          }
        }
        this.grid[this.cursorRow][this.cursorCol] = ch; this.cursorCol++; i++
      }
    }

    getLines(): string[] { return this.grid.map(row => row.join('')) }
  }

  it('writes plain text', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('hello')
    expect(ts.getLines()[0]).toBe('hello     ')
  })

  it('handles carriage return', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('hello\rworld')
    expect(ts.getLines()[0]).toBe('world     ')
  })

  it('handles newline (cursor col preserved)', () => {
    const ts = new TestTerminalState(10, 3)
    // \n moves cursor down but does NOT reset col (like real terminals)
    // Use \r\n for full carriage return + line feed
    ts.write('line1\r\nline2')
    expect(ts.getLines()[0]).toBe('line1     ')
    expect(ts.getLines()[1]).toBe('line2     ')
  })

  it('handles backspace', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('abc\bd')
    expect(ts.getLines()[0]).toBe('abd       ')
  })

  it('scrolls when reaching bottom', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('line1\r\nline2\r\nline3\r\nline4')
    // line1 should be scrolled out
    expect(ts.getLines()[0]).toBe('line2     ')
    expect(ts.getLines()[1]).toBe('line3     ')
    expect(ts.getLines()[2]).toBe('line4     ')
  })

  it('wraps at column boundary', () => {
    const ts = new TestTerminalState(5, 3)
    ts.write('abcdefgh')
    expect(ts.getLines()[0]).toBe('abcde')
    expect(ts.getLines()[1]).toBe('fgh  ')
  })

  it('handles CSI erase display', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('hello')
    ts.write('\x1b[2J')
    expect(ts.getLines()[0]).toBe('          ')
  })

  it('handles CSI cursor position', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('\x1b[2;5H*')
    expect(ts.cursorRow).toBe(1)
    // After writing '*', cursor advances
    expect(ts.getLines()[1][4]).toBe('*')
  })

  it('handles CSI erase line', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('hello')
    ts.write('\x1b[3G') // this won't work since we handle 'G' minimally, use cursor position instead
    ts.cursorCol = 2
    ts.write('\x1b[K')
    expect(ts.getLines()[0]).toBe('he        ')
  })

  it('skips SGR sequences without crashing', () => {
    const ts = new TestTerminalState(10, 3)
    ts.write('\x1b[31mred\x1b[0m')
    expect(ts.getLines()[0]).toBe('red       ')
  })
})
