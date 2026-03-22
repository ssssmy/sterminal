<template>
  <el-dialog
    v-model="visible"
    :title="t('sftp.editFile') + ': ' + fileName"
    width="700px"
    :close-on-click-modal="false"
    @closed="handleClosed"
  >
    <div class="sftp-file-editor__toolbar">
      <span class="sftp-file-editor__path">{{ filePath }}</span>
      <span class="sftp-file-editor__size-hint" v-if="sizeWarning">{{ t('sftp.editSizeWarning') }}</span>
    </div>

    <textarea
      v-if="!loading && !loadError"
      v-model="content"
      class="sftp-file-editor__textarea"
      :placeholder="t('sftp.editPlaceholder')"
      spellcheck="false"
    />

    <div v-else-if="loading" class="sftp-file-editor__state">
      <el-icon class="is-loading"><Loading /></el-icon>
      {{ t('common.loading') }}
    </div>

    <div v-else-if="loadError" class="sftp-file-editor__state sftp-file-editor__state--error">
      {{ loadError }}
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        :loading="saving"
        :disabled="loading || !!loadError"
        @click="handleSave"
      >
        {{ t('sftp.save') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

const MAX_SIZE = 1 * 1024 * 1024  // 1 MB

const props = defineProps<{
  modelValue: boolean
  tabId: string
  filePath: string
  fileSize: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'save', path: string, content: string): void
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const content = ref('')
const loading = ref(false)
const saving = ref(false)
const loadError = ref<string | null>(null)

const fileName = computed(() => props.filePath.split('/').pop() || props.filePath)
const sizeWarning = computed(() => props.fileSize > MAX_SIZE)

// ===== 加载文件内容 =====
watch(
  () => props.modelValue,
  async (val) => {
    if (!val) return
    if (props.fileSize > MAX_SIZE) {
      loadError.value = t('sftp.editFileTooLarge')
      return
    }
    loading.value = true
    loadError.value = null
    content.value = ''
    // 父组件通过 v-on:load-content 填充，或者由父组件在 open 时传入内容
    // 这里通知父组件加载
    emit('save', '__load__', '')
    loading.value = false
  }
)

/**
 * 供父组件调用以设置加载的内容
 */
function setContent(text: string): void {
  content.value = text
  loading.value = false
  loadError.value = null
}

function setLoadError(msg: string): void {
  loadError.value = msg
  loading.value = false
}

function setLoading(val: boolean): void {
  loading.value = val
}

async function handleSave(): Promise<void> {
  saving.value = true
  try {
    emit('save', props.filePath, content.value)
  } finally {
    saving.value = false
  }
}

function handleClosed(): void {
  content.value = ''
  loadError.value = null
}

defineExpose({ setContent, setLoadError, setLoading })
</script>

<style lang="scss" scoped>
.sftp-file-editor {
  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  &__path {
    font-size: 12px;
    color: var(--text-tertiary);
    font-family: var(--font-mono, monospace);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__size-hint {
    font-size: 11px;
    color: var(--warning, #f59e0b);
    flex-shrink: 0;
    margin-left: 8px;
  }

  &__textarea {
    width: 100%;
    height: 360px;
    resize: vertical;
    border: 1px solid var(--border);
    border-radius: 4px;
    background-color: var(--bg-input);
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-mono, 'Menlo', 'Monaco', 'Courier New', monospace);
    line-height: 1.5;
    padding: 8px 10px;
    outline: none;
    tab-size: 2;
    box-sizing: border-box;

    &:focus {
      border-color: var(--accent);
    }
  }

  &__state {
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: 14px;

    &--error {
      color: var(--error, #ef4444);
    }
  }
}
</style>
