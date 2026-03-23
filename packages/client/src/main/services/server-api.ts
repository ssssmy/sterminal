import { getServerUrl } from './server-url-service'
import { deriveApiBase } from '../../shared/utils/server-url'

class ServerApiClient {
  async request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const apiBase = deriveApiBase(getServerUrl())
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(error.message || `HTTP ${res.status}`)
    }

    if (res.status === 204) return undefined as T

    const json = await res.json()
    return (json.data !== undefined ? json.data : json) as T
  }

  get<T>(path: string, token?: string): Promise<T> {
    return this.request<T>('GET', path, undefined, token)
  }

  post<T>(path: string, body?: unknown, token?: string): Promise<T> {
    return this.request<T>('POST', path, body, token)
  }

  delete<T>(path: string, body?: unknown, token?: string): Promise<T> {
    return this.request<T>('DELETE', path, body, token)
  }
}

export const api = new ServerApiClient()
