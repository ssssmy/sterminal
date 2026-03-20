<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? '编辑终端配置' : '新建终端配置'"
    width="520px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="90px"
      label-position="left"
    >
      <el-form-item label="名称" prop="name">
        <el-input
          v-model="form.name"
          placeholder="如：默认终端、项目开发"
          clearable
        />
      </el-form-item>

      <el-form-item label="Shell" prop="shell">
        <el-select v-model="form.shell" filterable allow-create style="width: 100%">
          <el-option label="系统默认" value="" />
          <el-option label="/bin/zsh" value="/bin/zsh" />
          <el-option label="/bin/bash" value="/bin/bash" />
          <el-option label="/bin/sh" value="/bin/sh" />
          <el-option label="/usr/bin/fish" value="/usr/bin/fish" />
        </el-select>
      </el-form-item>

      <el-form-item label="工作目录" prop="cwd">
        <el-input
          v-model="form.cwd"
          placeholder="~ (默认主目录)"
          clearable
        />
      </el-form-item>

      <el-form-item label="启动命令" prop="startupCommand">
        <el-input
          v-model="form.startupCommand"
          type="textarea"
          :rows="2"
          placeholder="打开终端后自动执行的命令"
        />
      </el-form-item>

      <el-form-item label="登录 Shell" prop="loginShell">
        <el-switch v-model="form.loginShell" />
        <span class="form-hint">加载 ~/.zprofile 等登录脚本</span>
      </el-form-item>

      <el-form-item label="设为默认" prop="isDefault">
        <el-switch v-model="form.isDefault" />
        <span class="form-hint">新建终端时默认使用此配置</span>
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
import { ref, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useUiStore } from '../../stores/ui.store'
import { useTerminalsStore } from '../../stores/terminals.store'
import type { LocalTerminalConfig } from '@shared/types/terminal'

const uiStore = useUiStore()
const terminalsStore = useTerminalsStore()

const visible = computed({
  get: () => uiStore.showTerminalConfigDialog,
  set: (val) => {
    if (!val) uiStore.closeTerminalConfigDialog()
  },
})

const isEditing = computed(() => !!uiStore.editingTerminalId)

const formRef = ref<FormInstance>()
const saving = ref(false)

interface FormData {
  name: string
  shell: string
  cwd: string
  startupCommand: string
  loginShell: boolean
  isDefault: boolean
}

function defaultForm(): FormData {
  return {
    name: '',
    shell: '',
    cwd: '',
    startupCommand: '',
    loginShell: true,
    isDefault: false,
  }
}

const form = ref<FormData>(defaultForm())

const rules: FormRules = {
  name: [
    { required: true, message: '请输入终端配置名称', trigger: 'blur' },
  ],
}

// 编辑模式：加载数据
watch(
  () => uiStore.editingTerminalId,
  (id) => {
    if (!id) {
      form.value = defaultForm()
      return
    }
    const terminal = terminalsStore.terminals.find(t => t.id === id)
    if (!terminal) return

    form.value = {
      name: terminal.name,
      shell: terminal.shell || '',
      cwd: terminal.cwd || '',
      startupCommand: terminal.startupCommand || '',
      loginShell: terminal.loginShell,
      isDefault: terminal.isDefault,
    }
  },
  { immediate: true }
)

function handleClose(): void {
  uiStore.closeTerminalConfigDialog()
  formRef.value?.clearValidate()
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const data: Partial<LocalTerminalConfig> = {
      name: form.value.name,
      shell: form.value.shell || undefined,
      cwd: form.value.cwd || undefined,
      startupCommand: form.value.startupCommand || undefined,
      loginShell: form.value.loginShell,
      isDefault: form.value.isDefault,
      scriptLineDelay: 0,
      sortOrder: terminalsStore.terminals.length,
    }

    if (isEditing.value && uiStore.editingTerminalId) {
      await terminalsStore.updateTerminal(uiStore.editingTerminalId, data)
    } else {
      await terminalsStore.createTerminal(data)
    }

    uiStore.closeTerminalConfigDialog()
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

.form-hint {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
