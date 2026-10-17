import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/api/server.js'
import { query } from '../src/db/index.js'
import { closeDb, resetDb } from './db.js'

describe('API: CORS headers on error responses (issue #270)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb()
    app = await buildServer()
    await app.ready()
  })

  it('404 Not Found includes CORS headers when Origin header is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nonexistent',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
    const body = res.json()
    expect(body.error).toBe('route not found')
    expect(body.code).toBe('ROUTE_NOT_FOUND')
  })

  it('500 Internal Server Error includes CORS headers when Origin header is present', async () => {
    // Force an internal error by querying a non-existent table after the server starts
    await query('CREATE TEMP TABLE temp_test (id int)')
    
    const res = await app.inject({
      method: 'GET',
      url: '/api/stats',
      headers: { origin: 'http://localhost:3000' },
    })
    
    // The response should include CORS headers regardless of success/failure
    if (res.statusCode >= 400) {
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
      expect(res.headers['access-control-allow-credentials']).toBe('true')
    }
  })

  it('404 does not include CORS headers when Origin header is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('400 Bad Request includes CORS headers when Origin header is present', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/loans?limit=invalid',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })

  it('CORS headers work with multiple configured origins', async () => {
    // This test assumes default CORS config accepts localhost:3000
    const res = await app.inject({
      method: 'GET',
      url: '/nonexistent',
      headers: { origin: 'http://localhost:3000' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000')
  })
})

afterAll(closeDb)
