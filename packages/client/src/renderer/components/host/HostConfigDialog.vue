<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? t('hostDialog.editTitle') : t('hostDialog.addTitle')"
    width="600px"
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
      class="host-config-dialog__form"
    >
      <el-tabs v-model="activeTab" class="host-config-dialog__tabs">
        <!-- Tab 1: 基本配置 -->
        <el-tab-pane :label="t('hostDialog.tabBasic')" name="basic">
          <el-form-item :label="t('hostDialog.labelName')" prop="label">
            <el-input
              v-model="form.label"
              :placeholder="t('hostDialog.labelNamePlaceholder')"
              clearable
              :maxlength="15"
              show-word-limit
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.address')" prop="address">
            <el-input
              v-model="form.address"
              :placeholder="t('hostDialog.addressPlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.port')" prop="port">
            <el-input-number
              v-model="form.port"
              :min="1"
              :max="65535"
              :controls="true"
              style="width: 160px"
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.username')" prop="username">
            <el-input
              v-model="form.username"
              placeholder="root"
              clearable
              @blur="formRef?.validateField('address')"
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.authType')" prop="authType">
            <el-select v-model="form.authType" style="width: 220px">
              <el-option :label="t('hostDialog.authPassword')" value="password" />
              <el-option :label="t('hostDialog.authKey')" value="key" />
              <el-option :label="t('hostDialog.authPasswordKey')" value="password_key" />
              <el-option :label="t('hostDialog.authAgent')" value="agent" />
              <el-option :label="t('hostDialog.authKeyboard')" value="keyboard" />
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="showPassword"
            :label="t('hostDialog.password')"
            prop="password"
          >
            <el-input
              v-model="form.password"
              type="password"
              show-password
              :placeholder="t('hostDialog.passwordPlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item
            v-if="showKey"
            :label="t('hostDialog.sshKey')"
            prop="keyId"
          >
            <el-select
              v-model="form.keyId"
              :placeholder="t('hostDialog.sshKeyPlaceholder')"
              clearable
              style="width: 100%"
            >
              <!-- 后续集成密钥管理 -->
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="showKey"
            :label="t('hostDialog.keyPassphrase')"
            prop="keyPassphrase"
          >
            <el-input
              v-model="form.keyPassphrase"
              type="password"
              show-password
              :placeholder="t('hostDialog.keyPassphrasePlaceholder')"
              clearable
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.group')" prop="groupId">
            <el-select
              v-model="form.groupId"
              :placeholder="t('hostDialog.groupPlaceholder')"
              clearable
              style="width: 100%"
            >
              <el-option
                v-for="group in hostsStore.groups"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
          </el-form-item>
        </el-tab-pane>

        <!-- Tab 2: 高级配置 -->
        <el-tab-pane :label="t('hostDialog.tabAdvanced')" name="advanced">
          <el-form-item :label="t('hostDialog.startupCommand')" prop="startupCommand">
            <el-input
              v-model="form.startupCommand"
              type="textarea"
              :rows="3"
              :placeholder="t('hostDialog.startupCommandPlaceholder')"
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.encoding')" prop="encoding">
            <el-select v-model="form.encoding" style="width: 220px">
              <el-option label="UTF-8" value="utf-8" />
              <el-option label="GBK" value="gbk" />
              <el-option label="GB2312" value="gb2312" />
              <el-option label="ISO-8859-1" value="iso-8859-1" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('hostDialog.keepalive')" prop="keepaliveInterval">
            <el-input-number
              v-model="form.keepaliveInterval"
              :min="0"
              :max="3600"
              :controls="true"
              style="width: 160px"
            />
            <span class="host-config-dialog__unit">{{ t('hostDialog.seconds') }}</span>
          </el-form-item>

          <el-form-item :label="t('hostDialog.connectTimeout')" prop="connectTimeout">
            <el-input-number
              v-model="form.connectTimeout"
              :min="1"
              :max="300"
              :controls="true"
              style="width: 160px"
            />
            <span class="host-config-dialog__unit">{{ t('hostDialog.seconds') }}</span>
          </el-form-item>

          <el-form-item :label="t('hostDialog.compression')" prop="compression">
            <el-switch v-model="form.compression" />
          </el-form-item>

          <el-form-item :label="t('hostDialog.strictHostKey')" prop="strictHostKey">
            <el-switch v-model="form.strictHostKey" />
          </el-form-item>

          <el-form-item :label="t('hostDialog.sshVersion')" prop="sshVersion">
            <el-select v-model="form.sshVersion" style="width: 160px">
              <el-option label="Auto" value="auto" />
              <el-option label="2" value="2" />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('hostDialog.notes')" prop="notes">
            <el-input
              v-model="form.notes"
              type="textarea"
              :rows="3"
              :placeholder="t('hostDialog.notesPlaceholder')"
            />
          </el-form-item>
        </el-tab-pane>

        <!-- Tab 3: 代理配置 -->
        <el-tab-pane :label="t('hostDialog.tabProxy')" name="proxy">
          <el-form-item :label="t('hostDialog.proxyJump')" prop="proxyJumpId">
            <el-select
              v-model="form.proxyJumpId"
              :placeholder="t('hostDialog.proxyJumpPlaceholder')"
              clearable
              style="width: 100%"
            >
              <el-option
                v-for="host in otherHosts"
                :key="host.id"
                :label="host.label || host.address"
                :value="host.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item :label="t('hostDialog.socksProxy')" prop="socksProxy">
            <el-input
              v-model="form.socksProxy"
              placeholder="socks5://host:port"
              clearable
            />
          </el-form-item>

          <el-form-item :label="t('hostDialog.httpProxy')" prop="httpProxy">
            <el-input
              v-model="form.httpProxy"
              placeholder="http://host:port"
              clearable
            />
          </el-form-item>
        </el-tab-pane>
      </el-tabs>
    </el-form>

    <template #footer>
      <div class="host-config-dialog__footer">
        <el-button @click="handleClose">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">{{ t('hostDialog.save') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '../../stores/ui.store'
import { useHostsStore } from '../../stores/hosts.store'
import type { Host } from '@shared/types/host'

const { t } = useI18n()

const uiStore = useUiStore()
const hostsStore = useHostsStore()

// ===== 对话框控制 =====
const visible = computed({
  get: () => uiStore.showHostConfigDialog,
  set: (val) => {
    if (!val) uiStore.closeHostConfigDialog()
  },
})

const isEditing = computed(() => !!uiStore.editingHostId)

// ===== 跳板机候选（排除当前编辑的主机） =====
const otherHosts = computed(() => {
  if (!uiStore.editingHostId) return hostsStore.hosts
  return hostsStore.hosts.filter(h => h.id !== uiStore.editingHostId)
})

// ===== 表单状态 =====
const formRef = ref<FormInstance>()
const activeTab = ref('basic')
const saving = ref(false)

interface FormData {
  label: string
  address: string
  port: number
  username: string
  authType: Host['authType']
  password: string
  keyId: string
  keyPassphrase: string
  groupId: string
  startupCommand: string
  encoding: string
  keepaliveInterval: number
  connectTimeout: number
  compression: boolean
  strictHostKey: boolean
  sshVersion: Host['sshVersion']
  notes: string
  proxyJumpId: string
  socksProxy: string
  httpProxy: string
}

function defaultForm(): FormData {
  return {
    label: '',
    address: '',
    port: 22,
    username: '',
    authType: 'password',
    password: '',
    keyId: '',
    keyPassphrase: '',
    groupId: '',
    startupCommand: '',
    encoding: 'utf-8',
    keepaliveInterval: 60,
    connectTimeout: 10,
    compression: false,
    strictHostKey: true,
    sshVersion: 'auto',
    notes: '',
    proxyJumpId: '',
    socksProxy: '',
    httpProxy: '',
  }
}

const form = ref<FormData>(defaultForm())

// ===== 认证类型相关显示逻辑 =====
const showPassword = computed(() =>
  form.value.authType === 'password' || form.value.authType === 'password_key'
)

const showKey = computed(() =>
  form.value.authType === 'key' || form.value.authType === 'password_key'
)

// ===== 表单验证规则 =====
const labelValidator = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (!value) return callback()
  if (value.length > 15) return callback(new Error(t('hostDialog.validLabelMax')))
  const duplicate = hostsStore.hosts.find(h => h.label === value && h.id !== uiStore.editingHostId)
  if (duplicate) return callback(new Error(t('hostDialog.validLabelDuplicate', { label: value })))
  callback()
}

const addressValidator = (_rule: unknown, _value: string, callback: (error?: Error) => void) => {
  const addr = form.value.address
  const user = form.value.username || ''
  if (!addr) return callback()
  const duplicate = hostsStore.hosts.find(h =>
    h.address === addr && (h.username || '') === user && h.id !== uiStore.editingHostId
  )
  if (duplicate) return callback(new Error(t('hostDialog.validAddressDuplicate', { host: `${user ? user + '@' : ''}${addr}` })))
  callback()
}

const rules: FormRules = {
  label: [
    { validator: labelValidator, trigger: 'blur' },
  ],
  address: [
    { required: true, message: t('hostDialog.validAddressRequired'), trigger: 'blur' },
    { validator: addressValidator, trigger: 'blur' },
  ],
  port: [
    { required: true, message: t('hostDialog.validPortRequired'), trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: t('hostDialog.validPortRange'), trigger: 'blur' },
  ],
}

// ===== 编辑模式：监听 editingHostId 加载数据 =====
watch(
  () => uiStore.editingHostId,
  (hostId) => {
    if (!hostId) {
      form.value = defaultForm()
      activeTab.value = 'basic'
      return
    }
    const host = hostsStore.hosts.find(h => h.id === hostId)
    if (!host) return

    form.value = {
      label: host.label || '',
      address: host.address,
      port: host.port,
      username: host.username || '',
      authType: host.authType,
      password: host.password || '',
      keyId: host.keyId || '',
      keyPassphrase: host.keyPassphrase || '',
      groupId: host.groupId || '',
      startupCommand: host.startupCommand || '',
      encoding: host.encoding || 'utf-8',
      keepaliveInterval: host.keepaliveInterval ?? 60,
      connectTimeout: host.connectTimeout ?? 10,
      compression: host.compression,
      strictHostKey: host.strictHostKey,
      sshVersion: host.sshVersion,
      notes: host.notes || '',
      proxyJumpId: host.proxyJumpId || '',
      socksProxy: host.socksProxy || '',
      httpProxy: host.httpProxy || '',
    }
  },
  { immediate: true }
)

// ===== 操作 =====
function handleClose(): void {
  uiStore.closeHostConfigDialog()
  formRef.value?.clearValidate()
  activeTab.value = 'basic'
}

async function handleSave(): Promise<void> {
  if (!formRef.value) return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    const data: Partial<Host> = {
      label: form.value.label || undefined,
      address: form.value.address,
      port: form.value.port,
      username: form.value.username || undefined,
      authType: form.value.authType,
      password: form.value.password || undefined,
      keyId: form.value.keyId || undefined,
      keyPassphrase: form.value.keyPassphrase || undefined,
      groupId: form.value.groupId || undefined,
      startupCommand: form.value.startupCommand || undefined,
      encoding: form.value.encoding,
      keepaliveInterval: form.value.keepaliveInterval,
      connectTimeout: form.value.connectTimeout,
      compression: form.value.compression,
      strictHostKey: form.value.strictHostKey,
      sshVersion: form.value.sshVersion,
      notes: form.value.notes || undefined,
      proxyJumpId: form.value.proxyJumpId || undefined,
      socksProxy: form.value.socksProxy || undefined,
      httpProxy: form.value.httpProxy || undefined,
      protocol: 'ssh',
    }

    if (isEditing.value && uiStore.editingHostId) {
      await hostsStore.updateHost(uiStore.editingHostId, data)
    } else {
      await hostsStore.createHost(data)
    }

    uiStore.closeHostConfigDialog()
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.host-config-dialog {
  &__form {
    padding-top: 4px;
  }

  &__tabs {
    :deep(.el-tabs__header) {
      margin-bottom: 20px;
    }

    :deep(.el-tabs__item) {
      font-size: 13px;
    }
  }

  &__unit {
    margin-left: 8px;
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>

