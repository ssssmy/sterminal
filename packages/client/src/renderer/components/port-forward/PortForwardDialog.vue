<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? t('portForwardDialog.editTitle') : t('portForwardDialog.addTitle')"
    width="540px"
    :close-on-click-modal="false"
    :close-on-press-escape="true"
    @close="handleClose"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="left"
    >
      <el-form-item :label="t('portForwardDialog.name')" prop="name">
        <el-input
          v-model="form.name"
          :placeholder="t('portForwardDialog.namePlaceholder')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('portForwardDialog.host')" prop="hostId">
        <el-select
          v-model="form.hostId"
          :placeholder="t('portForwardDialog.hostPlaceholder')"
          filterable
          style="width: 100%"
        >
          <el-option
            v-for="host in hostsStore.hosts"
            :key="host.id"
            :label="host.label || host.address"
            :value="host.id"
          >
            <span>{{ host.label || host.address }}</span>
            <span class="pf-host-addr">{{ host.label ? host.address : '' }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item :label="t('portForwardDialog.forwardType')" prop="type">
        <el-radio-group v-model="form.type">
          <el-radio-button value="local">
            Local (-L)
          </el-radio-button>
          <el-radio-button value="remote">
            Remote (-R)
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <!-- Local 转发字段 -->
      <template v-if="form.type === 'local'">
        <div class="pf-direction-hint">
          {{ t('portForwardDialog.localHint') }}
        </div>
        <el-form-item :label="t('portForwardDialog.localPort')" prop="localPort" required>
          <div class="pf-addr-port">
            <el-input v-model="form.localBindAddr" placeholder="127.0.0.1" class="pf-addr" />
            <span class="pf-colon">:</span>
            <el-input-number v-model="form.localPort" :min="1" :max="65535" :placeholder="t('portForwardDialog.portPlaceholder')" controls-position="right" class="pf-port" />
          </div>
        </el-form-item>
        <el-form-item :label="t('portForwardDialog.remoteTarget')" prop="remoteTargetPort" required>
          <div class="pf-addr-port">
            <el-input v-model="form.remoteTargetAddr" placeholder="127.0.0.1" class="pf-addr" />
            <span class="pf-colon">:</span>
            <el-input-number v-model="form.remoteTargetPort" :min="1" :max="65535" :placeholder="t('portForwardDialog.portPlaceholder')" controls-position="right" class="pf-port" />
          </div>
        </el-form-item>
      </template>

      <!-- Remote 转发字段 -->
      <template v-if="form.type === 'remote'">
        <div class="pf-direction-hint">
          {{ t('portForwardDialog.remoteHint') }}
        </div>
        <el-form-item :label="t('portForwardDialog.remotePort')" prop="remotePort" required>
          <div class="pf-addr-port">
            <el-input v-model="form.remoteBindAddr" placeholder="127.0.0.1" class="pf-addr" />
            <span class="pf-colon">:</span>
            <el-input-number v-model="form.remotePort" :min="1" :max="65535" :placeholder="t('portForwardDialog.portPlaceholder')" controls-position="right" class="pf-port" />
          </div>
        </el-form-item>
        <el-form-item :label="t('portForwardDialog.localTarget')" prop="localTargetPort" required>
          <div class="pf-addr-port">
            <el-input v-model="form.localTargetAddr" placeholder="127.0.0.1" class="pf-addr" />
            <span class="pf-colon">:</span>
            <el-input-number v-model="form.localTargetPort" :min="1" :max="65535" :placeholder="t('portForwardDialog.portPlaceholder')" controls-position="right" class="pf-port" />
          </div>
        </el-form-item>
      </template>

      <!-- 命令预览 -->
      <el-form-item :label="t('portForwardDialog.equivalentCommand')">
        <div class="pf-preview-wrap">
          <code class="pf-preview">{{ commandPreview }}</code>
          <button type="button" class="pf-copy-btn" :title="t('portForwardDialog.copyCommand')" @click="copyCommand">
            <el-icon :size="14"><DocumentCopy /></el-icon>
          </button>
        </div>
      </el-form-item>

      <el-form-item :label="t('portForwardDialog.autoStart')">
        <el-switch v-model="form.autoStart" />
        <span class="form-hint">{{ t('portForwardDialog.autoStartHint') }}</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('portForwardDialog.save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { DocumentCopy } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../../stores/ui.store'
import { usePortForwardsStore } from '../../stores/port-forwards.store'
import { useHostsStore } from '../../stores/hosts.store'

const { t } = useI18n()

const uiStore = useUiStore()
const portForwardsStore = usePortForwardsStore()
const hostsStore = useHostsStore()

const visible = computed({
  get: () => uiStore.showPortForwardDialog,
  set: (val) => { if (!val) uiStore.closePortForwardDialog() },
})

const isEditing = computed(() => !!uiStore.editingPortForwardId)

const formRef = ref<FormInstance>()
const saving = ref(false)

interface FormData {
  name: string
  hostId: string
  type: 'local' | 'remote'
  localBindAddr: string
  localPort: number | undefined
  remoteTargetAddr: string
  remoteTargetPort: number | undefined
  remoteBindAddr: string
  remotePort: number | undefined
  localTargetAddr: string
  localTargetPort: number | undefined
  autoStart: boolean
}

function defaultForm(): FormData {
  return {
    name: '',
    hostId: '',
    type: 'local',
    localBindAddr: '127.0.0.1',
    localPort: undefined,
    remoteTargetAddr: '127.0.0.1',
    remoteTargetPort: undefined,
    remoteBindAddr: '127.0.0.1',
    remotePort: undefined,
    localTargetAddr: '127.0.0.1',
    localTargetPort: undefined,
    autoStart: false,
  }
}

const form = ref<FormData>(defaultForm())

const rules: FormRules = {
  hostId: [{ required: true, message: t('portForwardDialog.validHostRequired'), trigger: 'change' }],
  type: [{ required: true, message: t('portForwardDialog.validTypeRequired'), trigger: 'change' }],
}

const commandPreview = computed(() => {
  const host = hostsStore.hosts.find(h => h.id === form.value.hostId)
  const hostStr = host ? `${host.username || 'user'}@${host.address}` : 'user@host'
  if (form.value.type === 'local') {
    const lp = form.value.localPort || '?'
    const ra = form.value.remoteTargetAddr || '127.0.0.1'
    const rp = form.value.remoteTargetPort || '?'
    return `ssh -L ${form.value.localBindAddr}:${lp}:${ra}:${rp} ${hostStr}`
  }
  const rp = form.value.remotePort || '?'
  const la = form.value.localTargetAddr || '127.0.0.1'
  const lp = form.value.localTargetPort || '?'
  return `ssh -R ${form.value.remoteBindAddr}:${rp}:${la}:${lp} ${hostStr}`
})

async function copyCommand(): Promise<void> {
  await navigator.clipboard.writeText(commandPreview.value)
  ElMessage.success(t('portForwardDialog.copied'))
}

watch(
  () => uiStore.editingPortForwardId,
  (id) => {
    if (!id) { form.value = defaultForm(); return }
    const rule = portForwardsStore.rules.find(r => r.id === id)
    if (!rule) return
    form.value = {
      name: rule.name || '',
      hostId: rule.hostId,
      type: rule.type === 'remote' ? 'remote' : 'local',
      localBindAddr: rule.localBindAddr || '127.0.0.1',
      localPort: rule.localPort,
      remoteTargetAddr: rule.remoteTargetAddr || '127.0.0.1',
      remoteTargetPort: rule.remoteTargetPort,
      remoteBindAddr: rule.remoteBindAddr || '127.0.0.1',
      remotePort: rule.remotePort,
      localTargetAddr: rule.localTargetAddr || '127.0.0.1',
      localTargetPort: rule.localTargetPort,
      autoStart: rule.autoStart,
    }
  },
  { immediate: true }
)

function handleClose(): void {
  uiStore.closePortForwardDialog()
  formRef.value?.clearValidate()
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const data: Record<string, unknown> = {
      name: form.value.name || undefined,
      hostId: form.value.hostId,
      type: form.value.type,
      localBindAddr: form.value.localBindAddr,
      localPort: form.value.localPort,
      remoteTargetAddr: form.value.remoteTargetAddr,
      remoteTargetPort: form.value.remoteTargetPort,
      remoteBindAddr: form.value.remoteBindAddr,
      remotePort: form.value.remotePort,
      localTargetAddr: form.value.localTargetAddr,
      localTargetPort: form.value.localTargetPort,
      autoStart: form.value.autoStart,
      appStart: false,
    }

    if (isEditing.value && uiStore.editingPortForwardId) {
      await portForwardsStore.updateRule(uiStore.editingPortForwardId, data)
    } else {
      data.sortOrder = portForwardsStore.rules.length
      await portForwardsStore.createRule(data)
    }

    uiStore.closePortForwardDialog()
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

.pf-direction-hint {
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-lighter);
  border-radius: 6px;
  line-height: 1.5;
}

.pf-arrow {
  color: var(--el-color-primary);
  font-weight: 600;
  margin: 0 4px;
}

.pf-addr-port {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.pf-addr {
  flex: 1;
}

.pf-colon {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.pf-port {
  width: 130px;
  flex-shrink: 0;
}

.pf-preview-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.pf-preview {
  flex: 1;
  font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
  font-size: 12px;
  padding: 6px 10px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.pf-copy-btn {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  transition: background-color var(--st-duration-fast) var(--st-easing-smooth), border-color var(--st-duration-fast) var(--st-easing-smooth), color var(--st-duration-fast) var(--st-easing-smooth);

  &:hover {
    border-color: var(--el-color-primary);
    color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-9);
  }
}

.pf-host-addr {
  margin-left: 8px;
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}
</style>
