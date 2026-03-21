<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? '编辑命令片段' : '新建命令片段'"
    width="560px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      label-position="left"
    >
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="如：重启 Nginx、查看日志"
          clearable
        />
      </el-form-item>

      <el-form-item label="命令" prop="content">
        <!-- 快捷插入变量按钮 -->
        <div class="snippet-var-toolbar">
          <span class="snippet-var-toolbar__label">插入变量:</span>
          <button type="button" class="snippet-var-toolbar__btn" @click="insertVar('${name}')">
            <code>&#36;{name}</code>
            <span>文本</span>
          </button>
          <button type="button" class="snippet-var-toolbar__btn" @click="insertVar('${name:default}')">
            <code>&#36;{name:默认值}</code>
            <span>带默认值</span>
          </button>
          <button type="button" class="snippet-var-toolbar__btn" @click="insertVar('${name:A|B|C}')">
            <code>&#36;{name:A|B|C}</code>
            <span>下拉选择</span>
          </button>
          <button type="button" class="snippet-var-toolbar__btn" @click="insertVar('${!name}')">
            <code>&#36;{!name}</code>
            <span>密码</span>
          </button>
        </div>
        <el-input
          ref="contentInputRef"
          v-model="form.content"
          type="textarea"
          :rows="5"
          placeholder="输入命令内容，支持多行&#10;&#10;试试点击上方按钮插入变量 —— 执行时会弹窗让你填值&#10;例如: systemctl restart ${service:nginx}"
          class="snippet-content-input"
        />
        <!-- 变量检测提示 -->
        <div v-if="detectedVars.length > 0" class="snippet-var-detected">
          检测到 {{ detectedVars.length }} 个变量：
          <code v-for="v in detectedVars" :key="v.name" class="snippet-var-detected__tag">
            {{ v.name }}<template v-if="v.type === 'password'"> (密码)</template><template v-else-if="v.type === 'select'"> ({{ v.options.length }}个选项)</template><template v-else-if="v.defaultValue"> = {{ v.defaultValue }}</template>
          </code>
          <span class="snippet-var-detected__hint">— 双击执行时将弹窗填写</span>
        </div>
        <!-- 内置变量和更多语法 -->
        <div class="snippet-var-help">
          <div class="snippet-var-help__title" @click="showVarHelp = !showVarHelp">
            <span class="snippet-var-help__toggle">{{ showVarHelp ? '▾' : '▸' }}</span>
            内置变量和更多用法
          </div>
          <div v-show="showVarHelp" class="snippet-var-help__body">
            <div class="snippet-var-help__builtin">
              <div class="snippet-var-help__builtin-title">内置变量（执行时自动替换，无需填写）</div>
              <code>&#36;{__date__}</code> 当前日期 &nbsp;
              <code>&#36;{__time__}</code> 当前时间 &nbsp;
              <code>&#36;{__datetime__}</code> 日期时间 &nbsp;
              <code>&#36;{__timestamp__}</code> Unix时间戳
            </div>
            <div class="snippet-var-help__example">
              <div class="snippet-var-help__builtin-title">完整示例</div>
              <code>ssh &#36;{user:root}@&#36;{host} -p &#36;{port:22}</code><br/>
              <span class="snippet-var-help__example-desc">执行时弹窗填写 user（默认 root）、host、port（默认 22）</span>
            </div>
          </div>
        </div>
      </el-form-item>

      <el-form-item label="描述" prop="description">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          placeholder="片段用途说明（可选）"
        />
      </el-form-item>

      <el-form-item label="分组" prop="groupId">
        <el-select
          v-model="form.groupId"
          placeholder="无分组"
          clearable
          style="width: 100%"
        >
          <el-option
            v-for="group in snippetsStore.groups"
            :key="group.id"
            :label="group.name"
            :value="group.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="标签" prop="tags">
        <div class="snippet-tags-input">
          <el-tag
            v-for="tag in form.tags"
            :key="tag"
            closable
            size="small"
            @close="removeTag(tag)"
          >
            {{ tag }}
          </el-tag>
          <el-input
            v-if="tagInputVisible"
            ref="tagInputRef"
            v-model="tagInputValue"
            size="small"
            class="snippet-tag-new-input"
            @keyup.enter="confirmTag"
            @blur="confirmTag"
          />
          <el-button
            v-else
            size="small"
            class="snippet-tag-add-btn"
            @click="showTagInput"
          >
            + 标签
          </el-button>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useUiStore } from '../../stores/ui.store'
import { useSnippetsStore } from '../../stores/snippets.store'
import { parseVariables } from '@shared/utils/snippet-variables'

const uiStore = useUiStore()
const snippetsStore = useSnippetsStore()

const visible = computed({
  get: () => uiStore.showSnippetEditDialog,
  set: (val) => {
    if (!val) uiStore.closeSnippetEditDialog()
  },
})

const isEditing = computed(() => !!uiStore.editingSnippetId)

const formRef = ref<FormInstance>()
const contentInputRef = ref<InstanceType<typeof import('element-plus')['ElInput']>>()
const saving = ref(false)
const showVarHelp = ref(false)

// 实时检测命令中的变量
const detectedVars = computed(() => parseVariables(form.value.content))

// 在光标位置插入变量模板
function insertVar(template: string): void {
  const textarea = contentInputRef.value?.textarea as HTMLTextAreaElement | undefined
  if (!textarea) {
    form.value.content += template
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = form.value.content.substring(0, start)
  const after = form.value.content.substring(end)
  form.value.content = before + template + after
  // 将光标定位到插入内容的 name 位置以便用户直接修改变量名
  nextTick(() => {
    // 选中模板中的 "name" 部分方便用户直接替换
    const nameStart = start + template.indexOf('name')
    const nameEnd = nameStart + 4
    textarea.focus()
    textarea.setSelectionRange(nameStart, nameEnd)
  })
}

// 标签输入
const tagInputVisible = ref(false)
const tagInputValue = ref('')
const tagInputRef = ref<InstanceType<typeof import('element-plus')['ElInput']>>()

interface FormData {
  name: string
  content: string
  description: string
  groupId: string
  tags: string[]
}

function defaultForm(): FormData {
  return { name: '', content: '', description: '', groupId: '', tags: [] }
}

const form = ref<FormData>(defaultForm())

const rules: FormRules = {
  name: [{ required: true, message: '请输入片段名称', trigger: 'blur' }],
  content: [{ required: true, message: '请输入命令内容', trigger: 'blur' }],
}

// 编辑模式：加载数据
watch(
  () => uiStore.editingSnippetId,
  (id) => {
    if (!id) {
      form.value = defaultForm()
      return
    }
    const snippet = snippetsStore.snippets.find(s => s.id === id)
    if (!snippet) return
    form.value = {
      name: snippet.name,
      content: snippet.content,
      description: snippet.description || '',
      groupId: snippet.groupId || '',
      tags: [...snippet.tags],
    }
  },
  { immediate: true }
)

function removeTag(tag: string): void {
  form.value.tags = form.value.tags.filter(t => t !== tag)
}

function showTagInput(): void {
  tagInputVisible.value = true
  nextTick(() => tagInputRef.value?.input?.focus())
}

function confirmTag(): void {
  const val = tagInputValue.value.trim()
  if (val && !form.value.tags.includes(val)) {
    form.value.tags.push(val)
  }
  tagInputVisible.value = false
  tagInputValue.value = ''
}

function handleClose(): void {
  uiStore.closeSnippetEditDialog()
  formRef.value?.clearValidate()
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const data: Record<string, unknown> = {
      name: form.value.name,
      content: form.value.content,
      description: form.value.description || undefined,
      groupId: form.value.groupId || undefined,
      tags: form.value.tags,
    }

    if (isEditing.value && uiStore.editingSnippetId) {
      await snippetsStore.updateSnippet(uiStore.editingSnippetId, data)
    } else {
      data.sortOrder = snippetsStore.snippets.length
      await snippetsStore.createSnippet(data)
    }

    uiStore.closeSnippetEditDialog()
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.snippet-content-input {
  :deep(textarea) {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace;
    font-size: 13px;
  }
}

.snippet-tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;

  .el-tag {
    border-radius: 4px;
  }
}

.snippet-tag-new-input {
  width: 80px;
}

.snippet-tag-add-btn {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
}

// 快捷插入变量工具栏
.snippet-var-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin-bottom: 6px;
  flex-wrap: wrap;

  &__label {
    font-size: 11px;
    color: var(--el-text-color-secondary);
    flex-shrink: 0;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px dashed var(--el-border-color);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    font-size: 11px;
    color: var(--el-text-color-regular);
    transition: all 0.15s;

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--el-color-primary);
    }

    span {
      color: var(--el-text-color-secondary);
      font-size: 10px;
    }

    &:hover {
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-9);
      color: var(--el-color-primary);

      span {
        color: var(--el-color-primary);
      }
    }
  }
}

// 变量检测反馈
.snippet-var-detected {
  margin-top: 6px;
  width: 100%;
  font-size: 12px;
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;

  &__tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    background-color: var(--el-color-success-light-9);
    color: var(--el-color-success);
    padding: 1px 6px;
    border-radius: 3px;
  }

  &__hint {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}

.snippet-var-help {
  margin-top: 6px;
  width: 100%;

  &__title {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    user-select: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;

    &:hover {
      color: var(--el-text-color-primary);
    }
  }

  &__toggle {
    font-size: 10px;
    width: 12px;
  }

  &__body {
    margin-top: 8px;
    padding: 10px 12px;
    background-color: var(--el-fill-color-lighter);
    border-radius: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-regular);
  }

  &__builtin {
    font-size: 11px;
    color: var(--el-text-color-secondary);

    code {
      background-color: var(--el-fill-color);
      padding: 1px 4px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
    }
  }

  &__builtin-title {
    font-weight: 500;
    margin-bottom: 4px;
    color: var(--el-text-color-regular);
  }

  &__example {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--el-border-color-lighter);
    font-size: 11px;
    color: var(--el-text-color-secondary);
    line-height: 1.8;

    code {
      background-color: var(--el-fill-color);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }
  }

  &__example-desc {
    font-size: 11px;
    color: var(--el-text-color-placeholder);
  }
}
</style>
