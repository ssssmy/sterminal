<template>
  <div class="vault-settings">
    <h3 class="section-title">{{ t('vault.title') }}</h3>
    <p class="section-desc">{{ t('vault.desc') }}</p>

    <!-- 未设置状态 -->
    <div v-if="!vaultStore.isSetup" class="vault-setup">
      <div class="vault-setup__icon">
        <el-icon :size="48"><Lock /></el-icon>
      </div>
      <p class="vault-setup__title">{{ t('vault.setupTitle') }}</p>
      <p class="vault-setup__desc">{{ t('vault.setupDesc') }}</p>
      <el-form class="vault-setup__form" @submit.prevent="handleSetup">
        <el-form-item>
          <el-input
            v-model="setupPassword"
            type="password"
            show-password
            :placeholder="t('vault.masterPasswordPlaceholder')"
            style="width: 320px"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="setupPasswordConfirm"
            type="password"
            show-password
            :placeholder="t('vault.confirmPasswordPlaceholder')"
            style="width: 320px"
          />
        </el-form-item>
        <el-button
          type="primary"
          :loading="settingUp"
          :disabled="!setupPassword || setupPassword !== setupPasswordConfirm"
          @click="handleSetup"
        >
          {{ t('vault.setupBtn') }}
        </el-button>
      </el-form>
    </div>

    <!-- 已锁定状态 -->
    <div v-else-if="vaultStore.isLocked" class="vault-locked">
      <div class="vault-locked__icon">
        <el-icon :size="48"><Lock /></el-icon>
      </div>
      <p class="vault-locked__title">{{ t('vault.lockedTitle') }}</p>
      <div class="vault-locked__form">
        <el-input
          v-model="unlockPassword"
          type="password"
          show-password
          :placeholder="t('vault.masterPasswordPlaceholder')"
          style="width: 280px"
          @keyup.enter="handleUnlock"
        />
        <el-button type="primary" :loading="unlocking" @click="handleUnlock">
          {{ t('vault.unlockBtn') }}
        </el-button>
      </div>
    </div>

    <!-- 已解锁状态 -->
    <template v-else>
      <!-- 工具栏 -->
      <div class="vault-toolbar">
        <el-input
          v-model="searchQuery"
          :placeholder="t('vault.searchPlaceholder')"
          clearable
          :prefix-icon="Search"
          style="width: 240px"
        />
        <div class="vault-toolbar__actions">
          <el-button type="primary" @click="showAddDialog = true">{{ t('vault.addEntry') }}</el-button>
          <el-button @click="showGeneratorDialog = true">{{ t('vault.passwordGenerator') }}</el-button>
          <el-button @click="handleLock">
            <el-icon><Lock /></el-icon>
            {{ t('vault.lockBtn') }}
          </el-button>
        </div>
      </div>

      <!-- 条目列表 -->
      <div v-if="filteredEntries.length === 0" class="vault-empty">
        <el-empty :description="searchQuery ? t('vault.noResults') : t('vault.empty')" />
      </div>
      <div v-else class="vault-list">
        <div
          v-for="entry in filteredEntries"
          :key="entry.id"
          class="vault-entry"
        >
          <div class="vault-entry__info">
            <el-tag size="small" :type="getTypeTagType(entry.type) as any" class="vault-entry__type">
              {{ t(`vault.type_${entry.type}`) }}
            </el-tag>
            <span class="vault-entry__name">{{ entry.name }}</span>
            <span v-if="entry.username" class="vault-entry__username">{{ entry.username }}</span>
          </div>
          <div class="vault-entry__actions">
            <el-button size="small" @click="handleCopy(entry.value)">
              {{ t('vault.copy') }}
            </el-button>
            <el-button size="small" @click="openEditDialog(entry)">
              {{ t('vault.edit') }}
            </el-button>
            <el-button size="small" type="danger" plain @click="handleDelete(entry)">
              {{ t('vault.delete') }}
            </el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="showAddDialog"
      :title="editingEntry ? t('vault.editEntry') : t('vault.addEntry')"
      width="500px"
      :close-on-click-modal="false"
      @close="resetForm"
    >
      <el-form label-position="top">
        <el-form-item :label="t('vault.entryName')">
          <el-input v-model="entryForm.name" :placeholder="t('vault.entryNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('vault.entryType')">
          <el-select v-model="entryForm.type" style="width: 100%">
            <el-option v-for="t in entryTypes" :key="t" :label="$t(`vault.type_${t}`)" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('vault.entryUsername')">
          <el-input v-model="entryForm.username" :placeholder="t('vault.entryUsernamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('vault.entryValue')">
          <el-input
            v-model="entryForm.value"
            type="password"
            show-password
            :placeholder="t('vault.entryValuePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('vault.entryUrl')">
          <el-input v-model="entryForm.url" placeholder="https://" />
        </el-form-item>
        <el-form-item :label="t('vault.entryNotes')">
          <el-input v-model="entryForm.notes" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!entryForm.name || !entryForm.value" @click="handleSaveEntry">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 密码生成器对话框 -->
    <el-dialog v-model="showGeneratorDialog" :title="t('vault.passwordGenerator')" width="420px">
      <div class="password-generator">
        <div class="password-generator__preview">
          <code>{{ generatedPassword || '...' }}</code>
          <el-button size="small" :disabled="!generatedPassword" @click="handleCopy(generatedPassword)">
            {{ t('vault.copy') }}
          </el-button>
        </div>
        <div class="password-generator__options">
          <div class="password-generator__row">
            <span>{{ t('vault.genLength') }}</span>
            <el-slider v-model="genOptions.length" :min="8" :max="64" :step="1" style="width: 200px" />
            <span class="password-generator__value">{{ genOptions.length }}</span>
          </div>
          <el-checkbox v-model="genOptions.uppercase">{{ t('vault.genUppercase') }}</el-checkbox>
          <el-checkbox v-model="genOptions.lowercase">{{ t('vault.genLowercase') }}</el-checkbox>
          <el-checkbox v-model="genOptions.numbers">{{ t('vault.genNumbers') }}</el-checkbox>
          <el-checkbox v-model="genOptions.symbols">{{ t('vault.genSymbols') }}</el-checkbox>
        </div>
        <el-button type="primary" style="width: 100%; margin-top: 16px" @click="handleGenerate">
          {{ t('vault.generateBtn') }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Lock, Search } from '@element-plus/icons-vue'
import { useVaultStore } from '../../stores/vault.store'
import type { VaultEntry, VaultEntryType } from '../../../shared/types/vault'

const { t } = useI18n()
const vaultStore = useVaultStore()

const entryTypes: VaultEntryType[] = ['password', 'ssh_password', 'api_key', 'token', 'certificate', 'custom']

// Setup
const setupPassword = ref('')
const setupPasswordConfirm = ref('')
const settingUp = ref(false)

async function handleSetup(): Promise<void> {
  if (!setupPassword.value || setupPassword.value !== setupPasswordConfirm.value) return
  settingUp.value = true
  try {
    await vaultStore.setup(setupPassword.value)
    ElMessage.success(t('vault.setupSuccess'))
    setupPassword.value = ''
    setupPasswordConfirm.value = ''
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('vault.setupFailed'))
  } finally {
    settingUp.value = false
  }
}

// Unlock
const unlockPassword = ref('')
const unlocking = ref(false)

async function handleUnlock(): Promise<void> {
  if (!unlockPassword.value) return
  unlocking.value = true
  try {
    await vaultStore.unlock(unlockPassword.value)
    unlockPassword.value = ''
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('vault.unlockFailed'))
  } finally {
    unlocking.value = false
  }
}

function handleLock(): void {
  vaultStore.lock()
}

// Search
const searchQuery = ref('')
const filteredEntries = computed(() => {
  if (!searchQuery.value) return vaultStore.entries
  const q = searchQuery.value.toLowerCase()
  return vaultStore.entries.filter(e =>
    e.name.toLowerCase().includes(q) ||
    (e.username && e.username.toLowerCase().includes(q)) ||
    (e.url && e.url.toLowerCase().includes(q))
  )
})

// Entry CRUD
const showAddDialog = ref(false)
const editingEntry = ref<VaultEntry | null>(null)
const entryForm = reactive({
  name: '',
  type: 'password' as VaultEntryType,
  username: '',
  value: '',
  url: '',
  notes: '',
})

function resetForm(): void {
  editingEntry.value = null
  entryForm.name = ''
  entryForm.type = 'password'
  entryForm.username = ''
  entryForm.value = ''
  entryForm.url = ''
  entryForm.notes = ''
}

function openEditDialog(entry: VaultEntry): void {
  editingEntry.value = entry
  entryForm.name = entry.name
  entryForm.type = entry.type
  entryForm.username = entry.username || ''
  entryForm.value = entry.value
  entryForm.url = entry.url || ''
  entryForm.notes = entry.notes || ''
  showAddDialog.value = true
}

async function handleSaveEntry(): Promise<void> {
  const data = {
    name: entryForm.name,
    type: entryForm.type,
    username: entryForm.username || undefined,
    value: entryForm.value,
    url: entryForm.url || undefined,
    notes: entryForm.notes || undefined,
  }
  try {
    if (editingEntry.value) {
      await vaultStore.updateEntry(editingEntry.value.id, data)
    } else {
      await vaultStore.createEntry(data)
    }
    showAddDialog.value = false
    resetForm()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('vault.saveFailed'))
  }
}

async function handleDelete(entry: VaultEntry): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('vault.deleteConfirmMsg', { name: entry.name }),
      t('vault.deleteConfirmTitle'),
      { confirmButtonText: t('vault.delete'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
    await vaultStore.deleteEntry(entry.id)
    ElMessage.success(t('vault.deleted'))
  } catch { /* cancel */ }
}

// Clipboard
const clipboardTimers: ReturnType<typeof setTimeout>[] = []

onUnmounted(() => {
  clipboardTimers.forEach(t => clearTimeout(t))
  clipboardTimers.length = 0
})

async function handleCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('vault.copied'))
    const timer = setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText()
        if (current === text) await navigator.clipboard.writeText('')
      } catch { /* ignore */ }
    }, 30000)
    clipboardTimers.push(timer)
  } catch {
    ElMessage.error(t('vault.copyFailed'))
  }
}

// Password generator
const showGeneratorDialog = ref(false)
const generatedPassword = ref('')
const genOptions = reactive({
  length: 20,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
})

async function handleGenerate(): Promise<void> {
  try {
    generatedPassword.value = await vaultStore.generatePassword(genOptions)
  } catch {
    ElMessage.error(t('vault.generateFailed'))
  }
}

function getTypeTagType(type: VaultEntryType): string {
  const map: Record<string, string> = {
    password: '', ssh_password: 'warning', api_key: 'success',
    token: 'info', certificate: 'danger', custom: 'info',
  }
  return map[type] || ''
}

onMounted(() => {
  vaultStore.checkSetup()
})
</script>

<style lang="scss" scoped>
.vault-settings {
  max-width: 680px;

  .section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .section-desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }
}

.vault-setup, .vault-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  border: 1px dashed var(--divider);
  border-radius: 12px;
  text-align: center;
  gap: 12px;

  &__icon { color: var(--text-tertiary); }
  &__title { font-size: 15px; font-weight: 600; color: var(--text-primary); margin: 0; }
  &__desc { font-size: 13px; color: var(--text-secondary); margin: 0; max-width: 400px; }
}

.vault-setup__form {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  :deep(.el-form-item) { margin-bottom: 12px; }
}

.vault-locked__form {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.vault-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  &__actions { display: flex; gap: 8px; }
}

.vault-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vault-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border: 1px solid var(--divider);
  border-radius: 8px;
  background: var(--bg-secondary);

  &__info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-primary);
  }

  &__username {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

.vault-empty {
  padding: 48px 0;
}

.password-generator {
  &__preview {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    margin-bottom: 16px;

    code {
      flex: 1;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 14px;
      word-break: break-all;
      color: var(--text-primary);
    }
  }

  &__options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: var(--text-primary);
  }

  &__value {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    min-width: 30px;
    text-align: right;
  }
}
</style>
