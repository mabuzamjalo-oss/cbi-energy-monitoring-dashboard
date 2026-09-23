from datetime import datetime, timedelta

from flask import Flask, jsonify, request
from flask_cors import CORS

from config import Config
from models import db, Household, Reading
from simulate import generate_reading, HOUSEHOLD_PROFILES


# ============================================================
# APPLICATION SETUP
# ============================================================

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    CORS(app)

    with app.app_context():
        db.create_all()
        _seed_households()

    register_routes(app)

    return app


# ============================================================
# DATABASE SEEDING
# ============================================================

def _seed_households():
    """Make sure Household A, B and C exist."""

    for name in HOUSEHOLD_PROFILES.keys():

        existing_household = Household.query.filter_by(
            name=name
        ).first()

        if not existing_household:

            household = Household(
                name=name,
                label=f"Household {name}"
            )

            db.session.add(household)

    db.session.commit()


# ============================================================
# HELPER FUNCTION
# ============================================================

def get_latest_household_data():
    """
    Get the latest reading for every household.
    """

    households = (
        Household.query
        .order_by(Household.name)
        .all()
    )

    latest_data = []

    for household in households:

        latest = (
            Reading.query
            .filter_by(
                household_id=household.id
            )
            .order_by(
                Reading.timestamp.desc()
            )
            .first()
        )

        if latest:

            latest_data.append({
                "household": household.name,
                "power_w": latest.power_w,
                "energy_kwh": latest.energy_kwh,
                "timestamp": latest.timestamp.isoformat()
            })

    return latest_data


# ============================================================
# API ROUTES
# ============================================================

def register_routes(app):


    # ========================================================
    # HEALTH CHECK
    # ========================================================

    @app.get("/api/health")
    def health():

        return jsonify({
            "status": "ok",
            "time": datetime.utcnow().isoformat()
        })


    # ========================================================
    # HOUSEHOLDS
    # ========================================================

    @app.get("/api/households")
    def list_households():

        households = (
            Household.query
            .order_by(Household.name)
            .all()
        )

        return jsonify([
            household.to_dict()
            for household in households
        ])


    # ========================================================
    # GENERATE CURRENT SIMULATED READINGS
    # ========================================================

    @app.post("/api/simulate")
    def simulate_now():
        """
        Generate one new simulated reading
        for every household.
        """

        households = (
            Household.query
            .order_by(Household.name)
            .all()
        )

        now = datetime.utcnow()

        created = []

        for household in households:

            data = generate_reading(
                household.name,
                now
            )

            reading = Reading(
                household_id=household.id,
                timestamp=data["timestamp"],
                energy_kwh=data["energy_kwh"],
                power_w=data["power_w"],
                source="simulated"
            )

            db.session.add(reading)

            created.append(reading)

        db.session.commit()

        return jsonify([
            reading.to_dict()
            for reading in created
        ]), 201


    # ========================================================
    # GENERATE HISTORICAL DATA
    # ========================================================

    @app.post("/api/simulate/backfill")
    def simulate_backfill():
        """
        Generate historical hourly readings.

        Example:

        {
            "hours": 24
        }
        """

        body = request.get_json(
            silent=True
        ) or {}

        try:

            hours = int(
                body.get("hours", 24)
            )

        except (TypeError, ValueError):

            return jsonify({
                "error": "hours must be an integer"
            }), 400


        if hours < 1 or hours > 720:

            return jsonify({
                "error":
                    "hours must be between 1 and 720"
            }), 400


        households = (
            Household.query
            .order_by(Household.name)
            .all()
        )


        now = datetime.utcnow().replace(
            minute=0,
            second=0,
            microsecond=0
        )


        created = 0


        for i in range(hours, 0, -1):

            timestamp = (
                now - timedelta(hours=i)
            )


            for household in households:

                data = generate_reading(
                    household.name,
                    timestamp
                )


                reading = Reading(
                    household_id=household.id,
                    timestamp=data["timestamp"],
                    energy_kwh=data["energy_kwh"],
                    power_w=data["power_w"],
                    source="simulated"
                )


                db.session.add(reading)

                created += 1


        db.session.commit()


        return jsonify({
            "created": created,
            "hours": hours,
            "households": len(households)
        }), 201


    # ========================================================
    # GET ENERGY READINGS
    # ========================================================

    @app.get("/api/readings")
    def list_readings():

        household_name = request.args.get(
            "household"
        )


        try:

            limit = int(
                request.args.get(
                    "limit",
                    200
                )
            )

        except ValueError:

            return jsonify({
                "error":
                    "limit must be an integer"
            }), 400


        if limit < 1:
            limit = 1

        if limit > 5000:
            limit = 5000


        query = Reading.query.join(
            Household
        )


        if household_name:

            query = query.filter(
                Household.name ==
                household_name
            )


        recent_readings = (
            query
            .order_by(
                Reading.timestamp.desc()
            )
            .limit(limit)
            .all()
        )


        readings = list(
            reversed(recent_readings)
        )


        return jsonify([
            reading.to_dict()
            for reading in readings
        ])


    # ========================================================
    # LATEST READINGS
    # ========================================================

    @app.get("/api/readings/latest")
    def latest_readings():

        latest_data = (
            get_latest_household_data()
        )

        return jsonify(latest_data)


    # ========================================================
    # COMMUNITY COMPARATIVE ANALYTICS
    # ========================================================

    @app.get("/api/analytics/community")
    def community_analytics():

        latest_data = (
            get_latest_household_data()
        )


        if not latest_data:

            return jsonify({
                "message":
                    "No energy readings available"
            }), 404


        # ----------------------------------------------------
        # COMMUNITY TOTAL
        # ----------------------------------------------------

        total_power = sum(
            item["power_w"]
            for item in latest_data
        )


        # ----------------------------------------------------
        # COMMUNITY AVERAGE
        # ----------------------------------------------------

        community_average = (
            total_power /
            len(latest_data)
        )


        # ----------------------------------------------------
        # HIGHEST CONSUMER
        # ----------------------------------------------------

        highest = max(
            latest_data,
            key=lambda item:
                item["power_w"]
        )


        # ----------------------------------------------------
        # LOWEST CONSUMER
        # ----------------------------------------------------

        lowest = min(
            latest_data,
            key=lambda item:
                item["power_w"]
        )


        # ----------------------------------------------------
        # HOUSEHOLD COMPARISONS
        # ----------------------------------------------------

        comparisons = []


        for item in latest_data:

            difference = (
                item["power_w"]
                - community_average
            )


            if community_average > 0:

                percentage_difference = (
                    difference /
                    community_average
                ) * 100

            else:

                percentage_difference = 0


            if difference > 0:

                status = "Above average"

            elif difference < 0:

                status = "Below average"

            else:

                status = "Average"


            comparisons.append({

                "household":
                    item["household"],

                "power_w":
                    round(
                        item["power_w"],
                        2
                    ),

                "energy_kwh":
                    round(
                        item["energy_kwh"],
                        3
                    ),

                "difference_w":
                    round(
                        difference,
                        2
                    ),

                "percentage_difference":
                    round(
                        percentage_difference,
                        2
                    ),

                "status":
                    status,

                "timestamp":
                    item["timestamp"]
            })


        return jsonify({

            "household_count":
                len(latest_data),

            "total_power_w":
                round(
                    total_power,
                    2
                ),

            "community_average_w":
                round(
                    community_average,
                    2
                ),

            "highest_consuming_household": {

                "household":
                    highest["household"],

                "power_w":
                    round(
                        highest["power_w"],
                        2
                    )
            },

            "lowest_consuming_household": {

                "household":
                    lowest["household"],

                "power_w":
                    round(
                        lowest["power_w"],
                        2
                    )
            },

            "comparisons":
                comparisons
        })


    # ========================================================
    # PERSONALISED RECOMMENDATION ENGINE
    # ========================================================

    @app.get("/api/recommendations")
    def recommendations():
        """
        Generate personalised rule-based
        recommendations for each household.
        """

        latest_data = (
            get_latest_household_data()
        )


        if not latest_data:

            return jsonify({
                "message":
                    "No energy readings available"
            }), 404


        # ----------------------------------------------------
        # COMMUNITY AVERAGE
        # ----------------------------------------------------

        total_power = sum(
            item["power_w"]
            for item in latest_data
        )


        community_average = (
            total_power /
            len(latest_data)
        )


        results = []


        # ----------------------------------------------------
        # APPLY RULES TO EACH HOUSEHOLD
        # ----------------------------------------------------

        for item in latest_data:

            power = item["power_w"]


            if community_average > 0:

                percentage_difference = (

                    (
                        power
                        - community_average
                    )

                    / community_average

                ) * 100

            else:

                percentage_difference = 0


            # ================================================
            # RULE 1
            # More than 20% above community average
            # ================================================

            if percentage_difference > 20:

                level = "High Consumption"

                priority = "High"

                recommendation = (
                    "Your current electricity demand is "
                    "significantly above the community "
                    "average. Consider reducing unnecessary "
                    "high-load appliance usage and shifting "
                    "flexible electricity use away from "
                    "peak-demand periods."
                )


            # ================================================
            # RULE 2
            # Between 5% and 20% above average
            # ================================================

            elif percentage_difference > 5:

                level = "Above Average"

                priority = "Medium"

                recommendation = (
                    "Your electricity demand is above the "
                    "community average. Review appliances "
                    "that may be operating unnecessarily "
                    "and monitor electricity consumption "
                    "during high-demand periods."
                )


            # ================================================
            # RULE 3
            # More than 10% below average
            # ================================================

            elif percentage_difference < -10:

                level = "Efficient Consumption"

                priority = "Low"

                recommendation = (
                    "Your current electricity demand is "
                    "below the community average. Continue "
                    "monitoring your usage and maintain "
                    "energy-efficient consumption practices."
                )


            # ================================================
            # RULE 4
            # Close to community average
            # ================================================

            else:

                level = "Normal Consumption"

                priority = "Normal"

                recommendation = (
                    "Your electricity demand is close to "
                    "the community average. Continue "
                    "monitoring your consumption and look "
                    "for opportunities to reduce "
                    "unnecessary electricity use."
                )


            # ------------------------------------------------
            # STORE RESULT
            # ------------------------------------------------

            results.append({

                "household":
                    item["household"],

                "power_w":
                    round(
                        power,
                        2
                    ),

                "community_average_w":
                    round(
                        community_average,
                        2
                    ),

                "percentage_difference":
                    round(
                        percentage_difference,
                        2
                    ),

                "level":
                    level,

                "priority":
                    priority,

                "recommendation":
                    recommendation,

                "timestamp":
                    item["timestamp"]
            })


        return jsonify(results)


# ============================================================
# CREATE APPLICATION
# ============================================================

app = create_app()


# ============================================================
# RUN DEVELOPMENT SERVER
# ============================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        port=5000
    )