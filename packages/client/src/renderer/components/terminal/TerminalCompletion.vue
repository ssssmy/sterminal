<template>
  <Transition name="st-fade">
    <div
      v-if="visible && items.length > 0"
      class="terminal-completion"
      :style="{ left: posX + 'px', bottom: posY + 'px' }"
    >
      <div
        v-for="(item, idx) in items"
        :key="item.insertText"
        class="terminal-completion__item"
        :class="{ 'terminal-completion__item--active': idx === activeIndex }"
        @mousedown.prevent="select(item)"
        @mouseenter="activeIndex = idx"
      >
        <span class="terminal-completion__source">{{ item.sourceLabel }}</span>
        <span class="terminal-completion__label">{{ item.label }}</span>
        <span v-if="item.description" class="terminal-completion__desc">{{ item.description }}</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { CompletionItem } from '../../services/completion-service'

const props = defineProps<{
  visible: boolean
  items: CompletionItem[]
  posX: number
  posY: number
}>()

const emit = defineEmits<{
  (e: 'select', item: CompletionItem): void
  (e: 'close'): void
}>()

const activeIndex = ref(0)

watch(() => props.items, () => {
  activeIndex.value = 0
})

function select(item: CompletionItem): void {
  emit('select', item)
}

// 键盘导航（由父组件调用）
function handleKey(key: string): boolean {
  if (!props.visible || props.items.length === 0) return false

  if (key === 'ArrowDown') {
    activeIndex.value = (activeIndex.value + 1) % props.items.length
    return true
  }
  if (key === 'ArrowUp') {
    activeIndex.value = (activeIndex.value - 1 + props.items.length) % props.items.length
    return true
  }
  if (key === 'Enter' || key === 'Tab') {
    select(props.items[activeIndex.value])
    return true
  }
  if (key === 'Escape') {
    emit('close')
    return true
  }
  return false
}

defineExpose({ handleKey })
</script>

<style lang="scss" scoped>
.terminal-completion {
  position: fixed;
  z-index: 100;
  min-width: 250px;
  max-width: 450px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-surface, #232438);
  border: 1px solid var(--border, #2e3048);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  padding: 4px 0;
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
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--accent, #6366f1);
    color: white;
    flex-shrink: 0;
    opacity: 0.8;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary, #e4e4e8);
  }

  &__desc {
    font-size: 11px;
    color: var(--text-tertiary, #5c5e72);
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
