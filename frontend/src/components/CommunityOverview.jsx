const COLORS = { A: '#2563eb', B: '#16a34a', C: '#dc2626' }

export default function CommunityOverview({ latest }) {
  const total = latest.reduce((sum, r) => sum + r.energy_kwh, 0)

  return (
    <section className="overview">
      <div className="summary-card total-card">
        <span className="label">Community total (latest interval)</span>
        <span className="value">{total.toFixed(2)} kWh</span>
      </div>
      {latest.map((r) => (
        <div className="summary-card" key={r.household}>
          <span className="label" style={{ color: COLORS[r.household] }}>
            Household {r.household}
          </span>
          <span className="value">{r.energy_kwh.toFixed(2)} kWh</span>
          <span className="sub">{r.power_w.toFixed(0)} W</span>
        </div>
      ))}
    </section>
  )
}

export { COLORS }
