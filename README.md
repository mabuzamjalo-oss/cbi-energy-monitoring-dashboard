# CBi Astute — Community Energy Monitor (Stage A prototype)

Stage A of your proposal: a working software prototype fed by **simulated,
CBi Astute-shaped energy data**, so you have something concrete to show your
supervisor while Stage B (real device/API access) is investigated separately.

Milestone 1 is done: a simulated household reading flows into Flask →
gets saved to the database → gets displayed on the React dashboard.

## Architecture

```
Simulated Households (A, B, C)
        │  generate_reading()
        ▼
Flask REST API  ──────────────►  PostgreSQL (or SQLite for local dev)
        ▲
        │  fetch()
React Dashboard (Recharts)
```

## Backend (Flask)

```bash
cd backend
pip install -r requirements.txt --break-system-packages   # or use a venv
python3 app.py
```

Runs on **http://127.0.0.1:5000**. On first run it auto-creates the tables
and seeds Households A, B, C.

By default it uses a local SQLite file (`cbi_energy_dev.db`) so you can run
it right away with zero setup. To switch to real PostgreSQL:

1. `createdb cbi_energy` (or create it via pgAdmin)
2. `cp .env.example .env` and fill in your Postgres credentials
3. Restart `python3 app.py` — no code changes needed, `psycopg2-binary` is
   already in requirements.txt

### Key endpoints

| Method | Path                     | What it does |
|--------|--------------------------|---------------|
| GET    | `/api/health`            | sanity check |
| GET    | `/api/households`        | list A, B, C |
| POST   | `/api/simulate`          | generate + save one reading per household, "now" |
| POST   | `/api/simulate/backfill` | generate a full day of hourly history (body: `{"hours": 24}`) |
| GET    | `/api/readings?household=A&limit=200` | time series for one household |
| GET    | `/api/readings/latest`   | most recent reading per household |

Try it manually before touching the frontend:
```bash
curl -X POST http://127.0.0.1:5000/api/simulate/backfill -d '{"hours":24}' -H "Content-Type: application/json"
curl http://127.0.0.1:5000/api/readings/latest
```

## Frontend (React + Vite + Recharts)

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` straight through to
Flask on port 5000 (see `vite.config.js`), so no CORS headache.

- **Community Overview** — total + per-household latest reading cards
- **Per-household charts** — energy (kWh) over time, one line chart each
- **"Backfill 24h" button** — generates a day of realistic hourly history so
  the charts aren't empty
- **"Simulate reading now" button** — stands in for a live device push;
  dashboard also auto-polls every 10s

## How the simulated data is "realistic"

`backend/simulate.py` uses a daily load-curve model (low overnight, morning
peak ~7-9am, evening peak ~18-21h) with per-household baselines and random
noise — not a flat/random number generator. This is what makes it plausible
as a stand-in for real smart-meter output, and it's what your proposal's
"simulated or real CBi Astute data" language covers.

## Next milestones (not built yet — say the word and we'll do these next)

1. **Comparative analytics** — average/peak usage per household, ranking
2. **Recommendation engine** — flag households with unusually high usage,
   suggest load-shifting windows based on the curve
3. Swap in real CBi Astute data once you've confirmed API/export access
   (Stage B) — the `source` field on each reading already distinguishes
   `"simulated"` vs `"cbi_astute"` so nothing else has to change structurally
