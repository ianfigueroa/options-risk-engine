export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const defaultApiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

function apiUrl(apiBase: string, path: string) {
  const normalizedBase = apiBase.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

async function parseError(response: Response) {
  const body = await response.json().catch(() => ({ detail: response.statusText }))
  return typeof body.detail === 'string' ? body.detail : 'request failed'
}

export function createApiClient(apiBase: string, fetcher: Fetcher = fetch) {
  return {
    async getJson<T>(path: string): Promise<T> {
      const response = await fetcher(apiUrl(apiBase, path))
      if (!response.ok) {
        throw new Error(await parseError(response))
      }
      return (await response.json()) as T
    },

    async postJson<T>(path: string, payload: unknown): Promise<T> {
      const response = await fetcher(apiUrl(apiBase, path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        throw new Error(await parseError(response))
      }
      return (await response.json()) as T
    },
  }
}

export const apiClient = createApiClient(defaultApiBase)
