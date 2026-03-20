<template>
  <el-dialog
    v-model="visible"
    :title="isEditing ? '编辑主机' : '新增主机'"
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
        <el-tab-pane label="基本配置" name="basic">
          <el-form-item label="标签名" prop="label">
            <el-input
              v-model="form.label"
              placeholder="服务器名称（可选）"
              clearable
            />
          </el-form-item>

          <el-form-item label="地址" prop="address">
            <el-input
              v-model="form.address"
              placeholder="hostname 或 IP"
              clearable
            />
          </el-form-item>

          <el-form-item label="端口" prop="port">
            <el-input-number
              v-model="form.port"
              :min="1"
              :max="65535"
              :controls="true"
              style="width: 160px"
            />
          </el-form-item>

          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="root"
              clearable
            />
          </el-form-item>

          <el-form-item label="认证方式" prop="authType">
            <el-select v-model="form.authType" style="width: 220px">
              <el-option label="密码" value="password" />
              <el-option label="SSH 密钥" value="key" />
              <el-option label="密码 + 密钥" value="password_key" />
              <el-option label="SSH Agent" value="agent" />
              <el-option label="键盘交互" value="keyboard" />
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="showPassword"
            label="密码"
            prop="password"
          >
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入密码"
              clearable
            />
          </el-form-item>

          <el-form-item
            v-if="showKey"
            label="SSH 密钥"
            prop="keyId"
          >
            <el-select
              v-model="form.keyId"
              placeholder="选择密钥（暂无）"
              clearable
              style="width: 100%"
            >
              <!-- 后续集成密钥管理 -->
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="showKey"
            label="密钥密码"
            prop="keyPassphrase"
          >
            <el-input
              v-model="form.keyPassphrase"
              type="password"
              show-password
              placeholder="密钥密码（可选）"
              clearable
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
                v-for="group in hostsStore.groups"
                :key="group.id"
                :label="group.name"
                :value="group.id"
              />
            </el-select>
          </el-form-item>
        </el-tab-pane>

        <!-- Tab 2: 高级配置 -->
        <el-tab-pane label="高级配置" name="advanced">
          <el-form-item label="启动命令" prop="startupCommand">
            <el-input
              v-model="form.startupCommand"
              type="textarea"
              :rows="3"
              placeholder="连接后自动执行的命令"
            />
          </el-form-item>

          <el-form-item label="编码" prop="encoding">
            <el-select v-model="form.encoding" style="width: 220px">
              <el-option label="UTF-8" value="utf-8" />
              <el-option label="GBK" value="gbk" />
              <el-option label="GB2312" value="gb2312" />
              <el-option label="ISO-8859-1" value="iso-8859-1" />
            </el-select>
          </el-form-item>

          <el-form-item label="Keepalive" prop="keepaliveInterval">
            <el-input-number
              v-model="form.keepaliveInterval"
              :min="0"
              :max="3600"
              :controls="true"
              style="width: 160px"
            />
            <span class="host-config-dialog__unit">秒</span>
          </el-form-item>

          <el-form-item label="连接超时" prop="connectTimeout">
            <el-input-number
              v-model="form.connectTimeout"
              :min="1"
              :max="300"
              :controls="true"
              style="width: 160px"
            />
            <span class="host-config-dialog__unit">秒</span>
          </el-form-item>

          <el-form-item label="压缩" prop="compression">
            <el-switch v-model="form.compression" />
          </el-form-item>

          <el-form-item label="严格主机检查" prop="strictHostKey">
            <el-switch v-model="form.strictHostKey" />
          </el-form-item>

          <el-form-item label="SSH 版本" prop="sshVersion">
            <el-select v-model="form.sshVersion" style="width: 160px">
              <el-option label="Auto" value="auto" />
              <el-option label="2" value="2" />
            </el-select>
          </el-form-item>

          <el-form-item label="备注" prop="notes">
            <el-input
              v-model="form.notes"
              type="textarea"
              :rows="3"
              placeholder="备注信息"
            />
          </el-form-item>
        </el-tab-pane>

        <!-- Tab 3: 代理配置 -->
        <el-tab-pane label="代理配置" name="proxy">
          <el-form-item label="跳板机" prop="proxyJumpId">
            <el-select
              v-model="form.proxyJumpId"
              placeholder="选择跳板机（可选）"
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

          <el-form-item label="SOCKS 代理" prop="socksProxy">
            <el-input
              v-model="form.socksProxy"
              placeholder="socks5://host:port"
              clearable
            />
          </el-form-item>

          <el-form-item label="HTTP 代理" prop="httpProxy">
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
import { useHostsStore } from '../../stores/hosts.store'
import type { Host } from '@shared/types/host'

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
    strictHostKey: false,
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
const rules: FormRules = {
  address: [
    { required: true, message: '请输入主机地址', trigger: 'blur' },
  ],
  port: [
    { required: true, message: '请输入端口号', trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: '端口范围 1-65535', trigger: 'blur' },
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
      // 更新内存中的主机数据
      const idx = hostsStore.hosts.findIndex(h => h.id === uiStore.editingHostId)
      if (idx !== -1) {
        hostsStore.hosts[idx] = { ...hostsStore.hosts[idx], ...data }
      }
      try { await hostsStore.updateHost(uiStore.editingHostId, data) } catch { /* ignore */ }
    } else {
      // createHost 内部会 push 到 hosts 数组
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
