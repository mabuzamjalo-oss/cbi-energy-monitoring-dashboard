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
  // =====================================================
  // STATE
  // =====================================================

  // Latest reading from each household.
  const [readings, setReadings] = useState([]);

  // Latest community comparison information.
  const [analytics, setAnalytics] = useState(null);

  // Processed history displayed on the graph.
  const [historicalData, setHistoricalData] = useState([]);

  // Complete historical dataset received from Flask.
  const [rawHistoricalData, setRawHistoricalData] = useState([]);

  // Selected historical period.
  // Possible values: 24h, 7d and 30d.
  const [historyPeriod, setHistoryPeriod] = useState("24h");
  const [selectedHousehold, setSelectedHousehold] = useState("all");

  // Household recommendations.
  const [recommendations, setRecommendations] = useState([]);

  // Recommendation flashcard controls.
  const [activeCard, setActiveCard] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Dashboard status.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  // =====================================================
  // LOAD DASHBOARD DATA
  // =====================================================

  async function loadDashboardData() {
    try {
      setError("");

      // Request all dashboard information from Flask.
      const [
        readingsResponse,
        analyticsResponse,
        historyResponse,
        recommendationsResponse,
      ] = await Promise.all([
        fetch(`${API_URL}/api/readings/latest`),
        fetch(`${API_URL}/api/analytics/community`),
        fetch(`${API_URL}/api/readings?limit=5000`),
        fetch(`${API_URL}/api/recommendations`),
      ]);

      // Check that every request was successful.
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

      // Convert responses from JSON.
      const readingsData =
        await readingsResponse.json();

      const analyticsData =
        await analyticsResponse.json();

      const historyData =
        await historyResponse.json();

      const recommendationsData =
        await recommendationsResponse.json();

      // Store data in React state.
      setReadings(readingsData);
      setAnalytics(analyticsData);
      setRecommendations(recommendationsData);

      // Keep ALL historical readings.
      // We filter these later depending on whether
      // the user selects 24 hours, 7 days or 30 days.
      setRawHistoricalData(historyData);

      setLastUpdated(new Date());
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // =====================================================
  // PREPARE HISTORICAL DATA
  // =====================================================

  function prepareHistoricalData(data, period) {
    if (!data || data.length === 0) {
      return [];
    }

    // Convert all timestamps to JavaScript time values.
    //
    // Flask stores UTC timestamps without the Z suffix.
    // Adding Z tells JavaScript to interpret them as UTC.
    const timestamps = data
      .map((reading) =>
        new Date(`${reading.timestamp}Z`).getTime()
      )
      .filter(
        (timestamp) =>
          !Number.isNaN(timestamp)
      );

    if (timestamps.length === 0) {
      return [];
    }

    // Find the newest reading.
    const latestTimestamp =
      Math.max(...timestamps);

    // Decide how much history should be shown.
    let hoursToDisplay = 24;

    if (period === "7d") {
      hoursToDisplay = 24 * 7;
    } else if (period === "30d") {
      hoursToDisplay = 24 * 30;
    }

    const startTimestamp =
      latestTimestamp -
      hoursToDisplay * 60 * 60 * 1000;

    // Keep readings inside the selected period.
    const filteredReadings =
      data.filter((reading) => {
        const timestamp =
          new Date(
            `${reading.timestamp}Z`
          ).getTime();

        return (
          timestamp >= startTimestamp &&
          timestamp <= latestTimestamp
        );
      });

    // chartMap groups readings into intervals.
    const chartMap = {};

    filteredReadings.forEach((reading) => {
      const date =
        new Date(`${reading.timestamp}Z`);

      let groupDate;
      let label;

      // -------------------------------------------------
      // 24 HOURS
      // Group readings by hour.
      // -------------------------------------------------

      if (period === "24h") {
        groupDate = new Date(date);

        groupDate.setMinutes(
          0,
          0,
          0
        );

        label =
          groupDate.toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit",
            }
          );
      }

      // -------------------------------------------------
      // 7 DAYS AND 30 DAYS
      // Group readings by day.
      // -------------------------------------------------

      else {
        groupDate = new Date(date);

        groupDate.setHours(
          0,
          0,
          0,
          0
        );

        label =
          groupDate.toLocaleDateString(
            [],
            {
              day: "2-digit",
              month: "short",
            }
          );
      }

      const key =
        groupDate.toISOString();

      // Create the interval when it does not exist.
      if (!chartMap[key]) {
        chartMap[key] = {
          timestamp: key,
          time: label,

          householdAValues: [],
          householdBValues: [],
          householdCValues: [],
        };
      }

      // Example:
      //
      // A -> householdAValues
      // B -> householdBValues
      // C -> householdCValues

      const valueKey =
        `household${reading.household}Values`;

      if (chartMap[key][valueKey]) {
        chartMap[key][valueKey].push(
          Number(reading.power_w)
        );
      }
    });

    // Helper function for calculating averages.
    function average(values) {
      if (
        !values ||
        values.length === 0
      ) {
        return null;
      }

      const total =
        values.reduce(
          (sum, value) =>
            sum + value,
          0
        );

      return total / values.length;
    }

    // Convert grouped data into a format
    // that Recharts can display.
    return Object.values(chartMap)
      .map((item) => ({
        timestamp:
          item.timestamp,

        time:
          item.time,

        householdA:
          average(
            item.householdAValues
          ),

        householdB:
          average(
            item.householdBValues
          ),

        householdC:
          average(
            item.householdCValues
          ),
      }))
      .sort(
        (a, b) =>
          new Date(a.timestamp) -
          new Date(b.timestamp)
      );
  }

  // =====================================================
  // UPDATE GRAPH WHEN PERIOD CHANGES
  // =====================================================

  useEffect(() => {
    const preparedHistory =
      prepareHistoricalData(
        rawHistoricalData,
        historyPeriod
      );

    setHistoricalData(
      preparedHistory
    );
  }, [
    rawHistoricalData,
    historyPeriod,
  ]);

  // =====================================================
  // REFRESH ENERGY DATA
  // =====================================================

  async function refreshEnergyData() {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    setError("");

    try {
      // Ask Flask to generate one new simulated
      // reading for each household.
      const response =
        await fetch(
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

      // Reload dashboard after creating readings.
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
    // Load immediately.
    loadDashboardData();

    // Then reload every 10 seconds.
    const interval =
      setInterval(() => {
        loadDashboardData();
      }, 10000);

    // Stop interval if component is removed.
    return () =>
      clearInterval(interval);
  }, []);

  // =====================================================
  // FIND HOUSEHOLD COMPARISON
  // =====================================================

  function getComparison(household) {
    return (
      analytics?.comparisons?.find(
        (item) =>
          item.household === household
      )
    );
  }

  // =====================================================
  // HISTORICAL PERIOD LABEL
  // =====================================================

  function getHistoryPeriodLabel() {
    if (historyPeriod === "7d") {
      return "Last 7 Days";
    }

    if (historyPeriod === "30d") {
      return "Last 30 Days";
    }

    return "Last 24 Hours";
  }

  // =====================================================
  // HISTORICAL ANALYTICS
  // =====================================================

  function calculateHistoricalAnalytics() {
    if (
      !historicalData ||
      historicalData.length === 0
    ) {
      return null;
    }

    const allHouseholds = [
      {
        name: "A",
        key: "householdA",
      },
      {
        name: "B",
        key: "householdB",
      },
      {
        name: "C",
        key: "householdC",
      },
    ];

    const households =
      selectedHousehold === "all"
        ? allHouseholds
        : allHouseholds.filter(
          (household) =>
            household.name === selectedHousehold
        );

    // Contains all valid values from
    // the selected historical period.
    const allValues = [];

    // Calculate an average for each household.
    const householdAverages =
      households.map(
        (household) => {
          const values =
            historicalData
              .map(
                (item) =>
                  item[
                  household.key
                  ]
              )
              .filter(
                (value) =>
                  value !== null &&
                  value !==
                  undefined &&
                  !Number.isNaN(
                    Number(value)
                  )
              )
              .map(Number);

          // Store values so community-level
          // calculations can also be performed.
          allValues.push(
            ...values.map(
              (value) => ({
                household:
                  household.name,

                value,
              })
            )
          );

          let householdAverage = 0;

          if (values.length > 0) {
            householdAverage =
              values.reduce(
                (sum, value) =>
                  sum + value,
                0
              ) /
              values.length;
          }

          return {
            household:
              household.name,

            average:
              householdAverage,
          };
        }
      );

    if (allValues.length === 0) {
      return null;
    }

    // -------------------------------------------------
    // COMMUNITY PERIOD AVERAGE
    // -------------------------------------------------

    const periodAverage =
      allValues.reduce(
        (sum, item) =>
          sum + item.value,
        0
      ) /
      allValues.length;

    // -------------------------------------------------
    // HIGHEST DISPLAYED DEMAND POINT
    // -------------------------------------------------

    const peak =
      allValues.reduce(
        (highest, current) =>
          current.value >
            highest.value
            ? current
            : highest
      );

    // -------------------------------------------------
    // HOUSEHOLD WITH HIGHEST AVERAGE
    // -------------------------------------------------

    const highestAverageHousehold =
      householdAverages.reduce(
        (highest, current) =>
          current.average >
            highest.average
            ? current
            : highest
      );

    return {
      periodAverage,

      peakDemand:
        peak.value,

      peakHousehold:
        peak.household,

      highestAverageHousehold:
        highestAverageHousehold.household,

      highestAverage:
        highestAverageHousehold.average,
    };
  }

  const historicalAnalytics =
    calculateHistoricalAnalytics();

  // =====================================================
  // USER INTERFACE
  // =====================================================

  return (
    <div className="dashboard">

      {/* ===============================================
          HEADER
      =============================================== */}

      <header className="header">

        <div>
          <p className="subtitle">
            CBi Astute Energy Research Prototype
          </p>

          <h1>
            Community Energy Dashboard
          </h1>
        </div>

        <div className="status">
          ● System Online
        </div>

      </header>

      <main>

        {/* =============================================
            DASHBOARD CONTROLS
        ============================================= */}

        <div className="dashboard-controls">

          <div>

            <h2>
              Energy Monitoring Overview
            </h2>

            <p className="section-description">
              Monitor electricity demand and compare
              participating households.
            </p>

            {lastUpdated && (
              <p className="last-updated">
                Last updated:{" "}
                {
                  lastUpdated
                    .toLocaleTimeString()
                }
              </p>
            )}

          </div>

          <button
            className="refresh-button"
            onClick={
              refreshEnergyData
            }
            disabled={refreshing}
          >
            {refreshing
              ? "Refreshing..."
              : "↻ Refresh Energy Data"}
          </button>

        </div>

        {/* =============================================
            LOADING / ERROR
        ============================================= */}

        {loading && (
          <p>
            Loading energy data...
          </p>
        )}

        {error && (
          <p className="error">
            {error}
          </p>
        )}

        {!loading && analytics && (
          <>

            {/* =========================================
                COMMUNITY OVERVIEW
            ========================================= */}

            <section>

              <h2>
                Community Overview
              </h2>

              <p className="section-description">
                Latest simulated electricity demand
                across participating households.
              </p>

              <div className="summary-grid">

                <div className="summary-card">

                  <span>
                    Participating Households
                  </span>

                  <strong>
                    {
                      analytics
                        .household_count
                    }
                  </strong>

                </div>

                <div className="summary-card">

                  <span>
                    Total Community Power
                  </span>

                  <strong>
                    {
                      analytics
                        .total_power_w
                        .toFixed(1)
                    }

                    <small> W</small>
                  </strong>

                </div>

                <div className="summary-card">

                  <span>
                    Community Average
                  </span>

                  <strong>
                    {
                      analytics
                        .community_average_w
                        .toFixed(1)
                    }

                    <small> W</small>
                  </strong>

                </div>

                <div className="summary-card">

                  <span>
                    Highest Consumer
                  </span>

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
                LIVE HOUSEHOLD MONITORING
            ========================================= */}

            <section className="household-section">

              <h2>
                Live Household Monitoring
              </h2>

              <p className="section-description">
                Latest simulated readings compared
                against the community average.
              </p>

              <div className="cards">

                {readings.map(
                  (reading) => {
                    const comparison =
                      getComparison(
                        reading.household
                      );

                    return (
                      <div
                        className="energy-card"
                        key={
                          reading.household
                        }
                      >

                        <div className="card-heading">

                          <h3>
                            Household{" "}
                            {
                              reading
                                .household
                            }
                          </h3>

                          <span>
                            Simulated
                          </span>

                        </div>

                        <div className="energy-value">

                          {
                            reading
                              .power_w
                              .toFixed(1)
                          }

                          <small>
                            {" "}W
                          </small>

                        </div>

                        <p>
                          Latest power demand
                        </p>

                        {comparison && (
                          <div
                            className={
                              comparison
                                .percentage_difference >
                                0
                                ? "comparison above"
                                : "comparison below"
                            }
                          >

                            <strong>

                              {
                                comparison
                                  .percentage_difference >
                                  0
                                  ? "↑ "
                                  : "↓ "
                              }

                              {
                                Math.abs(
                                  comparison
                                    .percentage_difference
                                ).toFixed(
                                  1
                                )
                              }
                              %

                            </strong>

                            <span>
                              {
                                comparison
                                  .status
                              }
                            </span>

                          </div>
                        )}

                        <div className="card-footer">

                          <span>
                            Energy
                          </span>

                          <strong>
                            {
                              reading
                                .energy_kwh
                                .toFixed(3)
                            }
                            {" "}kWh
                          </strong>

                        </div>

                      </div>
                    );
                  }
                )}

              </div>

            </section>

            {/* =========================================
                HISTORICAL ENERGY ANALYSIS
            ========================================= */}

            <section className="chart-section">

              <div className="chart-header">

                <div>

                  <h2>
                    Historical Energy Analysis
                  </h2>

                  <p className="section-description">
                    Compare simulated household power
                    demand across different historical
                    periods.
                  </p>

                </div>

                {/* PERIOD BUTTONS */}

                <div className="history-controls">

                  <button
                    className={
                      historyPeriod ===
                        "24h"
                        ? "history-button active"
                        : "history-button"
                    }
                    onClick={() =>
                      setHistoryPeriod(
                        "24h"
                      )
                    }
                  >
                    24 Hours
                  </button>

                  <button
                    className={
                      historyPeriod ===
                        "7d"
                        ? "history-button active"
                        : "history-button"
                    }
                    onClick={() =>
                      setHistoryPeriod(
                        "7d"
                      )
                    }
                  >
                    7 Days
                  </button>

                  <button
                    className={
                      historyPeriod ===
                        "30d"
                        ? "history-button active"
                        : "history-button"
                    }
                    onClick={() =>
                      setHistoryPeriod(
                        "30d"
                      )
                    }
                  >
                    30 Days
                  </button>

                </div>

              </div>
              {/* HOUSEHOLD FILTER */}

              <div className="household-filter">

                <span className="household-filter-label">
                  Household:
                </span>

                <button
                  className={
                    selectedHousehold === "all"
                      ? "household-filter-button active"
                      : "household-filter-button"
                  }
                  onClick={() => setSelectedHousehold("all")}
                >
                  All
                </button>

                <button
                  className={
                    selectedHousehold === "A"
                      ? "household-filter-button active"
                      : "household-filter-button"
                  }
                  onClick={() => setSelectedHousehold("A")}
                >
                  Household A
                </button>

                <button
                  className={
                    selectedHousehold === "B"
                      ? "household-filter-button active"
                      : "household-filter-button"
                  }
                  onClick={() => setSelectedHousehold("B")}
                >
                  Household B
                </button>

                <button
                  className={
                    selectedHousehold === "C"
                      ? "household-filter-button active"
                      : "household-filter-button"
                  }
                  onClick={() => setSelectedHousehold("C")}
                >
                  Household C
                </button>

              </div>

              <p className="history-period-label">
                Showing:{" "}
                {
                  getHistoryPeriodLabel()
                }
              </p>

              {/* =======================================
                  HISTORICAL ANALYTICS CARDS
              ======================================= */}

              {historicalAnalytics && (
                <div className="historical-summary-grid">

                  <div className="historical-summary-card">

                    <span>
                      Period Average Demand
                    </span>

                    <strong>
                      {
                        historicalAnalytics
                          .periodAverage
                          .toFixed(1)
                      }

                      <small> W</small>
                    </strong>

                    <p>
                      {selectedHousehold === "all"
                        ? "Average across all households"
                        : `Average for Household ${selectedHousehold}`}
                    </p>

                  </div>

                  <div className="historical-summary-card">

                    <span>
                      Peak Demand
                    </span>

                    <strong>
                      {
                        historicalAnalytics
                          .peakDemand
                          .toFixed(1)
                      }

                      <small> W</small>
                    </strong>

                    <p>
                      Household{" "}
                      {
                        historicalAnalytics
                          .peakHousehold
                      }
                    </p>

                  </div>

                  <div className="historical-summary-card">

                    <span>
                      {selectedHousehold === "all"
                        ? "Highest Average Demand"
                        : "Household Average Demand"}
                    </span>
                    <strong>
                      Household{" "}
                      {
                        historicalAnalytics
                          .highestAverageHousehold
                      }
                    </strong>

                    <p>
                      {
                        historicalAnalytics
                          .highestAverage
                          .toFixed(1)
                      }{" "}
                      W
                    </p>

                  </div>

                  <div className="historical-summary-card">

                    <span>
                      Analysis Period
                    </span>

                    <strong>
                      {
                        getHistoryPeriodLabel()
                      }
                    </strong>

                    <p>
                      Simulated historical data
                    </p>

                  </div>

                </div>
              )}

              {/* =======================================
                  HISTORICAL GRAPH
              ======================================= */}

              <div className="chart-card">

                {historicalData.length >
                  0 ? (

                  <ResponsiveContainer
                    width="100%"
                    height={380}
                  >

                    <LineChart
                      data={
                        historicalData
                      }
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
                          value:
                            "Power (W)",
                          angle: -90,
                          position:
                            "insideLeft",
                        }}
                      />

                      <Tooltip
                        formatter={(
                          value,
                          name
                        ) => [
                            value == null
                              ? "No data"
                              : `${Number(
                                value
                              ).toFixed(
                                1
                              )} W`,
                            name,
                          ]}
                      />

                      <Legend />

                      {/* HOUSEHOLD A */}

                      {(selectedHousehold === "all" ||
                        selectedHousehold === "A") && (
                          <Line
                            type="monotone"
                            dataKey="householdA"
                            name="Household A"
                            stroke="#2563eb"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        )}

                      {/* HOUSEHOLD B */}

                      {(selectedHousehold === "all" ||
                        selectedHousehold === "B") && (
                          <Line
                            type="monotone"
                            dataKey="householdB"
                            name="Household B"
                            stroke="#16a34a"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        )}

                      {/* HOUSEHOLD C */}

                      {(selectedHousehold === "all" ||
                        selectedHousehold === "C") && (
                          <Line
                            type="monotone"
                            dataKey="householdC"
                            name="Household C"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                          />
                        )}

                    </LineChart>

                  </ResponsiveContainer>

                ) : (

                  <p>
                    No historical data available.
                  </p>

                )}

              </div>

              <p className="recommendation-disclaimer">
                Historical values are generated from
                simulated household electricity readings
                for prototype development and testing.
              </p>

            </section>

            {/* =========================================
                RECOMMENDATION FLASHCARDS
            ========================================= */}

            <section className="recommendations-section">

              <h2>
                Personalised Energy Recommendations
              </h2>

              <p className="section-description">
                Explore personalised recommendations
                for each household. Click the card to
                reveal its energy-saving advice.
              </p>

              {recommendations.length >
                0 && (
                  <>

                    <div className="flashcard-container">

                      <div
                        className={
                          `flashcard ${isFlipped
                            ? "flipped"
                            : ""
                          }`
                        }
                        onClick={() =>
                          setIsFlipped(
                            !isFlipped
                          )
                        }
                        role="button"
                        tabIndex={0}
                        aria-label={
                          `Household ${recommendations[
                            activeCard
                          ].household
                          } recommendation. Press to flip.`
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                            "Enter" ||
                            event.key ===
                            " "
                          ) {
                            event.preventDefault();

                            setIsFlipped(
                              !isFlipped
                            );
                          }
                        }}
                      >

                        <div className="flashcard-inner">

                          {/* FRONT */}

                          <div className="flashcard-front">

                            <span className="flashcard-label">
                              HOUSEHOLD ENERGY PROFILE
                            </span>

                            <h3>
                              Household{" "}
                              {
                                recommendations[
                                  activeCard
                                ].household
                              }
                            </h3>

                            <span className="flashcard-priority">
                              {
                                recommendations[
                                  activeCard
                                ].priority
                              }{" "}
                              Priority
                            </span>

                            <h4>
                              {
                                recommendations[
                                  activeCard
                                ].level
                              }
                            </h4>

                            <div className="flashcard-stat">

                              <span>
                                Current Demand
                              </span>

                              <strong>
                                {
                                  recommendations[
                                    activeCard
                                  ].power_w.toFixed(
                                    1
                                  )
                                }{" "}
                                W
                              </strong>

                            </div>

                            <div className="flashcard-stat">

                              <span>
                                Community Average
                              </span>

                              <strong>
                                {
                                  recommendations[
                                    activeCard
                                  ].community_average_w
                                    .toFixed(
                                      1
                                    )
                                }{" "}
                                W
                              </strong>

                            </div>

                            <div className="flashcard-stat">

                              <span>
                                Difference
                              </span>

                              <strong>

                                {
                                  recommendations[
                                    activeCard
                                  ].percentage_difference >
                                    0
                                    ? "+"
                                    : ""
                                }

                                {
                                  recommendations[
                                    activeCard
                                  ].percentage_difference
                                    .toFixed(
                                      1
                                    )
                                }
                                %

                              </strong>

                            </div>

                            <p className="flip-hint">
                              ↻ Click to reveal recommendation
                            </p>

                          </div>

                          {/* BACK */}

                          <div className="flashcard-back">

                            <span className="flashcard-label">
                              PERSONALISED ENERGY ADVICE
                            </span>

                            <h3>
                              Household{" "}
                              {
                                recommendations[
                                  activeCard
                                ].household
                              }
                            </h3>

                            <div className="flashcard-advice">

                              <div className="advice-icon">
                                ⚡
                              </div>

                              <h4>
                                Energy-Saving Recommendation
                              </h4>

                              <p>
                                {
                                  recommendations[
                                    activeCard
                                  ].recommendation
                                }
                              </p>

                            </div>

                            <p className="flip-hint">
                              ↻ Click to view energy statistics
                            </p>

                          </div>

                        </div>

                      </div>

                    </div>

                    {/* NAVIGATION */}

                    <div className="flashcard-navigation">

                      <button
                        className="flashcard-nav-button"
                        onClick={() => {
                          setIsFlipped(
                            false
                          );

                          setActiveCard(
                            (
                              previous
                            ) =>
                              (
                                previous -
                                1 +
                                recommendations.length
                              ) %
                              recommendations.length
                          );
                        }}
                      >
                        ← Previous
                      </button>

                      <span className="flashcard-counter">

                        Household{" "}
                        {
                          recommendations[
                            activeCard
                          ].household
                        }

                        {" • "}

                        {activeCard + 1}
                        {" "}of{" "}
                        {
                          recommendations.length
                        }

                      </span>

                      <button
                        className="flashcard-nav-button"
                        onClick={() => {
                          setIsFlipped(
                            false
                          );

                          setActiveCard(
                            (
                              previous
                            ) =>
                              (
                                previous +
                                1
                              ) %
                              recommendations.length
                          );
                        }}
                      >
                        Next →
                      </button>

                    </div>

                    <p className="recommendation-disclaimer">
                      Recommendations are generated from
                      simulated electricity readings and
                      predefined rules. They do not
                      represent verified energy savings.
                    </p>

                  </>
                )}

            </section>

            {/* =========================================
                COMMUNITY INSIGHT
            ========================================= */}

            <section className="insight-section">

              <h2>
                Community Insight
              </h2>

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
                    currently has the highest
                    recorded power demand.
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
                    {
                      analytics
                        .community_average_w
                        .toFixed(1)
                    }{" "}
                    W.
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