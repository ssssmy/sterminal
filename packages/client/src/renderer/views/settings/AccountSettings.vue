<template>
  <div class="account-settings">
    <h3 class="section-title">{{ t('settings.account') }}</h3>
    <p class="section-desc">{{ t('settings.account_desc') }}</p>

    <!-- ===== 未登录状态 ===== -->
    <template v-if="!authStore.isLoggedIn">
      <div class="offline-block">
        <div class="offline-block__icon">
          <el-icon :size="32"><UserFilled /></el-icon>
        </div>
        <p class="offline-block__title">{{ t('accountSettings.offlineTitle') }}</p>
        <p class="offline-block__desc">{{ t('accountSettings.offlineDesc') }}</p>
        <div class="offline-block__actions">
          <el-button type="primary" @click="router.push('/login')">
            {{ t('accountSettings.loginBtn') }}
          </el-button>
          <el-button @click="router.push('/register')">
            {{ t('accountSettings.registerBtn') }}
          </el-button>
        </div>
      </div>
    </template>

    <!-- ===== 已登录状态 ===== -->
    <template v-else>

      <!-- ===== 用户信息区块 ===== -->
      <div class="settings-block">
        <h4 class="settings-block__title">{{ t('accountSettings.profileSection') }}</h4>

        <!-- 头像 + 基本信息 -->
        <div class="profile-header">
          <div class="profile-avatar">
            <span class="profile-avatar__text">{{ userInitial }}</span>
          </div>
          <div class="profile-meta">
            <span class="profile-meta__username">{{ authStore.user?.username }}</span>
            <span class="profile-meta__email">{{ authStore.user?.email }}</span>
            <span
              class="profile-meta__badge"
              :class="authStore.user?.emailVerified ? 'profile-meta__badge--verified' : 'profile-meta__badge--unverified'"
            >
              {{ authStore.user?.emailVerified ? t('accountSettings.emailVerified') : t('accountSettings.emailUnverified') }}
            </span>
          </div>
        </div>

        <!-- 修改用户名 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.usernameLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.usernameDesc') }}</span>
          </div>
          <div class="settings-row__control">
            <el-input
              v-model="editUsername"
              style="width: 200px"
              :placeholder="t('accountSettings.usernamePlaceholder')"
              maxlength="32"
            />
            <el-button
              type="primary"
              :loading="savingUsername"
              :disabled="editUsername === authStore.user?.username || !editUsername.trim()"
              @click="handleSaveUsername"
            >
              {{ t('accountSettings.save') }}
            </el-button>
          </div>
        </div>

        <!-- 邮箱（只读） -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.emailLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.emailDesc') }}</span>
          </div>
          <span class="settings-row__readonly">{{ authStore.user?.email }}</span>
        </div>

        <!-- 注册时间 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.memberSince') }}</label>
          </div>
          <span class="settings-row__readonly">{{ formattedCreatedAt }}</span>
        </div>
      </div>

      <!-- ===== 修改密码区块 ===== -->
      <div class="settings-block">
        <h4 class="settings-block__title">{{ t('accountSettings.passwordSection') }}</h4>

        <el-form
          ref="passwordFormRef"
          :model="passwordForm"
          :rules="passwordRules"
          label-position="top"
          class="password-form"
        >
          <div class="settings-row settings-row--column">
            <div class="settings-row__info">
              <label class="settings-row__label">{{ t('accountSettings.currentPassword') }}</label>
            </div>
            <el-form-item prop="currentPassword" class="password-form__item">
              <el-input
                v-model="passwordForm.currentPassword"
                type="password"
                show-password
                :placeholder="t('accountSettings.currentPasswordPlaceholder')"
                style="width: 320px"
                autocomplete="current-password"
              />
            </el-form-item>
          </div>

          <div class="settings-row settings-row--column">
            <div class="settings-row__info">
              <label class="settings-row__label">{{ t('accountSettings.newPassword') }}</label>
            </div>
            <el-form-item prop="newPassword" class="password-form__item">
              <el-input
                v-model="passwordForm.newPassword"
                type="password"
                show-password
                :placeholder="t('accountSettings.newPasswordPlaceholder')"
                style="width: 320px"
                autocomplete="new-password"
                @input="updatePasswordStrength"
              />
              <!-- 密码强度指示器 -->
              <div v-if="passwordForm.newPassword" class="password-strength">
                <div class="password-strength__bars">
                  <span
                    v-for="i in 3"
                    :key="i"
                    class="password-strength__bar"
                    :class="getStrengthBarClass(i)"
                  />
                </div>
                <span class="password-strength__label" :class="`strength-${passwordStrength}`">
                  {{ passwordStrengthLabel }}
                </span>
              </div>
            </el-form-item>
          </div>

          <div class="settings-row settings-row--column">
            <div class="settings-row__info">
              <label class="settings-row__label">{{ t('accountSettings.confirmPassword') }}</label>
            </div>
            <el-form-item prop="confirmPassword" class="password-form__item">
              <el-input
                v-model="passwordForm.confirmPassword"
                type="password"
                show-password
                :placeholder="t('accountSettings.confirmPasswordPlaceholder')"
                style="width: 320px"
                autocomplete="new-password"
              />
            </el-form-item>
          </div>

          <div class="password-form__actions">
            <el-button
              type="primary"
              :loading="savingPassword"
              @click="handleChangePassword"
            >
              {{ t('accountSettings.changePasswordBtn') }}
            </el-button>
          </div>
        </el-form>
      </div>

      <!-- ===== 云同步区块 ===== -->
      <div class="settings-block">
        <h4 class="settings-block__title">{{ t('accountSettings.syncSection') }}</h4>

        <!-- 服务器地址 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.serverUrlLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.serverUrlDesc') }}</span>
          </div>
          <div class="settings-row__control">
            <span class="settings-row__readonly">{{ currentServerUrl }}</span>
            <el-button size="small" @click="handleChangeServer">
              {{ t('accountSettings.changeServerBtn') }}
            </el-button>
          </div>
        </div>

        <!-- 同步状态 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.syncStatusLabel') }}</label>
            <span class="settings-row__desc">{{ syncStatusDesc }}</span>
          </div>
          <div class="settings-row__control">
            <el-tag :type="syncStatusTagType" size="small">{{ syncStatusText }}</el-tag>
            <el-button
              v-if="syncStore.isActive"
              size="small"
              :loading="syncStore.isSyncing"
              @click="handleSyncNow"
            >
              {{ t('accountSettings.syncNowBtn') }}
            </el-button>
            <el-button
              v-if="!syncStore.isActive"
              type="primary"
              size="small"
              @click="handleStartSync"
            >
              {{ t('accountSettings.startSyncBtn') }}
            </el-button>
            <el-button
              v-else
              size="small"
              @click="handleStopSync"
            >
              {{ t('accountSettings.stopSyncBtn') }}
            </el-button>
          </div>
        </div>

        <!-- 上次同步时间 -->
        <div v-if="syncStore.lastSyncAt" class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.lastSyncLabel') }}</label>
          </div>
          <span class="settings-row__readonly">{{ formatSyncTime(syncStore.lastSyncAt) }}</span>
        </div>

        <!-- 自动同步 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.autoSyncLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.autoSyncDesc') }}</span>
          </div>
          <div class="settings-row__control">
            <el-select
              v-model="autoSyncInterval"
              style="width: 160px"
              @change="handleAutoSyncChange"
            >
              <el-option :label="t('accountSettings.autoSyncOff')" :value="0" />
              <el-option :label="t('accountSettings.autoSync1min')" :value="1" />
              <el-option :label="t('accountSettings.autoSync5min')" :value="5" />
              <el-option :label="t('accountSettings.autoSync15min')" :value="15" />
              <el-option :label="t('accountSettings.autoSync30min')" :value="30" />
              <el-option :label="t('accountSettings.autoSync60min')" :value="60" />
            </el-select>
          </div>
        </div>

        <!-- E2EE 加密 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.encryptionLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.encryptionDesc') }}</span>
          </div>
          <div class="settings-row__control">
            <el-tag v-if="syncStore.hasEncryptionKey" type="success" size="small">
              {{ t('accountSettings.encryptionEnabled') }}
            </el-tag>
            <el-button
              v-if="!syncStore.hasEncryptionKey"
              size="small"
              @click="showEncryptionDialog = true"
            >
              {{ t('accountSettings.setEncryptionBtn') }}
            </el-button>
            <el-button
              v-else
              size="small"
              @click="handleClearEncryption"
            >
              {{ t('accountSettings.lockEncryptionBtn') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- ===== 危险操作区块 ===== -->
      <div class="settings-block settings-block--danger">
        <h4 class="settings-block__title settings-block__title--danger">{{ t('accountSettings.dangerSection') }}</h4>

        <!-- 退出登录 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.logoutLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.logoutDesc') }}</span>
          </div>
          <el-button type="danger" plain @click="handleLogout">
            {{ t('accountSettings.logoutBtn') }}
          </el-button>
        </div>

        <!-- 删除账户 -->
        <div class="settings-row">
          <div class="settings-row__info">
            <label class="settings-row__label">{{ t('accountSettings.deleteAccountLabel') }}</label>
            <span class="settings-row__desc">{{ t('accountSettings.deleteAccountDesc') }}</span>
          </div>
          <el-button type="danger" @click="showDeleteDialog = true">
            {{ t('accountSettings.deleteAccountBtn') }}
          </el-button>
        </div>
      </div>

    </template>

    <!-- ===== E2EE 加密设置弹窗 ===== -->
    <el-dialog
      v-model="showEncryptionDialog"
      :title="t('accountSettings.encryptionDialogTitle')"
      width="420px"
      :close-on-click-modal="false"
    >
      <p class="encryption-dialog__desc">{{ t('accountSettings.encryptionDialogDesc') }}</p>
      <el-input
        v-model="encryptionPassphrase"
        type="password"
        show-password
        :placeholder="t('accountSettings.encryptionPassphrasePlaceholder')"
        style="margin-top: 16px"
      />
      <el-input
        v-if="!syncStore.encryptionSalt"
        v-model="encryptionPassphraseConfirm"
        type="password"
        show-password
        :placeholder="t('accountSettings.encryptionPassphraseConfirmPlaceholder')"
        style="margin-top: 12px"
      />
      <template #footer>
        <el-button @click="showEncryptionDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="settingEncryption"
          :disabled="!encryptionPassphrase || (!syncStore.encryptionSalt && encryptionPassphrase !== encryptionPassphraseConfirm)"
          @click="handleSetEncryption"
        >
          {{ t('accountSettings.encryptionConfirmBtn') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ===== 删除账户确认弹窗 ===== -->
    <el-dialog
      v-model="showDeleteDialog"
      :title="t('accountSettings.deleteDialogTitle')"
      width="420px"
      :close-on-click-modal="false"
    >
      <p class="delete-dialog__desc">{{ t('accountSettings.deleteDialogDesc') }}</p>
      <el-input
        v-model="deleteConfirmPassword"
        type="password"
        show-password
        :placeholder="t('accountSettings.deleteDialogPasswordPlaceholder')"
        style="margin-top: 16px"
        autocomplete="current-password"
      />
      <template #footer>
        <el-button @click="showDeleteDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button
          type="danger"
          :loading="deletingAccount"
          :disabled="!deleteConfirmPassword"
          @click="handleDeleteAccount"
        >
          {{ t('accountSettings.deleteDialogConfirmBtn') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UserFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth.store'
import { useSyncStore } from '../../stores/sync.store'
import { useSettingsStore } from '../../stores/settings.store'
import { api } from '../../services/api'
import { IPC_SERVER } from '../../../shared/types/ipc-channels'

const { t } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const syncStore = useSyncStore()
const settingsStore = useSettingsStore()

// ===== 用户信息 =====

/** 头像首字母 */
const userInitial = computed(() => {
  const name = authStore.user?.username ?? authStore.user?.email ?? ''
  return name.charAt(0).toUpperCase() || '?'
})

/** 注册时间格式化 */
const formattedCreatedAt = computed(() => {
  const raw = authStore.user?.createdAt
  if (!raw) return '—'
  try {
    return new Date(raw).toLocaleDateString()
  } catch {
    return raw
  }
})

// ===== 修改用户名 =====

const editUsername = ref(authStore.user?.username ?? '')
const savingUsername = ref(false)

// 当 user 变化时同步编辑值
watch(
  () => authStore.user?.username,
  (val) => {
    if (val !== undefined) editUsername.value = val
  }
)

async function handleSaveUsername(): Promise<void> {
  const trimmed = editUsername.value.trim()
  if (!trimmed) return
  savingUsername.value = true
  try {
    await authStore.updateProfile({ username: trimmed })
    ElMessage.success(t('accountSettings.saveSuccess'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.saveFailed'))
  } finally {
    savingUsername.value = false
  }
}

// ===== 修改密码 =====

const passwordFormRef = ref<FormInstance>()
const savingPassword = ref(false)
const passwordStrength = ref<0 | 1 | 2 | 3>(0)

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const passwordStrengthLabel = computed(() => {
  const labels: Record<number, string> = {
    0: '',
    1: t('registerView.strengthWeak'),
    2: t('registerView.strengthMedium'),
    3: t('registerView.strengthStrong'),
  }
  return labels[passwordStrength.value]
})

function updatePasswordStrength(): void {
  const pwd = passwordForm.value.newPassword
  if (!pwd || pwd.length < 8) {
    passwordStrength.value = pwd.length > 0 ? 1 : 0
    return
  }
  const hasLower = /[a-z]/.test(pwd)
  const hasUpper = /[A-Z]/.test(pwd)
  const hasNumber = /[0-9]/.test(pwd)
  if (hasLower && hasUpper && hasNumber) {
    passwordStrength.value = 3
  } else if ((hasLower || hasUpper) && hasNumber) {
    passwordStrength.value = 2
  } else {
    passwordStrength.value = 1
  }
}

function getStrengthBarClass(barIndex: number): string {
  if (passwordStrength.value >= barIndex) {
    return `strength-bar--active strength-${passwordStrength.value}`
  }
  return ''
}

const validateNewPassword = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void
): void => {
  if (!value) {
    callback(new Error(t('accountSettings.validNewPasswordRequired')))
    return
  }
  if (value.length < 8) {
    callback(new Error(t('registerView.validPasswordLength')))
    return
  }
  if (!/[a-z]/.test(value)) {
    callback(new Error(t('registerView.validPasswordLower')))
    return
  }
  if (!/[A-Z]/.test(value)) {
    callback(new Error(t('registerView.validPasswordUpper')))
    return
  }
  if (!/[0-9]/.test(value)) {
    callback(new Error(t('registerView.validPasswordNumber')))
    return
  }
  callback()
}

const validateConfirmPassword = (
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void
): void => {
  if (!value) {
    callback(new Error(t('registerView.validConfirmRequired')))
  } else if (value !== passwordForm.value.newPassword) {
    callback(new Error(t('registerView.validConfirmMatch')))
  } else {
    callback()
  }
}

const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: t('accountSettings.validCurrentPasswordRequired'), trigger: 'blur' },
  ],
  newPassword: [
    { required: true, validator: validateNewPassword, trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

async function handleChangePassword(): Promise<void> {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  savingPassword.value = true
  try {
    await authStore.changePassword(
      passwordForm.value.currentPassword,
      passwordForm.value.newPassword
    )
    ElMessage.success(t('accountSettings.passwordChanged'))
    passwordForm.value = { currentPassword: '', newPassword: '', confirmPassword: '' }
    passwordStrength.value = 0
    passwordFormRef.value?.resetFields()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.passwordChangeFailed'))
  } finally {
    savingPassword.value = false
  }
}

// ===== 退出登录 =====

async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('accountSettings.logoutConfirmMsg'),
      t('accountSettings.logoutConfirmTitle'),
      { confirmButtonText: t('accountSettings.logoutBtn'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch {
    return
  }
  authStore.logout()
  router.push('/login')
}

// ===== 删除账户 =====

const showDeleteDialog = ref(false)
const deleteConfirmPassword = ref('')
const deletingAccount = ref(false)

async function handleDeleteAccount(): Promise<void> {
  if (!deleteConfirmPassword.value) return
  deletingAccount.value = true
  try {
    await authStore.deleteAccount(deleteConfirmPassword.value)
    ElMessage.success(t('accountSettings.accountDeleted'))
    showDeleteDialog.value = false
    await syncStore.stopSync()
    authStore.logout()
    router.push('/login')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.deleteAccountFailed'))
  } finally {
    deletingAccount.value = false
    deleteConfirmPassword.value = ''
  }
}

// ===== 服务器地址 =====

const currentServerUrl = ref(api.getServerUrl())

async function handleChangeServer(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      t('accountSettings.changeServerConfirm'),
      t('accountSettings.changeServerTitle'),
      { confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel'), type: 'warning' }
    )
  } catch { return }
  await syncStore.stopSync()
  await authStore.logout()
  router.push('/login')
}

// ===== 云同步 =====

const syncStatusText = computed(() => {
  switch (syncStore.status.state) {
    case 'idle': return t('accountSettings.syncStatusIdle')
    case 'syncing': return t('accountSettings.syncStatusSyncing')
    case 'error': return t('accountSettings.syncStatusError')
    case 'stopped': return t('accountSettings.syncStatusStopped')
    default: return '—'
  }
})

const syncStatusDesc = computed(() => {
  if (syncStore.status.state === 'error' && syncStore.status.message) {
    return syncStore.status.message
  }
  return t('accountSettings.syncStatusDesc')
})

const syncStatusTagType = computed(() => {
  switch (syncStore.status.state) {
    case 'idle': return 'success'
    case 'syncing': return 'warning'
    case 'error': return 'danger'
    case 'stopped': return 'info'
    default: return 'info' as const
  }
})

function formatSyncTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

async function handleStartSync(): Promise<void> {
  if (!authStore.token) return
  try {
    await syncStore.startSync(authStore.token)
    // 检查是否需要设置加密
    const salt = await syncStore.fetchSalt()
    if (salt) {
      // 已有 salt，需要输入密码解锁
      showEncryptionDialog.value = true
    }
    ElMessage.success(t('accountSettings.syncStarted'))
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.syncStartFailed'))
  }
}

async function handleStopSync(): Promise<void> {
  await syncStore.stopSync()
  ElMessage.info(t('accountSettings.syncStopped'))
}

async function handleSyncNow(): Promise<void> {
  try {
    await syncStore.syncNow()
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.syncFailed'))
  }
}

// ===== 自动同步间隔 =====
const autoSyncInterval = ref(5)

async function handleAutoSyncChange(val: number): Promise<void> {
  await settingsStore.setSetting('sync.autoInterval', val)
  syncStore.setAutoSyncInterval(val)
}

// E2EE 加密
const showEncryptionDialog = ref(false)
const encryptionPassphrase = ref('')
const encryptionPassphraseConfirm = ref('')
const settingEncryption = ref(false)

async function handleSetEncryption(): Promise<void> {
  if (!encryptionPassphrase.value) return
  settingEncryption.value = true
  try {
    await syncStore.setEncryption(
      encryptionPassphrase.value,
      syncStore.encryptionSalt ?? undefined
    )
    ElMessage.success(t('accountSettings.encryptionSet'))
    showEncryptionDialog.value = false
    encryptionPassphrase.value = ''
    encryptionPassphraseConfirm.value = ''
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : t('accountSettings.encryptionFailed'))
  } finally {
    settingEncryption.value = false
  }
}

async function handleClearEncryption(): Promise<void> {
  await syncStore.clearEncryption()
  ElMessage.info(t('accountSettings.encryptionCleared'))
}

// 初始化
if (authStore.isLoggedIn) {
  syncStore.checkEncryption()
  syncStore.refreshStatus()
  settingsStore.getSetting<number>('sync.autoInterval').then(val => {
    if (val != null) autoSyncInterval.value = val
  }).catch(() => { /* use default */ })
}
</script>

<style lang="scss" scoped>
.account-settings {
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

// ===== 未登录占位 =====
.offline-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  border: 1px dashed var(--divider);
  border-radius: 12px;
  text-align: center;
  gap: 12px;

  &__icon {
    color: var(--text-tertiary);
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  &__desc {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0;
    max-width: 360px;
  }

  &__actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }
}

// ===== 设置块 =====
.settings-block {
  margin-bottom: 32px;

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--divider);
  }

  &--danger {
    border: 1px solid var(--el-color-danger-light-5);
    border-radius: 8px;
    padding: 16px;
  }

  &__title--danger {
    color: var(--el-color-danger);
    border-bottom-color: var(--el-color-danger-light-7);
  }
}

// ===== 用户信息头部 =====
.profile-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0 20px;
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--el-color-primary-dark-2, #8b5cf6));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &__text {
    color: #fff;
    font-size: 22px;
    font-weight: 700;
  }
}

.profile-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__username {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__email {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &__badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 10px;
    width: fit-content;

    &--verified {
      background-color: var(--el-color-success-light-9);
      color: var(--el-color-success);
    }

    &--unverified {
      background-color: var(--el-color-warning-light-9);
      color: var(--el-color-warning);
    }
  }
}

// ===== 设置行 =====
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  min-height: 48px;

  &--column {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    min-height: unset;
  }

  &__info {
    flex: 1;
    margin-right: 24px;
  }

  &__label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-tertiary);
  }

  &__control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__readonly {
    font-size: 13px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
}

// ===== 密码表单 =====
.password-form {
  :deep(.el-form-item) {
    margin-bottom: 0;
  }

  &__item {
    width: 100%;
  }

  &__actions {
    padding-top: 8px;
  }
}

// ===== 密码强度指示器 =====
.password-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;

  &__bars {
    display: flex;
    gap: 4px;
  }

  &__bar {
    width: 40px;
    height: 3px;
    border-radius: 2px;
    background-color: var(--divider);
    transition: background-color 0.2s ease;

    &.strength-bar--active {
      &.strength-1 { background-color: var(--error); }
      &.strength-2 { background-color: var(--warning); }
      &.strength-3 { background-color: var(--success); }
    }
  }

  &__label {
    font-size: 11px;
    font-weight: 500;

    &.strength-1 { color: var(--error); }
    &.strength-2 { color: var(--warning); }
    &.strength-3 { color: var(--success); }
  }
}

// ===== 删除弹窗 =====
.delete-dialog__desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

// ===== 加密弹窗 =====
.encryption-dialog__desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}
</style>
