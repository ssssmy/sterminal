import { describe, it, expect } from 'vitest'
import { parseVariables, hasVariables, replaceVariables } from '../snippet-variables'

describe('parseVariables', () => {
  it('parses basic text variable', () => {
    const vars = parseVariables('echo ${name}')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ name: 'name', type: 'text', defaultValue: '' })
  })

  it('parses variable with default value', () => {
    const vars = parseVariables('systemctl restart ${service:nginx}')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ name: 'service', type: 'text', defaultValue: 'nginx' })
  })

  it('parses select variable with options', () => {
    const vars = parseVariables('${env:dev|staging|prod}')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({
      name: 'env',
      type: 'select',
      options: ['dev', 'staging', 'prod'],
    })
  })

  it('parses password variable', () => {
    const vars = parseVariables('mysql -p${!password}')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ name: 'password', type: 'password' })
  })

  it('deduplicates variables by name', () => {
    const vars = parseVariables('${name} ${name}')
    expect(vars).toHaveLength(1)
  })

  it('skips builtin variables', () => {
    const vars = parseVariables('echo ${date} ${__time__} ${name}')
    expect(vars).toHaveLength(1)
    expect(vars[0].name).toBe('name')
  })

  it('returns empty array for no variables', () => {
    expect(parseVariables('plain text')).toHaveLength(0)
  })

  it('handles multiple different variables', () => {
    const vars = parseVariables('ssh ${user:root}@${host} -p ${port:22}')
    expect(vars).toHaveLength(3)
    expect(vars.map(v => v.name)).toEqual(['user', 'host', 'port'])
  })

  it('preserves raw match text', () => {
    const vars = parseVariables('${service:nginx}')
    expect(vars[0].raw).toBe('${service:nginx}')
  })
})

describe('hasVariables', () => {
  it('returns true for content with user variables', () => {
    expect(hasVariables('echo ${name}')).toBe(true)
  })

  it('returns false for content with only builtin variables', () => {
    expect(hasVariables('echo ${date} ${__time__}')).toBe(false)
  })

  it('returns false for plain text', () => {
    expect(hasVariables('echo hello')).toBe(false)
  })

  it('returns true for mixed builtin and user variables', () => {
    expect(hasVariables('${date} ${name}')).toBe(true)
  })
})

describe('replaceVariables', () => {
  it('replaces user variables with provided values', () => {
    const result = replaceVariables('echo ${name}', { name: 'world' })
    expect(result).toBe('echo world')
  })

  it('uses default value when no value provided', () => {
    const result = replaceVariables('systemctl restart ${service:nginx}', {})
    expect(result).toBe('systemctl restart nginx')
  })

  it('uses first option as default for select variables', () => {
    const result = replaceVariables('${env:dev|staging|prod}', {})
    expect(result).toBe('dev')
  })

  it('preserves raw text for variables without value or default', () => {
    const result = replaceVariables('echo ${unknown}', {})
    expect(result).toBe('echo ${unknown}')
  })

  it('replaces builtin date variables', () => {
    const result = replaceVariables('log-${date}.txt', {})
    expect(result).toMatch(/^log-\d{4}-\d{2}-\d{2}\.txt$/)
  })

  it('replaces builtin time variable', () => {
    const result = replaceVariables('${time}', {})
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('replaces builtin timestamp variable', () => {
    const result = replaceVariables('${timestamp}', {})
    const ts = parseInt(result)
    expect(ts).toBeGreaterThan(1700000000)
  })

  it('replaces hostname builtin with provided label', () => {
    const result = replaceVariables('Connected to ${hostname}', {}, 'myserver')
    expect(result).toBe('Connected to myserver')
  })

  it('replaces hostname builtin with empty string when no label', () => {
    const result = replaceVariables('Host: ${__hostname__}', {})
    expect(result).toBe('Host: ')
  })

  it('handles multiple replacements in one string', () => {
    const result = replaceVariables('${user}@${host}:${port:22}', {
      user: 'admin',
      host: '10.0.0.1',
    })
    expect(result).toBe('admin@10.0.0.1:22')
  })
})
