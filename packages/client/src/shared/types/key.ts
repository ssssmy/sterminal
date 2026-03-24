export interface SshKey {
  id: string
  name: string
  keyType: 'ed25519' | 'rsa' | 'ecdsa'
  bits?: number
  curve?: string
  fingerprint: string
  publicKey: string
  privateKeyEnc: string
  passphraseEnc?: string
  comment?: string
  autoLoadAgent: boolean
  createdAt?: string
}
