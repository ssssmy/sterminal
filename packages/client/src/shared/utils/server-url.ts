export const DEFAULT_SERVER_URL = 'http://localhost:3001'

export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, '')
}

export function deriveApiBase(serverUrl: string): string {
  return normalizeServerUrl(serverUrl) + '/api/v1'
}

export function deriveWsUrl(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/^http/, 'ws') + '/ws'
}
