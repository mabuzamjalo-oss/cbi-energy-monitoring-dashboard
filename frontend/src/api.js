const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function postJSON(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

export const api = {
  households: () => getJSON('/households'),
  readings: (household, limit = 200) =>
    getJSON(`/readings?household=${household}&limit=${limit}`),
  latest: () => getJSON('/readings/latest'),
  simulateNow: () => postJSON('/simulate'),
  backfill: (hours = 24) => postJSON('/simulate/backfill', { hours }),
}
