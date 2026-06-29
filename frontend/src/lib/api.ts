function uuidv4(): string {
  // Compatible UUID v4 generator for WebView2 environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const PROXY_BASE = 'http://127.0.0.1:9080'

// Stable profile ID for the lifetime of this app session
const PROFILE_ID = uuidv4()

async function request(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Freerouting-Profile-ID': PROFILE_ID,
      'Freerouting-Environment-Host': 'FreeRoutingDesktop/0.1.0',
    },
  }
  if (body) {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${PROXY_BASE}${path}`, opts)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${method} ${path}: ${res.status} ${body}`)
  }
  return res.json()
}

export async function createSession(): Promise<{ id: string }> {
  return request('POST', '/v1/sessions/create')
}

export async function createJob(sessionId: string): Promise<{ id: string }> {
  return request('POST', '/v1/jobs/enqueue', {
    session_id: sessionId,
    name: 'My Design',
  })
}

export async function uploadDsn(jobId: string, filename: string, content: string): Promise<void> {
  const base64 = btoa(unescape(encodeURIComponent(content)))
  await request('POST', `/v1/jobs/${jobId}/input`, { filename, data: base64 })
}

export async function startRouting(jobId: string): Promise<void> {
  await request('PUT', `/v1/jobs/${jobId}/start`)
}

export async function getJobStatus(jobId: string) {
  return request('GET', `/v1/jobs/${jobId}`)
}

export async function getJobOutput(jobId: string) {
  return request('GET', `/v1/jobs/${jobId}/output`)
}

export async function cancelRouting(jobId: string): Promise<void> {
  await request('PUT', `/v1/jobs/${jobId}/cancel`)
}

export function streamLogs(jobId: string, onLog: (log: { timestamp: string; type: string; message: string; topic: string }) => void) {
  streamSSE(`${PROXY_BASE}/v1/jobs/${jobId}/logs/stream`, (data) => {
    try {
      onLog(JSON.parse(data))
    } catch { /* ignore parse errors */ }
  })
}

export function streamOutput(jobId: string, onOutput: (data: string) => void) {
  streamSSE(`${PROXY_BASE}/v1/jobs/${jobId}/output/stream`, (data) => {
    try {
      const parsed = JSON.parse(data)
      if (parsed.data) onOutput(parsed.data)
    } catch { /* ignore parse errors */ }
  })
}

async function streamSSE(url: string, onData: (data: string) => void) {
  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
        'Freerouting-Profile-ID': PROFILE_ID,
        'Freerouting-Environment-Host': 'FreeRoutingDesktop/0.1.0',
      },
    })
    if (!res.ok || !res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          onData(line.slice(6))
        }
      }
    }
  } catch { /* stream closed */ }
}
