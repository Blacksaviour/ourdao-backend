import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/api/server.js'
import { closeDb, resetDb } from './db.js'

// Issue #262: GET /api/documents returns consistent ETags for empty result
// sets, enabling proper HTTP 304 Not Modified caching.

describe('GET /api/documents ETag on empty results (issue #262)', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb()
    app = await buildServer()
    await app.ready()
  })
  afterAll(closeDb)

  it('returns consistent ETag header for empty document queries', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/documents' })
    expect(res1.statusCode).toBe(200)
    expect(res1.json()).toEqual([])
    
    const etag1 = res1.headers.etag
    expect(etag1).toBeDefined()

    const res2 = await app.inject({ method: 'GET', url: '/api/documents' })
    expect(res2.statusCode).toBe(200)
    expect(res2.json()).toEqual([])
    
    const etag2 = res2.headers.etag
    expect(etag2).toBeDefined()
    
    // ETags should match for identical empty responses
    expect(etag1).toBe(etag2)
  })

  it('returns 304 Not Modified when If-None-Match matches current ETag', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/documents' })
    expect(res1.statusCode).toBe(200)
    const etag = res1.headers.etag
    expect(etag).toBeDefined()

    const res2 = await app.inject({
      method: 'GET',
      url: '/api/documents',
      headers: { 'if-none-match': etag as string },
    })
    expect(res2.statusCode).toBe(304)
    expect(res2.body).toBe('')
  })

  it('returns consistent ETag for empty loan document queries', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/documents?kind=loan' })
    expect(res1.statusCode).toBe(200)
    expect(res1.json()).toEqual([])
    
    const etag1 = res1.headers.etag
    
    const res2 = await app.inject({ method: 'GET', url: '/api/documents?kind=loan' })
    expect(res2.statusCode).toBe(200)
    expect(res2.json()).toEqual([])
    
    const etag2 = res2.headers.etag
    
    expect(etag1).toBe(etag2)
  })

  it('returns consistent ETag for empty treasury document queries', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/documents?kind=treasury' })
    expect(res1.statusCode).toBe(200)
    expect(res1.json()).toEqual([])
    
    const etag1 = res1.headers.etag
    
    const res2 = await app.inject({ method: 'GET', url: '/api/documents?kind=treasury' })
    expect(res2.statusCode).toBe(200)
    
    const etag2 = res2.headers.etag
    
    expect(etag1).toBe(etag2)
  })

  it('sets appropriate Cache-Control header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/documents' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBeDefined()
    expect(res.headers['cache-control']).toMatch(/public/)
  })
})
