import { describe, it, expect } from 'vitest'
import { parseVariables, hasVariables, replaceVariables } from './snippet-variables'

describe('parseVariables', () => {
  it('解析基本变量', () => {
    const vars = parseVariables('echo ${name}')
    expect(vars).toHaveLength(1)
    expect(vars[0]).toMatchObject({ name: 'name', type: 'text', defaultValue: '' })
  })

  it('解析带默认值的变量', () => {
    const vars = parseVariables('deploy ${env:production}')
    expect(vars[0]).toMatchObject({ name: 'env', type: 'text', defaultValue: 'production' })
  })

  it('解析下拉选择变量', () => {
    const vars = parseVariables('${env:dev|staging|prod}')
    expect(vars[0]).toMatchObject({
      name: 'env',
      type: 'select',
      options: ['dev', 'staging', 'prod'],
    })
  })

  it('解析密码变量', () => {
    const vars = parseVariables('mysql -p${!password}')
    expect(vars[0]).toMatchObject({ name: 'password', type: 'password' })
  })

  it('跳过内置变量', () => {
    const vars = parseVariables('echo ${date} ${time} ${datetime} ${timestamp}')
    expect(vars).toHaveLength(0)
  })

  it('跳过 __date__ 形式的内置变量', () => {
    const vars = parseVariables('${__date__} ${__timestamp__}')
    expect(vars).toHaveLength(0)
  })

  it('同名变量只返回一次', () => {
    const vars = parseVariables('${host} ssh ${host}')
    expect(vars).toHaveLength(1)
    expect(vars[0].name).toBe('host')
  })

  it('空字符串返回空数组', () => {
    expect(parseVariables('')).toHaveLength(0)
  })

  it('无变量时返回空数组', () => {
    expect(parseVariables('ls -la /tmp')).toHaveLength(0)
  })

  it('保留 raw 原始文本', () => {
    const vars = parseVariables('${host:localhost}')
    expect(vars[0].raw).toBe('${host:localhost}')
  })
})

describe('hasVariables', () => {
  it('有用户变量时返回 true', () => {
    expect(hasVariables('echo ${name}')).toBe(true)
  })

  it('只有内置变量时返回 false', () => {
    expect(hasVariables('date: ${date}')).toBe(false)
  })

  it('无变量时返回 false', () => {
    expect(hasVariables('ls -la')).toBe(false)
  })

  it('混合内置和用户变量时返回 true', () => {
    expect(hasVariables('${date} to ${env}')).toBe(true)
  })
})

describe('replaceVariables', () => {
  it('替换普通变量', () => {
    const result = replaceVariables('ssh ${user}@${host}', { user: 'admin', host: '192.168.1.1' })
    expect(result).toBe('ssh admin@192.168.1.1')
  })

  it('未提供值时使用默认值', () => {
    const result = replaceVariables('${env:production}', {})
    expect(result).toBe('production')
  })

  it('未提供值且无默认值时保留原文', () => {
    const result = replaceVariables('${env}', {})
    expect(result).toBe('${env}')
  })

  it('下拉变量未提供值时取第一个选项', () => {
    const result = replaceVariables('${env:dev|staging|prod}', {})
    expect(result).toBe('dev')
  })

  it('替换内置变量 date/time/datetime/timestamp', () => {
    const result = replaceVariables('${date} ${time}', {})
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('替换 __date__ 形式的内置变量', () => {
    const result = replaceVariables('${__date__}', {})
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('替换 hostname 内置变量', () => {
    const result = replaceVariables('${hostname}', {}, 'prod-server')
    expect(result).toBe('prod-server')
  })

  it('hostname 无主机标签时返回空串', () => {
    const result = replaceVariables('${hostname}', {})
    expect(result).toBe('')
  })

  it('timestamp 为纯数字', () => {
    const result = replaceVariables('${timestamp}', {})
    expect(Number(result)).toBeGreaterThan(0)
  })

  it('密码变量正常替换', () => {
    const result = replaceVariables('mysql -p${!password}', { password: 'secret123' })
    expect(result).toBe('mysql -psecret123')
  })
})
