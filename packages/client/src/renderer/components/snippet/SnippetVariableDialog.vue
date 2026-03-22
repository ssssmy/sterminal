<template>
  <el-dialog
    v-model="visible"
    :title="t('snippetVar.title')"
    width="500px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    @close="handleCancel"
    @opened="focusFirst"
  >
    <!-- 片段信息 -->
    <div class="snippet-var__header">
      <div class="snippet-var__snippet-name">{{ snippetName }}</div>
      <div class="snippet-var__preview-label">{{ t('snippetVar.previewLabel') }}</div>
      <div class="snippet-var__preview">{{ preview }}</div>
    </div>

    <!-- 变量表单 -->
    <el-form
      ref="formRef"
      :model="formValues"
      label-width="auto"
      label-position="top"
      class="snippet-var__form"
      @submit.prevent="handleConfirm"
    >
      <el-form-item
        v-for="(variable, idx) in variables"
        :key="variable.name"
        :label="variableLabel(variable)"
        class="snippet-var__field"
      >
        <!-- 下拉选择 -->
        <el-select
          v-if="variable.type === 'select'"
          v-model="formValues[variable.name]"
          :placeholder="t('snippetVar.selectPlaceholder', { name: variable.name })"
          style="width: 100%"
        >
          <el-option
            v-for="opt in variable.options"
            :key="opt"
            :label="opt"
            :value="opt"
          />
        </el-select>

        <!-- 密码输入 -->
        <el-input
          v-else-if="variable.type === 'password'"
          :ref="(el: any) => { if (idx === 0) firstInputRef = el }"
          v-model="formValues[variable.name]"
          type="password"
          show-password
          :placeholder="variable.defaultValue ? t('snippetVar.defaultPlaceholder', { default: variable.defaultValue }) : t('snippetVar.passwordPlaceholder')"
          @keyup.enter="handleConfirm"
        />

        <!-- 普通文本输入 -->
        <el-input
          v-else
          :ref="(el: any) => { if (idx === 0) firstInputRef = el }"
          v-model="formValues[variable.name]"
          :placeholder="variable.defaultValue ? t('snippetVar.defaultPlaceholder', { default: variable.defaultValue }) : t('snippetVar.inputPlaceholder', { name: variable.name })"
          clearable
          @keyup.enter="handleConfirm"
        />

        <!-- 变量类型提示 -->
        <div class="snippet-var__field-hint">
          <span v-if="variable.type === 'password'">{{ t('snippetVar.hintPassword') }}</span>
          <span v-else-if="variable.type === 'select'">{{ t('snippetVar.hintSelect') }}</span>
          <span v-else-if="variable.defaultValue">{{ t('snippetVar.hintDefault', { default: variable.defaultValue }) }}</span>
        </div>
      </el-form-item>
    </el-form>

    <!-- 内置变量提示 -->
    <div v-if="hasBuiltinVars" class="snippet-var__builtin-hint">
      {{ t('snippetVar.builtinHint') }}
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="handleConfirm">
          {{ t('snippetVar.execute') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import type { FormInstance } from 'element-plus'
import { useI18n } from 'vue-i18n'
import type { SnippetVariable } from '@shared/utils/snippet-variables'
import { replaceVariables } from '@shared/utils/snippet-variables'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  snippetName: string
  snippetContent: string
  variables: SnippetVariable[]
  hostLabel?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'confirm', command: string): void
  (e: 'cancel'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const formRef = ref<FormInstance>()
const firstInputRef = ref<any>(null)

// 变量值（响应式对象）
const formValues = reactive<Record<string, string>>({})

// 上次使用的值缓存（模块级，跨对话框保持）
const lastUsedValues: Record<string, string> = {}

// 检查是否包含内置变量
const hasBuiltinVars = computed(() =>
  /\$\{(?:__)?(?:date|time|datetime|timestamp|hostname)(?:__)?}/.test(props.snippetContent)
)

// 实时预览替换后的命令（密码变量用 ●●●● 遮蔽）
const preview = computed(() => {
  const values: Record<string, string> = {}
  for (const v of props.variables) {
    const raw = formValues[v.name] || v.defaultValue || (v.type === 'select' && v.options.length ? v.options[0] : '')
    if (v.type === 'password') {
      values[v.name] = raw ? '●'.repeat(Math.min(raw.length, 8)) : '${!' + v.name + '}'
    } else {
      values[v.name] = raw || `\${${v.name}}`
    }
  }
  const result = replaceVariables(props.snippetContent, values, props.hostLabel)
  return result.length > 200 ? result.substring(0, 200) + '...' : result
})

// 变量标签
function variableLabel(variable: SnippetVariable): string {
  const typeHint = variable.type === 'password' ? t('snippetVar.varTypePassword') : variable.type === 'select' ? t('snippetVar.varTypeSelect') : ''
  return variable.name + typeHint
}

// 对话框打开时初始化表单值
watch(() => props.modelValue, (val) => {
  if (val) {
    for (const v of props.variables) {
      // 优先使用上次记忆的值，其次默认值，再次下拉第一项
      const remembered = lastUsedValues[v.name]
      if (remembered !== undefined) {
        formValues[v.name] = remembered
      } else if (v.defaultValue) {
        formValues[v.name] = v.defaultValue
      } else if (v.type === 'select' && v.options.length) {
        formValues[v.name] = v.options[0]
      } else {
        formValues[v.name] = ''
      }
    }
  }
})

function focusFirst(): void {
  nextTick(() => {
    firstInputRef.value?.focus?.()
  })
}

function handleConfirm(): void {
  // 收集最终值：空值回退到默认值
  const values: Record<string, string> = {}
  for (const v of props.variables) {
    const val = formValues[v.name]?.trim() || ''
    values[v.name] = val || v.defaultValue || (v.type === 'select' && v.options.length ? v.options[0] : '')
    // 记忆非密码变量的值
    if (v.type !== 'password' && val) {
      lastUsedValues[v.name] = val
    }
  }

  const command = replaceVariables(props.snippetContent, values, props.hostLabel)
  emit('confirm', command)
  emit('update:modelValue', false)
}

function handleCancel(): void {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.snippet-var {
  &__header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  &__snippet-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-bottom: 8px;
  }

  &__preview-label {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__preview {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-text-color-regular);
    background-color: var(--el-fill-color-light);
    padding: 8px 12px;
    border-radius: 6px;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 80px;
    overflow-y: auto;
  }

  &__form {
    .el-form-item {
      margin-bottom: 16px;
    }
  }

  &__field-hint {
    margin-top: 4px;
    font-size: 11px;
    color: var(--el-text-color-placeholder);
    line-height: 1.4;
  }

  &__builtin-hint {
    margin-top: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
    background-color: var(--el-fill-color-lighter);
    border-radius: 6px;
    line-height: 1.5;

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background-color: var(--el-fill-color);
      padding: 1px 4px;
      border-radius: 3px;
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
