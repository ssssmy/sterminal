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
        <el-input
          v-model="form.content"
          type="textarea"
          :rows="5"
          placeholder="输入命令内容，支持多行&#10;可使用变量 ${name} 或 ${name:默认值}"
          class="snippet-content-input"
        />
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
const saving = ref(false)

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
</style>
