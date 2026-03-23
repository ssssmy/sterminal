import { deriveApiBase, normalizeServerUrl, DEFAULT_SERVER_URL } from '../../shared/utils/server-url'

const SERVER_URL_KEY = 'server_url'

class ApiClient {
  private token: string | null = null
  private apiBase: string = deriveApiBase(
    localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
  )

  setToken(token: string | null): void {
    this.token = token
  }

  setServerUrl(url: string): void {
    const normalized = normalizeServerUrl(url)
    localStorage.setItem(SERVER_URL_KEY, normalized)
    this.apiBase = deriveApiBase(normalized)
  }

  getServerUrl(): string {
    return localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`
    }

    let res: Response
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new Error('无法连接服务器，请确认后端服务已启动')
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      const err = new Error(error.message || `HTTP ${res.status}`)
      ;(err as Error & { status: number }).status = res.status
      throw err
    }

    if (res.status === 204) return undefined as T

    const json = await res.json()
    // 后端响应格式可能是 { code, data, message } 或直接返回数据
    return (json.data !== undefined ? json.data : json) as T
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body)
  }
}

export const api = new ApiClient()
