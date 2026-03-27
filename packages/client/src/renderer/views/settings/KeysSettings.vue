<template>
  <div class="keys-settings">
    <h3 class="section-title">{{ t('keys.title') }}</h3>
    <p class="section-desc">{{ t('keys.desc') }}</p>

    <!-- 操作按钮 -->
    <div class="keys-actions">
      <el-button type="primary" @click="showGenerateDialog = true">
        {{ t('keys.generate') }}
      </el-button>
      <el-button @click="showImportDialog = true">
        {{ t('keys.import') }}
      </el-button>
    </div>

    <!-- 密钥列表 -->
    <div v-if="keysStore.loading" class="keys__loading">
      {{ t('common.loading') }}
    </div>
    <el-empty v-else-if="keysStore.keys.length === 0" :description="t('keys.empty')" />
    <div v-else class="keys__list">
      <div
        v-for="key in keysStore.keys"
        :key="key.id"
        class="keys__item"
      >
        <div class="keys__info">
          <div class="keys__name-row">
            <span class="keys__name">{{ key.name }}</span>
            <el-tag size="small" :type="tagType(key.keyType)" class="keys__type-tag">
              {{ key.keyType.toUpperCase() }}
            </el-tag>
          </div>
          <code class="keys__fingerprint">{{ key.fingerprint }}</code>
          <span class="keys__meta">
            <span v-if="key.comment">{{ key.comment }} &middot; </span>
            {{ t('keys.created') }}: {{ formatDate(key.createdAt) }}
          </span>
        </div>
        <div class="keys__actions">
          <el-button size="small" text @click="copyPublicKey(key)">
            {{ pubKeyCopied ? '✓' : t('keys.copyPublicKey') }}
          </el-button>
          <el-button size="small" text @click="copyDeployCommand(key)">
            {{ deployCopied ? '✓' : t('keys.copyDeployCmd') }}
          </el-button>
          <el-button size="small" text type="danger" @click="deleteKey(key.id, key.name)">
            {{ t('common.delete') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 生成密钥对话框 -->
    <el-dialog
      v-model="showGenerateDialog"
      :title="t('keys.generateTitle')"
      width="480px"
      @closed="resetGenerateForm"
    >
      <el-form
        ref="generateFormRef"
        :model="generateForm"
        :rules="generateRules"
        label-width="100px"
      >
        <el-form-item :label="t('keys.name')" prop="name">
          <el-input v-model="generateForm.name" :placeholder="t('keys.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('keys.type')" prop="keyType">
          <el-select v-model="generateForm.keyType" style="width: 100%" @change="onKeyTypeChange">
            <el-option value="ed25519" label="Ed25519" />
            <el-option value="rsa" label="RSA" />
            <el-option value="ecdsa" label="ECDSA" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="generateForm.keyType === 'rsa'" :label="t('keys.bits')" prop="bits">
          <el-select v-model="generateForm.bits" style="width: 100%">
            <el-option :value="2048" label="2048" />
            <el-option :value="4096" label="4096" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('keys.passphrase')" prop="passphrase">
          <el-input
            v-model="generateForm.passphrase"
            type="password"
            :placeholder="t('keys.passphrasePlaceholder')"
            show-password
          />
        </el-form-item>
        <el-form-item :label="t('keys.comment')" prop="comment">
          <el-input v-model="generateForm.comment" :placeholder="t('keys.commentPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenerateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="generating" @click="doGenerate">
          {{ t('keys.generate') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 导入密钥对话框 -->
    <el-dialog
      v-model="showImportDialog"
      :title="t('keys.importTitle')"
      width="520px"
      @closed="resetImportForm"
    >
      <el-form
        ref="importFormRef"
        :model="importForm"
        :rules="importRules"
        label-width="100px"
      >
        <el-form-item :label="t('keys.privateKey')" prop="fileContent">
          <el-input
            v-model="importForm.fileContent"
            type="textarea"
            :rows="8"
            :placeholder="t('keys.privateKeyPlaceholder')"
            style="font-family: 'JetBrains Mono', monospace; font-size: 12px"
          />
        </el-form-item>
        <el-form-item :label="t('keys.name')" prop="name">
          <el-input v-model="importForm.name" :placeholder="t('keys.importNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('keys.passphrase')" prop="passphrase">
          <el-input
            v-model="importForm.passphrase"
            type="password"
            :placeholder="t('keys.passphrasePlaceholder')"
            show-password
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showImportDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="importing" @click="doImport">
          {{ t('keys.import') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { useKeysStore } from '../../stores/keys.store'
import type { SshKey } from '../../../shared/types/key'
import { useCopyFeedback } from '../../composables/useCopyFeedback'

const { t } = useI18n()
const keysStore = useKeysStore()

const { copied: pubKeyCopied, copyWithFeedback: copyPubKey } = useCopyFeedback()
const { copied: deployCopied, copyWithFeedback: copyDeploy } = useCopyFeedback()

// ===== 对话框状态 =====

const showGenerateDialog = ref(false)
const showImportDialog = ref(false)
const generating = ref(false)
const importing = ref(false)

// ===== 生成密钥表单 =====

const generateFormRef = ref<FormInstance>()
const generateForm = reactive({
  name: '',
  keyType: 'ed25519' as 'ed25519' | 'rsa' | 'ecdsa',
  bits: 2048,
  passphrase: '',
  comment: '',
})

const generateRules: FormRules = {
  name: [{ required: true, message: t('keys.nameRequired'), trigger: 'blur' }],
  keyType: [{ required: true, trigger: 'change' }],
}

function onKeyTypeChange(): void {
  generateForm.bits = 2048
}

function resetGenerateForm(): void {
  generateForm.name = ''
  generateForm.keyType = 'ed25519'
  generateForm.bits = 2048
  generateForm.passphrase = ''
  generateForm.comment = ''
  generateFormRef.value?.clearValidate()
}

async function doGenerate(): Promise<void> {
  const valid = await generateFormRef.value?.validate().catch(() => false)
  if (!valid) return

  generating.value = true
  try {
    await keysStore.generateKey({
      name: generateForm.name,
      keyType: generateForm.keyType,
      bits: generateForm.keyType === 'rsa' ? generateForm.bits : undefined,
      passphrase: generateForm.passphrase || undefined,
      comment: generateForm.comment || undefined,
    })
    showGenerateDialog.value = false
    ElMessage.success(t('keys.generateSuccess'))
  } catch (err: unknown) {
    ElMessage.error(err instanceof Error ? err.message : t('keys.generateError'))
  } finally {
    generating.value = false
  }
}

// ===== 导入密钥表单 =====

const importFormRef = ref<FormInstance>()
const importForm = reactive({
  fileContent: '',
  name: '',
  passphrase: '',
})

const importRules: FormRules = {
  fileContent: [{ required: true, message: t('keys.privateKeyRequired'), trigger: 'blur' }],
}

function resetImportForm(): void {
  importForm.fileContent = ''
  importForm.name = ''
  importForm.passphrase = ''
  importFormRef.value?.clearValidate()
}

async function doImport(): Promise<void> {
  const valid = await importFormRef.value?.validate().catch(() => false)
  if (!valid) return

  importing.value = true
  try {
    await keysStore.importKey(
      importForm.fileContent,
      importForm.name || undefined,
      importForm.passphrase || undefined,
    )
    showImportDialog.value = false
    ElMessage.success(t('keys.importSuccess'))
  } catch (err: unknown) {
    ElMessage.error(err instanceof Error ? err.message : t('keys.importError'))
  } finally {
    importing.value = false
  }
}

// ===== 列表操作 =====

async function copyPublicKey(key: SshKey): Promise<void> {
  const ok = await copyPubKey(key.publicKey)
  if (!ok) ElMessage.error(t('keys.copyError'))
}

async function copyDeployCommand(key: SshKey): Promise<void> {
  // 生成可在远程主机上粘贴执行的部署命令
  const pubKey = key.publicKey.trim()
  const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${pubKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`
  const ok = await copyDeploy(cmd)
  if (!ok) ElMessage.error(t('keys.copyError'))
}

async function deleteKey(id: string, name: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('keys.deleteConfirm', { name }),
      t('common.confirm'),
      { type: 'warning', confirmButtonClass: 'el-button--danger' }
    )
    await keysStore.deleteKey(id)
    ElMessage.success(t('keys.deleteSuccess'))
  } catch {
    // user cancelled
  }
}

// ===== 工具函数 =====

function tagType(keyType: string): 'success' | 'primary' | 'warning' {
  if (keyType === 'ed25519') return 'success'
  if (keyType === 'rsa') return 'primary'
  return 'warning'
}

function formatDate(iso?: string): string {
  if (!iso) return '-'
  return iso.replace('T', ' ').substring(0, 16)
}

// ===== 初始化 =====

onMounted(() => keysStore.fetchKeys())
</script>

<style lang="scss" scoped>
.keys-settings {
  max-width: 680px;

  .section-title { font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; }
  .section-desc { font-size: 13px; color: var(--text-secondary); margin-bottom: 24px; }
}

.keys-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.keys {
  &__loading {
    padding: 16px 0; text-align: center; font-size: 13px; color: var(--text-tertiary);
  }

  &__list { display: flex; flex-direction: column; gap: 2px; }

  &__item {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; border-radius: 6px; transition: background-color 0.15s;
    &:hover { background-color: var(--bg-hover); }
  }

  &__info { flex: 1; overflow: hidden; }

  &__name-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  }

  &__name {
    font-size: 14px; font-weight: 500; color: var(--text-primary);
  }

  &__type-tag { flex-shrink: 0; }

  &__fingerprint {
    display: block; font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: var(--text-secondary); word-break: break-all; margin-bottom: 2px;
  }

  &__meta {
    display: block; font-size: 11px; color: var(--text-tertiary);
  }

  &__actions {
    display: flex; gap: 4px; flex-shrink: 0; margin-left: 12px;
  }
}
</style>
