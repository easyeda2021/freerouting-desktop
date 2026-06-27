const PROXY_BASE = 'http://127.0.0.1:9080'

async function request(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Freerouting-Profile-ID': crypto.randomUUID(),
      'Freerouting-Environment-Host': 'FreeRoutingDesktop/0.1.0',
    },
  }
  if (body) {
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${PROXY_BASE}${path}`, opts)
  if (!res.ok) {
    throw new Error(`API ${method} ${path}: ${res.status}`)
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
    state: 'QUEUED',
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
  const es = new EventSource(`${PROXY_BASE}/v1/jobs/${jobId}/logs/stream`)
  es.onmessage = (event) => {
    try {
      onLog(JSON.parse(event.data))
    } catch { /* ignore parse errors */ }
  }
  es.onerror = () => es.close()
  return es
}

export function streamOutput(jobId: string, onOutput: (data: string) => void) {
  const es = new EventSource(`${PROXY_BASE}/v1/jobs/${jobId}/output/stream`)
  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data)
      if (parsed.data) {
        onOutput(parsed.data)
      }
    } catch { /* ignore parse errors */ }
  }
  es.onerror = () => es.close()
  return es
}
