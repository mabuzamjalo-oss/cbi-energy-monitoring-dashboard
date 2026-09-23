from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Household(db.Model):
    __tablename__ = "households"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)  # e.g. "A", "B", "C"
    label = db.Column(db.String(120), nullable=True)  # e.g. "Household A"

    readings = db.relationship(
        "Reading", backref="household", lazy=True, cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {"id": self.id, "name": self.name, "label": self.label or f"Household {self.name}"}


class Reading(db.Model):
    __tablename__ = "readings"

    id = db.Column(db.Integer, primary_key=True)
    household_id = db.Column(db.Integer, db.ForeignKey("households.id"), nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    energy_kwh = db.Column(db.Float, nullable=False)   # energy used in the interval
    power_w = db.Column(db.Float, nullable=False)      # instantaneous power draw
    source = db.Column(db.String(20), nullable=False, default="simulated")  # "simulated" | "cbi_astute"

    def to_dict(self):
        return {
            "id": self.id,
            "household": self.household.name,
            "timestamp": self.timestamp.isoformat(),
            "energy_kwh": round(self.energy_kwh, 3),
            "power_w": round(self.power_w, 1),
            "source": self.source,
        }
