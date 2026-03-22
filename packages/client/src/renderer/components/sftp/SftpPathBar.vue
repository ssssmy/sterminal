<template>
  <div class="sftp-path-bar">
    <div v-if="!editing" class="sftp-path-bar__crumbs" @dblclick="startEdit">
      <span
        v-for="(crumb, index) in breadcrumbs"
        :key="index"
        class="sftp-path-bar__crumb"
        @click="emit('navigate', crumb.path)"
      >
        <span class="sftp-path-bar__crumb-name">{{ crumb.name }}</span>
        <span v-if="index < breadcrumbs.length - 1" class="sftp-path-bar__sep">/</span>
      </span>
    </div>

    <input
      v-else
      ref="inputRef"
      v-model="inputValue"
      class="sftp-path-bar__input"
      @keyup.enter="commitEdit"
      @keyup.escape="cancelEdit"
      @blur="cancelEdit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'

const props = defineProps<{
  path: string
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

const editing = ref(false)
const inputValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const breadcrumbs = computed(() => {
  const p = props.path
  if (!p || p === '/') return [{ name: '/', path: '/' }]

  const parts = p.split('/').filter(Boolean)
  const crumbs = [{ name: '/', path: '/' }]
  let built = ''
  for (const part of parts) {
    built += '/' + part
    crumbs.push({ name: part, path: built })
  }
  return crumbs
})

function startEdit(): void {
  inputValue.value = props.path
  editing.value = true
  nextTick(() => {
    inputRef.value?.select()
  })
}

function commitEdit(): void {
  const trimmed = inputValue.value.trim()
  if (trimmed) emit('navigate', trimmed)
  editing.value = false
}

function cancelEdit(): void {
  editing.value = false
}
</script>

<style lang="scss" scoped>
.sftp-path-bar {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  min-width: 0;

  &__crumbs {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    overflow: hidden;
    cursor: default;
    user-select: none;
    gap: 2px;
  }

  &__crumb {
    display: flex;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 12px;
    white-space: nowrap;
    flex-shrink: 0;

    &:last-child {
      color: var(--text-primary);
      font-weight: 500;
    }

    &:hover:not(:last-child) {
      color: var(--accent);
    }
  }

  &__sep {
    color: var(--text-tertiary);
    font-size: 12px;
  }

  &__input {
    width: 100%;
    height: 22px;
    border: 1px solid var(--accent);
    border-radius: 3px;
    background-color: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    padding: 0 6px;
    outline: none;
  }
}
</style>
