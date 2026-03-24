export type VaultEntryType = 'password' | 'ssh_password' | 'api_key' | 'token' | 'certificate' | 'custom'

export interface VaultEntry {
  id: string
  name: string
  type: VaultEntryType
  username?: string
  value: string
  url?: string
  notes?: string
  tags?: string[]
  expiresAt?: string
  groupId?: string
  sortOrder: number
  createdAt?: string
  updatedAt?: string
}

export interface VaultConfig {
  isSetup: boolean
  isLocked: boolean
  lockTimeout: number
}

export interface PasswordGeneratorOptions {
  length: number
  uppercase: boolean
  lowercase: boolean
  numbers: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}
