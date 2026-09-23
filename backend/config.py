import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """
    Central configuration.

    DATABASE_URL should point at your PostgreSQL instance, e.g.:
        postgresql://postgres:yourpassword@localhost:5432/cbi_energy

    If DATABASE_URL is not set, we fall back to a local SQLite file so you
    can run and test the prototype immediately without installing/configuring
    PostgreSQL first. Swap in Postgres once you're ready — no code changes
    needed elsewhere, just set DATABASE_URL.
    """

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///cbi_energy_dev.db"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
