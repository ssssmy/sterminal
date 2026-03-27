import { describe, it, expect } from 'vitest'
import { normalizeServerUrl, deriveApiBase, deriveWsUrl, DEFAULT_SERVER_URL } from '../server-url'

describe('normalizeServerUrl', () => {
  it('strips single trailing slash', () => {
    expect(normalizeServerUrl('http://localhost:3000/')).toBe('http://localhost:3000')
  })

  it('strips multiple trailing slashes', () => {
    expect(normalizeServerUrl('http://example.com///')).toBe('http://example.com')
  })

  it('leaves URL without trailing slash unchanged', () => {
    expect(normalizeServerUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('handles empty string', () => {
    expect(normalizeServerUrl('')).toBe('')
  })

  it('handles URL with path', () => {
    expect(normalizeServerUrl('http://example.com/api/')).toBe('http://example.com/api')
  })
})

describe('deriveApiBase', () => {
  it('appends /api/v1 to normalized URL', () => {
    expect(deriveApiBase('http://localhost:3000')).toBe('http://localhost:3000/api/v1')
  })

  it('strips trailing slash before appending', () => {
    expect(deriveApiBase('http://localhost:3000/')).toBe('http://localhost:3000/api/v1')
  })

  it('works with HTTPS', () => {
    expect(deriveApiBase('https://api.example.com')).toBe('https://api.example.com/api/v1')
  })

  it('works with custom port', () => {
    expect(deriveApiBase('http://192.168.1.1:8080')).toBe('http://192.168.1.1:8080/api/v1')
  })
})

describe('deriveWsUrl', () => {
  it('converts http to ws', () => {
    expect(deriveWsUrl('http://localhost:3000')).toBe('ws://localhost:3000/ws')
  })

  it('converts https to wss', () => {
    expect(deriveWsUrl('https://api.example.com')).toBe('wss://api.example.com/ws')
  })

  it('strips trailing slash before converting', () => {
    expect(deriveWsUrl('http://localhost:3000/')).toBe('ws://localhost:3000/ws')
  })

  it('works with IP address and port', () => {
    expect(deriveWsUrl('http://192.168.1.1:8080')).toBe('ws://192.168.1.1:8080/ws')
  })
})

describe('DEFAULT_SERVER_URL', () => {
  it('points to localhost:3000', () => {
    expect(DEFAULT_SERVER_URL).toBe('http://localhost:3000')
  })
})
