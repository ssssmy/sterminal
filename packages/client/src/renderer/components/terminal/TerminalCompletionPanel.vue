<template>
  <Transition name="st-fade">
    <div
      v-if="visible && items.length > 0"
      class="completion-panel"
      :style="panelStyle"
    >
      <div
        v-for="(item, idx) in items"
        :key="item.text + item.source"
        class="completion-panel__item"
        :class="{ 'completion-panel__item--active': idx === activeIndex }"
        @mousedown.prevent="select(idx)"
        @mouseenter="activeIndex = idx"
      >
        <span class="completion-panel__source" :class="`completion-panel__source--${item.source}`">
          {{ sourceLabel(item.source) }}
        </span>
        <span class="completion-panel__label">{{ item.label }}</span>
        <span v-if="item.description" class="completion-panel__desc">{{ item.description }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

export interface CompletionItemUI {
  text: string
  label: string
  source: 'history' | 'snippet' | 'command' | 'ai'
  description?: string
  score: number
}

const props = defineProps<{
  items: CompletionItemUI[]
  visible: boolean
  x: number
  y: number
}>()

const emit = defineEmits<{
  (e: 'select', item: CompletionItemUI): void
  (e: 'dismiss'): void
}>()

const activeIndex = ref(0)

// 列表变化时重置选中
watch(() => props.items, () => {
  activeIndex.value = 0
})

const panelStyle = computed(() => ({
  left: `${props.x}px`,
  bottom: `${props.y}px`,
}))

function sourceLabel(source: string): string {
  switch (source) {
    case 'history': return 'H'
    case 'snippet': return 'S'
    case 'command': return 'C'
    case 'ai': return 'AI'
    default: return '?'
  }
}

function select(idx: number): void {
  const item = props.items[idx]
  if (item) emit('select', item)
}

/** 外部调用：键盘导航 */
function moveUp(): void {
  activeIndex.value = activeIndex.value <= 0 ? props.items.length - 1 : activeIndex.value - 1
}

function moveDown(): void {
  activeIndex.value = activeIndex.value >= props.items.length - 1 ? 0 : activeIndex.value + 1
}

function confirmActive(): void {
  select(activeIndex.value)
}

defineExpose({ moveUp, moveDown, confirmActive })
</script>

<style lang="scss" scoped>
.completion-panel {
  position: absolute;
  z-index: 50;
  min-width: 280px;
  max-width: 480px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--bg-surface, #232438);
  border: 1px solid var(--border, #2e3048);
  border-radius: 6px;
  padding: 4px 0;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
  font-size: 12px;

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    cursor: pointer;
    transition: background-color 0.08s;

    &--active {
      background: var(--bg-hover, #2a2b40);
    }
  }

  &__source {
    width: 20px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 600;
    flex-shrink: 0;

    &--history { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    &--snippet { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    &--command { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    &--ai { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
  }

  &__label {
    color: var(--text-primary, #e4e4e8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
    max-width: 200px;
  }

  &__desc {
    color: var(--text-tertiary, #5c5e72);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    font-size: 11px;
  }
}
</style>
