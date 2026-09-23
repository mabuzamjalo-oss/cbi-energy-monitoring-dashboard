import { useEffect, useState, useCallback } from 'react'
import { api } from '../api'
import CommunityOverview, { COLORS } from './CommunityOverview'
import HouseholdChart from './HouseholdChart'

const HOUSEHOLDS = ['A', 'B', 'C']
const POLL_MS = 10000

export default function Dashboard() {
  const [latest, setLatest] = useState([])
  const [readingsByHousehold, setReadingsByHousehold] = useState({})
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadAll = useCallback(async () => {
    try {
      const [latestData, ...perHousehold] = await Promise.all([
        api.latest(),
        ...HOUSEHOLDS.map((h) => api.readings(h, 100)),
      ])
      setLatest(latestData)
      const map = {}
      HOUSEHOLDS.forEach((h, i) => (map[h] = perHousehold[i]))
      setReadingsByHousehold(map)
      setStatus('ready')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadAll()
    const interval = setInterval(loadAll, POLL_MS)
    return () => clearInterval(interval)
  }, [loadAll])

  const handleBackfill = async () => {
    setBusy(true)
    try {
      await api.backfill(24)
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  const handleSimulateNow = async () => {
    setBusy(true)
    try {
      await api.simulateNow()
      await loadAll()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <p className="status">Loading community data…</p>
  if (status === 'error')
    return (
      <p className="status error">
        Couldn't reach the backend at /api — is Flask running on port 5000?
        <br />
        {error}
      </p>
    )

  const hasData = latest.length > 0

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Community Energy Monitor</h1>
          <p className="subtitle">
            Simulated CBi Astute-compatible readings · Households A, B, C
          </p>
        </div>
        <div className="actions">
          <button onClick={handleBackfill} disabled={busy}>
            {busy ? 'Working…' : 'Backfill 24h'}
          </button>
          <button onClick={handleSimulateNow} disabled={busy}>
            {busy ? 'Working…' : 'Simulate reading now'}
          </button>
        </div>
      </header>

      {!hasData ? (
        <p className="status">
          No readings yet — click <strong>Backfill 24h</strong> to generate a
          day of simulated data, or <strong>Simulate reading now</strong> for
          a single live-style reading.
        </p>
      ) : (
        <>
          <CommunityOverview latest={latest} />
          <section className="charts">
            {HOUSEHOLDS.map((h) => (
              <HouseholdChart
                key={h}
                name={h}
                readings={readingsByHousehold[h] || []}
                color={COLORS[h]}
              />
            ))}
          </section>
        </>
      )}
    </div>
  )
}
