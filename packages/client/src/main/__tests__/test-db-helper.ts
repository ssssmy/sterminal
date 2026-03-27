// Test helper: in-memory SQLite database for integration tests
// Initializes a real SQLite database with the full schema but in :memory:

import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '../database/schema'

let testDb: Database.Database | null = null

export function setupTestDb(): Database.Database {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  testDb.exec(SCHEMA_SQL)
  return testDb
}

export function teardownTestDb(): void {
  if (testDb) {
    testDb.close()
    testDb = null
  }
}

export function getTestDb(): Database.Database {
  if (!testDb) throw new Error('Test DB not initialized')
  return testDb
}

// Wrapper functions matching db.ts exports but using test DB
export function testDbAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getTestDb().prepare(sql).all(...params) as T[]
}

export function testDbGet<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getTestDb().prepare(sql).get(...params) as T | undefined
}

export function testDbRun(sql: string, params: unknown[] = []): Database.RunResult {
  return getTestDb().prepare(sql).run(...params)
}
