
import { useEffect, useState } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import "./App.css";

const API_URL = "http://127.0.0.1:5000";

function App() {
  const [readings, setReadings] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [activeCard, setActiveCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // =====================================================
  // LOAD ALL DASHBOARD DATA
  // =====================================================

  async function loadDashboardData() {
    try {
      setError("");

      const [
        readingsResponse,
        analyticsResponse,
        historyResponse,
        recommendationsResponse,
      ] = await Promise.all([
        fetch(`${API_URL}/api/readings/latest`),
        fetch(`${API_URL}/api/analytics/community`),
        fetch(`${API_URL}/api/readings?limit=1000`),
        fetch(`${API_URL}/api/recommendations`),
      ]);

      if (
        !readingsResponse.ok ||
        !analyticsResponse.ok ||
        !historyResponse.ok ||
        !recommendationsResponse.ok
      ) {
        throw new Error(
          "Unable to retrieve dashboard data. Check that Flask is running."
        );
      }

      const readingsData = await readingsResponse.json();
      const analyticsData = await analyticsResponse.json();
      const historyData = await historyResponse.json();
      const recommendationsData =
        await recommendationsResponse.json();

      setReadings(readingsData);
      setAnalytics(analyticsData);
      setRecommendations(recommendationsData);

      // =================================================
      // PREPARE HISTORICAL DATA
      // =================================================

      // The Flask backend stores timestamps in UTC.
      // Add Z so JavaScript interprets them correctly.

      const latestTimestamp = Math.max(
        ...historyData.map((reading) =>
          new Date(`${reading.timestamp}Z`).getTime()
        )
      );

      const startTimestamp =
        latestTimestamp - 24 * 60 * 60 * 1000;

      // Keep only readings from the latest 24 hours.

      const recentReadings = historyData.filter((reading) => {
        const timestamp = new Date(
          `${reading.timestamp}Z`
        ).getTime();

        return (
          timestamp >= startTimestamp &&
          timestamp <= latestTimestamp
        );
      });

      const chartMap = {};

      recentReadings.forEach((reading) => {
        const date = new Date(`${reading.timestamp}Z`);

        // Group readings into hourly intervals.
        const hourKey = new Date(date);
        hourKey.setMinutes(0, 0, 0);

        const key = hourKey.toISOString();

        if (!chartMap[key]) {
          chartMap[key] = {
            timestamp: key,
            time: hourKey.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          };
        }

        chartMap[key][`household${reading.household}`] =
          reading.power_w;
      });

      const formattedHistory = Object.values(chartMap).sort(
        (a, b) =>
          new Date(a.timestamp) - new Date(b.timestamp)
      );

      setHistoricalData(formattedHistory);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // REFRESH BUTTON
  // =====================================================

  async function refreshEnergyData() {
    if (refreshing) return;

    setRefreshing(true);
    setError("");

    try {
      // Generate new simulated readings.
      const response = await fetch(
        `${API_URL}/api/simulate`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to generate new energy readings."
        );
      }

      // Reload all dashboard information.
      await loadDashboardData();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  // =====================================================
  // AUTOMATIC REFRESH
  // =====================================================

  useEffect(() => {
    loadDashboardData();

    const interval = setInterval(() => {
      loadDashboardData();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // =====================================================
  // HOUSEHOLD COMPARISON
  // =====================================================

  function getComparison(household) {
    return analytics?.comparisons?.find(
      (item) => item.household === household
    );
  }

  // =====================================================
  // RECOMMENDATION STYLING
  // =====================================================

  function getRecommendationClass(priority) {
    switch (priority) {
      case "High":
        return "recommendation-high";

      case "Medium":
        return "recommendation-medium";

      case "Low":
        return "recommendation-low";

      default:
        return "recommendation-normal";
    }
  }

  // =====================================================
  // USER INTERFACE
  // =====================================================

  return (
    <div className="dashboard">

      {/* HEADER */}

      <header className="header">
        <div>
          <p className="subtitle">
            CBi Astute Energy Research Prototype
          </p>

          <h1>Community Energy Dashboard</h1>
        </div>

        <div className="status">
          ● System Online
        </div>
      </header>

      <main>

        {/* DASHBOARD CONTROLS */}

        <div className="dashboard-controls">
          <div>
            <h2>Energy Monitoring Overview</h2>

            <p className="section-description">
              Monitor electricity demand and compare
              participating households.
            </p>

            {lastUpdated && (
              <p className="last-updated">
                Last updated:{" "}
                {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>

          <button
            className="refresh-button"
            onClick={refreshEnergyData}
            disabled={refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "↻ Refresh Energy Data"}
          </button>
        </div>

        {loading && (
          <p>Loading energy data...</p>
        )}

        {error && (
          <p className="error">{error}</p>
        )}

        {!loading && analytics && (
          <>

            {/* =========================================
                COMMUNITY OVERVIEW
            ========================================= */}

            <section>
              <h2>Community Overview</h2>

              <p className="section-description">
                Latest simulated electricity demand
                across participating households.
              </p>

              <div className="summary-grid">

                <div className="summary-card">
                  <span>Participating Households</span>

                  <strong>
                    {analytics.household_count}
                  </strong>
                </div>

                <div className="summary-card">
                  <span>Total Community Power</span>

                  <strong>
                    {analytics.total_power_w.toFixed(1)}
                    <small> W</small>
                  </strong>
                </div>

                <div className="summary-card">
                  <span>Community Average</span>

                  <strong>
                    {analytics.community_average_w.toFixed(1)}
                    <small> W</small>
                  </strong>
                </div>

                <div className="summary-card">
                  <span>Highest Consumer</span>

                  <strong>
                    Household{" "}
                    {
                      analytics
                        .highest_consuming_household
                        .household
                    }
                  </strong>

                  <p>
                    {
                      analytics
                        .highest_consuming_household
                        .power_w
                    }{" "}
                    W
                  </p>
                </div>

              </div>
            </section>

            {/* =========================================
                HOUSEHOLD MONITORING
            ========================================= */}

            <section className="household-section">
              <h2>Live Household Monitoring</h2>

              <p className="section-description">
                Latest simulated readings compared
                against the community average.
              </p>

              <div className="cards">

                {readings.map((reading) => {
                  const comparison = getComparison(
                    reading.household
                  );

                  return (
                    <div
                      className="energy-card"
                      key={reading.household}
                    >

                      <div className="card-heading">
                        <h3>
                          Household {reading.household}
                        </h3>

                        <span>Simulated</span>
                      </div>

                      <div className="energy-value">
                        {reading.power_w.toFixed(1)}
                        <small> W</small>
                      </div>

                      <p>Latest power demand</p>

                      {comparison && (
                        <div
                          className={
                            comparison.percentage_difference > 0
                              ? "comparison above"
                              : "comparison below"
                          }
                        >
                          <strong>
                            {comparison.percentage_difference > 0
                              ? "↑ "
                              : "↓ "}

                            {Math.abs(
                              comparison.percentage_difference
                            ).toFixed(1)}
                            %
                          </strong>

                          <span>
                            {comparison.status}
                          </span>
                        </div>
                      )}

                      <div className="card-footer">
                        <span>Energy</span>

                        <strong>
                          {reading.energy_kwh.toFixed(3)}
                          {" "}kWh
                        </strong>
                      </div>

                    </div>
                  );
                })}

              </div>
            </section>

            {/* =========================================
                HISTORICAL GRAPH
            ========================================= */}

            <section className="chart-section">

              <div className="chart-header">
                <div>
                  <h2>24-Hour Energy Consumption</h2>

                  <p className="section-description">
                    Historical power demand across
                    participating households.
                  </p>
                </div>

                <span className="chart-badge">
                  Last 24 Hours
                </span>
              </div>

              <div className="chart-card">

                {historicalData.length > 0 ? (

                  <ResponsiveContainer
                    width="100%"
                    height={380}
                  >
                    <LineChart
                      data={historicalData}
                      margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 10,
                      }}
                    >

                      <CartesianGrid
                        strokeDasharray="3 3"
                      />

                      <XAxis
                        dataKey="time"
                        interval="preserveStartEnd"
                      />

                      <YAxis
                        label={{
                          value: "Power (W)",
                          angle: -90,
                          position: "insideLeft",
                        }}
                      />

                      <Tooltip
                        formatter={(value, name) => [
                          `${Number(value).toFixed(1)} W`,
                          name,
                        ]}
                      />

                      <Legend />

                      <Line
                        type="monotone"
                        dataKey="householdA"
                        name="Household A"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />

                      <Line
                        type="monotone"
                        dataKey="householdB"
                        name="Household B"
                        stroke="#16a34a"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />

                      <Line
                        type="monotone"
                        dataKey="householdC"
                        name="Household C"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />

                    </LineChart>
                  </ResponsiveContainer>

                ) : (
                  <p>No historical data available.</p>
                )}

              </div>
            </section>

            
{/* =========================================
    PERSONALISED RECOMMENDATION FLASHCARDS
========================================= */}

<section className="recommendations-section">

  <h2>Personalised Energy Recommendations</h2>

  <p className="section-description">
    Explore personalised recommendations for each household.
    Click the card to reveal its energy-saving advice.
  </p>

  {recommendations.length > 0 && (
    <>
      <div className="flashcard-container">

        <div
          className={`flashcard ${isFlipped ? "flipped" : ""}`}
          onClick={() => setIsFlipped(!isFlipped)}
          role="button"
          tabIndex={0}
          aria-label={`Household ${recommendations[activeCard].household} recommendation. Press to flip.`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsFlipped(!isFlipped);
            }
          }}
        >

          <div className="flashcard-inner">

            {/* FRONT OF CARD */}

            <div className="flashcard-front">

              <span className="flashcard-label">
                HOUSEHOLD ENERGY PROFILE
              </span>

              <h3>
                Household {recommendations[activeCard].household}
              </h3>

              <span className="flashcard-priority">
                {recommendations[activeCard].priority} Priority
              </span>

              <h4>
                {recommendations[activeCard].level}
              </h4>

              <div className="flashcard-stat">
                <span>Current Demand</span>

                <strong>
                  {recommendations[activeCard].power_w.toFixed(1)} W
                </strong>
              </div>

              <div className="flashcard-stat">
                <span>Community Average</span>

                <strong>
                  {recommendations[activeCard].community_average_w.toFixed(1)} W
                </strong>
              </div>

              <div className="flashcard-stat">
                <span>Difference</span>

                <strong>
                  {recommendations[activeCard].percentage_difference > 0
                    ? "+"
                    : ""}

                  {recommendations[activeCard].percentage_difference.toFixed(1)}%
                </strong>
              </div>

              <p className="flip-hint">
                ↻ Click to reveal recommendation
              </p>

            </div>

            {/* BACK OF CARD */}

            <div className="flashcard-back">

              <span className="flashcard-label">
                PERSONALISED ENERGY ADVICE
              </span>

              <h3>
                Household {recommendations[activeCard].household}
              </h3>

              <div className="flashcard-advice">
                <div className="advice-icon">⚡</div>

                <h4>Energy-Saving Recommendation</h4>

                <p>
                  {recommendations[activeCard].recommendation}
                </p>
              </div>

              <p className="flip-hint">
                ↻ Click to view energy statistics
              </p>

            </div>

          </div>

        </div>

      </div>

      {/* FLASHCARD NAVIGATION */}

      <div className="flashcard-navigation">

        <button
          className="flashcard-nav-button"
          onClick={() => {
            setIsFlipped(false);

            setActiveCard((previous) =>
              (previous - 1 + recommendations.length) %
              recommendations.length
            );
          }}
        >
          ← Previous
        </button>

        <span className="flashcard-counter">
          Household {recommendations[activeCard].household}
          {" • "}
          {activeCard + 1} of {recommendations.length}
        </span>

        <button
          className="flashcard-nav-button"
          onClick={() => {
            setIsFlipped(false);

            setActiveCard((previous) =>
              (previous + 1) % recommendations.length
            );
          }}
        >
          Next →
        </button>

      </div>

      <p className="recommendation-disclaimer">
        Recommendations are generated from simulated
        electricity readings and predefined rules.
        They do not represent verified energy savings.
      </p>
    </>
  )}

</section>

            {/* =========================================
                COMMUNITY INSIGHT
            ========================================= */}

            <section className="insight-section">

              <h2>Community Insight</h2>

              <div className="insight-card">

                <div className="insight-icon">
                  ⚡
                </div>

                <div>
                  <strong>
                    Household{" "}
                    {
                      analytics
                        .highest_consuming_household
                        .household
                    }{" "}
                    currently has the highest recorded
                    power demand.
                  </strong>

                  <p>
                    Its latest demand is{" "}
                    {
                      analytics
                        .highest_consuming_household
                        .power_w
                    }{" "}
                    W compared with the community
                    average of{" "}
                    {analytics.community_average_w.toFixed(1)}
                    {" "}W.
                  </p>
                </div>

              </div>

            </section>

          </>
        )}

      </main>
    </div>
  );
}

export default App;