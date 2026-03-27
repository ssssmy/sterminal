// GIF Exporter — 将 asciicast v2 录制转换为 GIF 动画
// 使用 node-canvas 逐帧渲染终端输出，gif-encoder-2 编码为 GIF

import { createCanvas, registerFont } from 'canvas'
import GIFEncoder from 'gif-encoder-2'
import * as fs from 'fs'
import * as path from 'path'

// ===== 类型 =====

interface AsciicastHeader {
  version: number
  width: number
  height: number
  timestamp?: number
  title?: string
}

interface AsciicastEvent {
  time: number   // seconds since start
  type: string   // 'o' = output
  data: string   // terminal output data
}

interface ExportOptions {
  inputPath: string      // asciicast 文件路径
  outputPath: string     // 输出 GIF 路径
  fps?: number           // 帧率（默认 10）
  maxDuration?: number   // 最大导出时长秒数（默认 300）
  fontSize?: number      // 字号（默认 14）
  fontFamily?: string    // 字体
  watermark?: string     // 水印文字
  onProgress?: (pct: number) => void
}

// ===== 终端状态模拟器（简化版） =====

class SimpleTerminalState {
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

  // 处理终端输出（简化 — 仅支持基本文本 + CR/LF/BS + 简单 CSI 序列）
  write(data: string): void {
    let i = 0
    while (i < data.length) {
      const ch = data[i]

      // ESC sequence
      if (ch === '\x1b' && i + 1 < data.length) {
        if (data[i + 1] === '[') {
          // CSI sequence — skip to terminator
          let j = i + 2
          while (j < data.length && !/[A-Za-z]/.test(data[j])) j++
          const cmd = j < data.length ? data[j] : ''
          const params = data.slice(i + 2, j)

          if (cmd === 'H' || cmd === 'f') {
            // Cursor position
            const parts = params.split(';').map(Number)
            this.cursorRow = Math.min(Math.max((parts[0] || 1) - 1, 0), this.rows - 1)
            this.cursorCol = Math.min(Math.max((parts[1] || 1) - 1, 0), this.cols - 1)
          } else if (cmd === 'J') {
            // Erase display
            const n = parseInt(params) || 0
            if (n === 2 || n === 3) {
              this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(' '))
              this.cursorRow = 0
              this.cursorCol = 0
            }
          } else if (cmd === 'K') {
            // Erase line
            for (let c = this.cursorCol; c < this.cols; c++) {
              this.grid[this.cursorRow][c] = ' '
            }
          } else if (cmd === 'A') {
            this.cursorRow = Math.max(0, this.cursorRow - (parseInt(params) || 1))
          } else if (cmd === 'B') {
            this.cursorRow = Math.min(this.rows - 1, this.cursorRow + (parseInt(params) || 1))
          } else if (cmd === 'C') {
            this.cursorCol = Math.min(this.cols - 1, this.cursorCol + (parseInt(params) || 1))
          } else if (cmd === 'D') {
            this.cursorCol = Math.max(0, this.cursorCol - (parseInt(params) || 1))
          }
          // Skip SGR (m) and other sequences silently
          i = j + 1
          continue
        } else if (data[i + 1] === ']') {
          // OSC sequence — skip to ST or BEL
          let j = i + 2
          while (j < data.length && data[j] !== '\x07' && !(data[j] === '\x1b' && data[j + 1] === '\\')) j++
          i = data[j] === '\x07' ? j + 1 : j + 2
          continue
        }
        i += 2
        continue
      }

      // 普通控制字符
      if (ch === '\r') {
        this.cursorCol = 0
        i++
        continue
      }
      if (ch === '\n') {
        this.cursorRow++
        if (this.cursorRow >= this.rows) {
          // Scroll up
          this.grid.shift()
          this.grid.push(Array(this.cols).fill(' '))
          this.cursorRow = this.rows - 1
        }
        i++
        continue
      }
      if (ch === '\b') {
        this.cursorCol = Math.max(0, this.cursorCol - 1)
        i++
        continue
      }
      if (ch === '\t') {
        const next = ((this.cursorCol >> 3) + 1) << 3
        this.cursorCol = Math.min(next, this.cols - 1)
        i++
        continue
      }

      // 跳过其他控制字符
      if (ch.charCodeAt(0) < 32) {
        i++
        continue
      }

      // 可打印字符
      if (this.cursorCol >= this.cols) {
        this.cursorCol = 0
        this.cursorRow++
        if (this.cursorRow >= this.rows) {
          this.grid.shift()
          this.grid.push(Array(this.cols).fill(' '))
          this.cursorRow = this.rows - 1
        }
      }
      this.grid[this.cursorRow][this.cursorCol] = ch
      this.cursorCol++
      i++
    }
  }

  getLines(): string[] {
    return this.grid.map(row => row.join(''))
  }
}

// ===== 解析 asciicast =====

function parseAsciicast(content: string): { header: AsciicastHeader; events: AsciicastEvent[] } {
  const lines = content.trim().split('\n')
  if (lines.length < 1) throw new Error('Empty asciicast file')

  const header: AsciicastHeader = JSON.parse(lines[0])
  const events: AsciicastEvent[] = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i])
      if (Array.isArray(parsed) && parsed.length >= 3 && parsed[1] === 'o') {
        events.push({ time: parsed[0], type: 'o', data: parsed[2] })
      }
    } catch { /* skip malformed lines */ }
  }

  return { header, events }
}

// ===== 渲染帧 =====

function renderFrame(
  ctx: InstanceType<typeof import('canvas').Canvas> extends never ? never : ReturnType<typeof createCanvas> extends infer C ? C extends { getContext: (t: '2d') => infer Ctx } ? Ctx : never : never,
  termState: SimpleTerminalState,
  opts: { fontSize: number; fontFamily: string; cols: number; rows: number; watermark?: string; width: number; height: number }
): void {
  const { fontSize, fontFamily, cols, rows, watermark, width, height } = opts
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * 1.3
  const padX = 8
  const padY = 8

  // Background
  ctx.fillStyle = '#1a1b2e'
  ctx.fillRect(0, 0, width, height)

  // Terminal text
  ctx.font = `${fontSize}px "${fontFamily}"`
  ctx.fillStyle = '#e2e8f0'
  ctx.textBaseline = 'top'

  const lines = termState.getLines()
  for (let r = 0; r < Math.min(rows, lines.length); r++) {
    ctx.fillText(lines[r], padX, padY + r * lineHeight)
  }

  // Watermark
  if (watermark) {
    ctx.font = `${Math.max(10, fontSize * 0.7)}px "${fontFamily}"`
    ctx.fillStyle = 'rgba(99, 102, 241, 0.4)'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    ctx.fillText(watermark, width - 8, height - 6)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }
}

// ===== 主导出函数 =====

export async function exportToGif(options: ExportOptions): Promise<{ outputPath: string; frames: number; duration: number }> {
  const {
    inputPath,
    outputPath,
    fps = 10,
    maxDuration = 300,
    fontSize = 14,
    fontFamily = 'monospace',
    watermark = 'STerminal',
    onProgress,
  } = options

  // 读取 asciicast
  const content = fs.readFileSync(inputPath, 'utf-8')
  const { header, events } = parseAsciicast(content)

  if (events.length === 0) throw new Error('No output events in recording')

  const cols = header.width || 80
  const rows = header.height || 24
  const charWidth = fontSize * 0.6
  const lineHeight = fontSize * 1.3
  const padX = 8
  const padY = 8
  const width = Math.round(cols * charWidth + padX * 2)
  const height = Math.round(rows * lineHeight + padY * 2)

  // 计算时长
  const recordingDuration = events[events.length - 1].time
  const duration = Math.min(recordingDuration, maxDuration)
  const frameInterval = 1 / fps
  const totalFrames = Math.ceil(duration / frameInterval)

  // 初始化 canvas & encoder
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  const encoder = new GIFEncoder(width, height, 'neuquant', true)
  encoder.setDelay(Math.round(1000 / fps))
  encoder.setRepeat(0) // loop forever
  encoder.setQuality(10)
  encoder.start()

  // 逐帧渲染
  const termState = new SimpleTerminalState(cols, rows)
  let eventIdx = 0

  for (let frame = 0; frame < totalFrames; frame++) {
    const frameTime = frame * frameInterval

    // 应用到当前帧时间的所有事件
    while (eventIdx < events.length && events[eventIdx].time <= frameTime) {
      termState.write(events[eventIdx].data)
      eventIdx++
    }

    // 渲染帧
    renderFrame(ctx as any, termState, { fontSize, fontFamily, cols, rows, watermark, width, height })
    encoder.addFrame(ctx as any)

    // 进度回调
    if (onProgress && frame % 10 === 0) {
      onProgress(Math.round((frame / totalFrames) * 100))
    }
  }

  encoder.finish()

  // 写入文件
  const buffer = encoder.out.getData()
  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(outputPath, buffer)

  return { outputPath, frames: totalFrames, duration }
}
