import logging
import os

from flask import Flask
from flask_cors import CORS
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from flasgger import Swagger


def create_app(test_config=None):
    """Create and configure an instance of the Flask application."""
    app = Flask(__name__)
    CORS(app)
    log_level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = logging.getLevelName(log_level_name)
    if not isinstance(log_level, int):
        log_level = logging.INFO
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    for handler in root_logger.handlers:
        handler.setLevel(log_level)

    # ===== Load base configuration
    database_url = os.environ.get("DATABASE_URL", "sqlite:///:memory:")
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    secret_key = os.environ.get("SECRET_KEY", "dev")
    app.config.from_mapping(
        SECRET_KEY=secret_key,
        SQLALCHEMY_DATABASE_URI=database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    if test_config is not None:
        app.config.update(test_config)

    # ===== Initialize Database
    from catanatron.web.models import db

    with app.app_context():
        db.init_app(app)
        db.create_all()
        _ensure_board_seed_column(db)

    # ===== Initialize Routes
    from . import api

    app.register_blueprint(api.bp)

    Swagger(
        app,
        template={
            "info": {
                "title": "Catanatron API",
                "description": "Endpoints for running and inspecting Catanatron games.",
                "version": "1.0.0",
            }
        },
        config={
            "headers": [],
            "specs": [
                {
                    "endpoint": "apispec_1",
                    "route": "/apispec_1.json",
                    "rule_filter": lambda rule: True,  # include all routes
                    "model_filter": lambda tag: True,
                }
            ],
            "static_url_path": "/flasgger_static",
            "swagger_ui": True,
            "specs_route": "/apidocs/",
        },
    )

    @app.get("/health")
    def health_check():
        """Health probe.
        ---
        tags:
          - system
        responses:
          200:
            description: Backend is healthy
        """
        return {"status": "ok"}

    @app.get("/")
    def root_redirect():
        """Basic landing page.
        ---
        tags:
          - system
        responses:
          200:
            description: Returns basic API info
        """
        return {"message": "Catanatron backend is running", "docs": "/apidocs/"}

    return app


def _ensure_board_seed_column(db):
    """Ensure pvp_room_state has the board_seed column even on older DBs."""
    engine = db.engine
    try:
        inspector = inspect(engine)
    except SQLAlchemyError as exc:  # pragma: no cover
        logging.warning("Failed inspecting database: %s", exc)
        return
    if "pvp_room_state" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("pvp_room_state")}
    if "board_seed" in columns:
        return
    logging.info("Adding board_seed column to pvp_room_state.")
    try:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE pvp_room_state ADD COLUMN board_seed BIGINT")
            )
    except SQLAlchemyError as exc:  # pragma: no cover
        logging.error("Failed adding board_seed column: %s", exc)
