import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from './apiClient'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('api client', () => {
  it('sends JSON POST requests to the configured API base URL', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ price: 12.5 }))
    const client = createApiClient('http://api.test', fetcher)

    await expect(client.postJson<{ price: number }>('/price', { option: 'payload' })).resolves.toEqual({ price: 12.5 })
    expect(fetcher).toHaveBeenCalledWith('http://api.test/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option: 'payload' }),
    })
  })

  it('sends GET requests and returns parsed JSON', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ status: 'ok' }))
    const client = createApiClient('http://api.test/', fetcher)

    await expect(client.getJson<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' })
    expect(fetcher).toHaveBeenCalledWith('http://api.test/health')
  })

  it('uses API detail messages for failed responses', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: 'bad input' }, { status: 400 }))
    const client = createApiClient('http://api.test', fetcher)

    await expect(client.getJson('/price')).rejects.toThrow('bad input')
  })

  it('falls back to generic errors and handles relative paths without leading slash', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: ['bad input'] }, { status: 500, statusText: 'Boom' }))
    const client = createApiClient('http://api.test', fetcher)

    await expect(client.postJson('price', {})).rejects.toThrow('request failed')
    expect(fetcher).toHaveBeenCalledWith('http://api.test/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  })
})
