<template>
  <div class="keybindings-settings">
    <h3 class="section-title">{{ t('settings.keybindings_section') }}</h3>
    <p class="section-desc">{{ t('settings.keybindings_desc') }}</p>

    <div class="settings-block">
      <div class="settings-block__header">
        <h4 class="settings-block__title">{{ t('settings.keybindingsAction') }}</h4>
        <el-button size="small" @click="handleResetAll">
          {{ t('settings.keybindingsResetAll') }}
        </el-button>
      </div>

      <div
        v-for="row in bindingRows"
        :key="row.action"
        class="settings-row"
      >
        <div class="settings-row__info">
          <label class="settings-row__label">{{ getActionLabel(row.action) }}</label>
          <span v-if="row.conflict" class="settings-row__conflict">
            {{ t('settings.keybindingsConflict', { action: getActionLabel(row.conflict) }) }}
          </span>
        </div>

        <div class="settings-row__controls">
          <!-- Recording mode: capture next keypress -->
          <div
            v-if="recordingAction === row.action"
            class="keybinding-capture keybinding-capture--active"
            tabindex="0"
            @keydown.stop.prevent="handleCapture($event, row.action)"
            @blur="cancelRecording"
          >
            {{ t('settings.keybindingsRecording') }}
          </div>

          <!-- Display mode: show current shortcut -->
          <div
            v-else
            class="keybinding-capture"
            :class="{ 'keybinding-capture--conflict': !!row.conflict }"
            @click="startRecording(row.action)"
          >
            <template v-if="row.shortcut">
              <kbd
                v-for="part in formatShortcut(row.shortcut)"
                :key="part"
                class="keybinding-key"
              >{{ part }}</kbd>
            </template>
            <span v-else class="keybinding-capture__empty">—</span>
          </div>

          <el-button
            size="small"
            text
            :title="t('settings.keybindingsReset')"
            @click="handleReset(row.action)"
          >
            {{ t('settings.keybindingsReset') }}
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { keybindingService } from '../../services/keybinding.service'

const { t } = useI18n()

// ===== State =====

interface BindingRow {
  action: string
  shortcut: string
  conflict: string | null
}

const bindingRows = ref<BindingRow[]>([])
const recordingAction = ref<string | null>(null)

// ===== Action label map =====

const ACTION_LABELS: Record<string, string> = {
  'new-tab': 'settings.keybindingsActions.new-tab',
  'close-tab': 'settings.keybindingsActions.close-tab',
  'command-palette': 'settings.keybindingsActions.command-palette',
  'command-palette-alt': 'settings.keybindingsActions.command-palette-alt',
  'terminal-search': 'settings.keybindingsActions.terminal-search',
}

function getActionLabel(action: string): string {
  const key = ACTION_LABELS[action]
  if (key) return t(key)
  return action
}

// ===== Load bindings =====

function loadBindings(): void {
  const all = keybindingService.getAllBindings()
  bindingRows.value = all.map(b => ({
    action: b.action,
    shortcut: b.shortcut,
    conflict: null,
  }))
}

onMounted(() => {
  loadBindings()
})

// ===== Shortcut formatting =====

/**
 * Split a shortcut string like "CmdOrCtrl+Shift+P" into display parts.
 * On macOS: CmdOrCtrl → ⌘, Ctrl → ⌃, Alt → ⌥, Shift → ⇧
 * On other platforms: CmdOrCtrl → Ctrl
 */
const isMacOS = window.electronAPI?.platform === 'darwin'

function formatShortcut(shortcut: string): string[] {
  const parts = shortcut.split('+').filter(Boolean)
  return parts.map(p => {
    const lower = p.toLowerCase()
    if (lower === 'cmdorctrl') return isMacOS ? '⌘' : 'Ctrl'
    if (lower === 'meta' || lower === 'cmd') return isMacOS ? '⌘' : 'Meta'
    if (lower === 'ctrl') return isMacOS ? '⌃' : 'Ctrl'
    if (lower === 'alt') return isMacOS ? '⌥' : 'Alt'
    if (lower === 'shift') return isMacOS ? '⇧' : 'Shift'
    return p.charAt(0).toUpperCase() + p.slice(1)
  })
}

// ===== Recording =====

function startRecording(action: string): void {
  recordingAction.value = action
  // Focus the capture element on next tick
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>('.keybinding-capture--active')
    el?.focus()
  }, 0)
}

function cancelRecording(): void {
  recordingAction.value = null
}

function handleCapture(e: KeyboardEvent, action: string): void {
  // Ignore lone modifier presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.metaKey) parts.push('Meta')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  const key = e.key === ' ' ? 'Space' : e.key
  parts.push(key)

  const shortcut = parts.join('+')
  recordingAction.value = null

  applyBinding(action, shortcut)
}

async function applyBinding(action: string, shortcut: string): Promise<void> {
  const conflict = keybindingService.findConflict(shortcut, action)
  const row = bindingRows.value.find(r => r.action === action)
  if (!row) return

  row.shortcut = shortcut
  row.conflict = conflict

  try {
    await keybindingService.updateBinding(action, shortcut)
    if (!conflict) {
      ElMessage.success(t('settings.keybindingsSaved'))
    }
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

// ===== Reset =====

async function handleReset(action: string): Promise<void> {
  try {
    await keybindingService.resetBinding(action)
    loadBindings()
    ElMessage.success(t('settings.keybindingsSaved'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}

async function handleResetAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('settings.keybindingsResetAllConfirm'),
      t('settings.keybindingsResetAll'),
      {
        confirmButtonText: t('settings.reset'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
      }
    )
  } catch {
    return
  }

  try {
    for (const row of bindingRows.value) {
      await keybindingService.resetBinding(row.action)
    }
    loadBindings()
    ElMessage.success(t('settings.keybindingsSaved'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
  }
}
</script>

<style lang="scss" scoped>
.keybindings-settings {
  max-width: 680px;

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .section-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }
}

.settings-block {
  margin-bottom: 32px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  min-height: 48px;
  border-bottom: 1px solid var(--divider);

  &:last-child {
    border-bottom: none;
  }

  &__info {
    flex: 1;
    margin-right: 24px;
  }

  &__label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  &__conflict {
    font-size: 12px;
    color: var(--el-color-warning);
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.keybinding-capture {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  min-width: 140px;
  min-height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-inset);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  outline: none;

  &:hover {
    border-color: var(--accent);
  }

  &--active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    font-size: 12px;
    color: var(--text-secondary);
    cursor: text;
    justify-content: center;
  }

  &--conflict {
    border-color: var(--el-color-warning);
  }

  &__empty {
    color: var(--text-tertiary);
    font-size: 12px;
  }
}

.keybinding-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  min-width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
  font-weight: 600;
  background: var(--accent);
  color: #fff;
  line-height: 1;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
}
</style>
