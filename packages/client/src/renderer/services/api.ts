// HTTP API 客户端
// 封装对后端 REST API 的调用

const API_BASE = 'http://localhost:3000/api/v1'

class ApiClient {
  private token: string | null = null

  setToken(token: string | null): void {
    this.token = token
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
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch {
      throw new Error('无法连接服务器，请确认后端服务已启动')
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }))
      throw new Error(error.message || `HTTP ${res.status}`)
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

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }
}

export const api = new ApiClient()
