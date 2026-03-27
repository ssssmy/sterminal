<template>
  <el-dialog
    v-model="visible"
    :title="t('settings.replayTitle')"
    width="80vw"
    :close-on-click-modal="false"
    @opened="initReplay"
    @close="destroyReplay"
  >
    <div class="replay-dialog">
      <!-- 加载/错误状态 -->
      <div v-if="loading" class="replay-dialog__status">
        <el-icon class="is-loading"><Loading /></el-icon>
        {{ t('settings.replayLoading') }}
      </div>
      <div v-else-if="error" class="replay-dialog__status replay-dialog__status--error">
        {{ error }}
      </div>

      <!-- 终端回放区 -->
      <div ref="terminalRef" class="replay-dialog__terminal" />

      <!-- 控制栏 -->
      <div v-if="events.length > 0" class="replay-dialog__controls">
        <button class="replay-dialog__play-btn" @click="togglePlay">
          <el-icon :size="20">
            <VideoPlay v-if="!playing" />
            <VideoPause v-else />
          </el-icon>
        </button>

        <span class="replay-dialog__time">{{ formatTime(currentTime) }}</span>

        <el-slider
          :model-value="currentTime"
          :min="0"
          :max="totalDuration"
          :step="0.1"
          :show-tooltip="false"
          class="replay-dialog__progress"
          @change="(v: unknown) => seekTo(Number(v))"
        />

        <span class="replay-dialog__time">{{ formatTime(totalDuration) }}</span>

        <el-select v-model="speed" class="replay-dialog__speed" size="small">
          <el-option label="0.5x" :value="0.5" />
          <el-option label="1x" :value="1" />
          <el-option label="2x" :value="2" />
          <el-option label="5x" :value="5" />
          <el-option label="10x" :value="10" />
        </el-select>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from '@xterm/xterm'
import { Loading, VideoPlay, VideoPause } from '@element-plus/icons-vue'
import { useIpc } from '../../composables/useIpc'
import { IPC_LOG } from '@shared/types/ipc-channels'

const { t } = useI18n()
const { invoke } = useIpc()

const props = defineProps<{
  modelValue: boolean
  logId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const terminalRef = ref<HTMLDivElement>()
const loading = ref(false)
const error = ref('')
const playing = ref(false)
const speed = ref(1)
const currentTime = ref(0)
const totalDuration = ref(0)

interface ReplayEvent {
  time: number
  data: string
}

const events = ref<ReplayEvent[]>([])
let terminal: Terminal | null = null
let playTimer: ReturnType<typeof setTimeout> | null = null
let currentIndex = 0

async function initReplay(): Promise<void> {
  loading.value = true
  error.value = ''
  events.value = []
  currentTime.value = 0
  playing.value = false
  currentIndex = 0

  try {
    const data = await invoke<string>(IPC_LOG.REPLAY, { logId: props.logId })
    if (!data) {
      error.value = t('settings.replayEmpty')
      return
    }

    const lines = data.trim().split('\n')
    if (lines.length < 2) {
      error.value = t('settings.replayEmpty')
      return
    }

    // 解析 header
    const header = JSON.parse(lines[0])
    const cols = header.width || 80
    const rows = header.height || 24

    // 解析事件
    const parsed: ReplayEvent[] = []
    for (let i = 1; i < lines.length; i++) {
      try {
        const ev = JSON.parse(lines[i])
        if (Array.isArray(ev) && ev.length >= 3 && ev[1] === 'o') {
          parsed.push({ time: ev[0], data: ev[2] })
        }
      } catch { /* skip malformed lines */ }
    }
    events.value = parsed
    totalDuration.value = parsed.length > 0 ? parsed[parsed.length - 1].time : 0

    // 创建终端
    if (terminalRef.value) {
      terminal = new Terminal({
        cols,
        rows,
        disableStdin: true,
        cursorBlink: false,
        theme: {
          background: '#1a1b2e',
          foreground: '#e2e8f0',
          cursor: '#6366f1',
        },
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 14,
      })
      terminal.open(terminalRef.value)

      // 自动开始播放
      startPlayback()
    }
  } catch (err) {
    error.value = t('settings.replayError')
  } finally {
    loading.value = false
  }
}

function destroyReplay(): void {
  stopPlayback()
  if (terminal) {
    terminal.dispose()
    terminal = null
  }
  events.value = []
  currentTime.value = 0
  playing.value = false
  currentIndex = 0
}

function togglePlay(): void {
  if (playing.value) {
    stopPlayback()
  } else {
    if (currentIndex >= events.value.length) {
      // 播放结束，重新开始
      seekTo(0)
    }
    startPlayback()
  }
}

function startPlayback(): void {
  playing.value = true
  scheduleNext()
}

function stopPlayback(): void {
  playing.value = false
  if (playTimer) {
    clearTimeout(playTimer)
    playTimer = null
  }
}

function scheduleNext(): void {
  if (!playing.value || currentIndex >= events.value.length) {
    playing.value = false
    return
  }

  const ev = events.value[currentIndex]
  const prevTime = currentIndex > 0 ? events.value[currentIndex - 1].time : 0
  const delay = Math.max(0, (ev.time - prevTime) * 1000 / speed.value)

  // 限制单次延迟上限为 2 秒（避免长时间空白等待）
  const cappedDelay = Math.min(delay, 2000 / speed.value)

  playTimer = setTimeout(() => {
    if (!terminal || !playing.value) return
    terminal.write(ev.data)
    currentTime.value = ev.time
    currentIndex++
    scheduleNext()
  }, cappedDelay)
}

function seekTo(time: number): void {
  stopPlayback()
  if (!terminal) return

  terminal.reset()
  currentIndex = 0
  currentTime.value = 0

  // 快速重放到目标时间
  for (let i = 0; i < events.value.length; i++) {
    if (events.value[i].time > time) break
    terminal.write(events.value[i].data)
    currentIndex = i + 1
    currentTime.value = events.value[i].time
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 倍速变更时如果正在播放，重新调度
watch(speed, () => {
  if (playing.value) {
    if (playTimer) clearTimeout(playTimer)
    scheduleNext()
  }
})

onBeforeUnmount(() => destroyReplay())
</script>

<style lang="scss" scoped>
.replay-dialog {
  display: flex;
  flex-direction: column;
  height: 60vh;

  &__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--text-secondary);
    font-size: 14px;

    &--error { color: var(--error, #ef4444); }
  }

  &__terminal {
    flex: 1;
    overflow: auto;
    border-radius: 6px;
    background: var(--terminal-bg, var(--bg-primary));

    :deep(.xterm) {
      padding: 8px;
    }
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0 0;
  }

  &__play-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--accent, #6366f1);
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;

    &:hover { opacity: 0.85; }
  }

  &__time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
    min-width: 40px;
  }

  &__progress {
    flex: 1;
  }

  &__speed {
    width: 80px;
    flex-shrink: 0;
  }
}
</style>
