"""Flask API and MongoDB storage for the CampusCare complaint app."""

from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, current_app, g, jsonify, request, send_from_directory, session
from pymongo import DESCENDING, MongoClient
from pymongo.errors import CollectionInvalid, DuplicateKeyError, PyMongoError
from werkzeug.exceptions import BadRequest
from werkzeug.security import check_password_hash, generate_password_hash


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
COLLECTION_NAME = "complaints"
USERS_COLLECTION_NAME = "users"
CATEGORIES = (
    "Wi-Fi",
    "Classroom projectors",
    "Drinking water",
    "Laboratory equipment",
    "Washrooms",
    "Hostel maintenance",
)
DEPARTMENTS = (
    "Arts & Humanities",
    "Business",
    "Computer Science",
    "Engineering",
    "Life Sciences",
    "Physical Sciences",
    "Other",
)
STATUSES = ("Pending", "In Progress", "Resolved")

load_dotenv(PROJECT_ROOT / ".env")


def _complaints_collection():
    return current_app.extensions["campuscare_complaints"]


def _users_collection():
    return current_app.extensions["campuscare_users"]


def _serialize_user(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(document["_id"]),
        "email": document["email"],
        "name": document["name"],
        "department": document.get("department", ""),
        "role": document["role"],
    }


def _serialize_complaint(document: dict[str, Any]) -> dict[str, Any]:
    created_at = document["created_at"]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    created_at = created_at.astimezone(timezone.utc).isoformat(timespec="seconds")
    return {
        "id": document["id"],
        "name": document["name"],
        "department": document["department"],
        "category": document["category"],
        "description": document["description"],
        "status": document["status"],
        "created_at": created_at.replace("+00:00", "Z"),
    }


def _current_user():
    user_id = session.get("user_id")
    if not isinstance(user_id, str) or not ObjectId.is_valid(user_id):
        return None
    return _users_collection().find_one({"_id": ObjectId(user_id)})


def _role_required(role: str | None):
    def decorate(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = _current_user()
            if user is None:
                return jsonify(error="Please log in to continue."), 401
            if role is not None and user.get("role") != role:
                return jsonify(error="You are not authorized to access this resource."), 403
            g.campuscare_user = user
            return view(*args, **kwargs)

        return wrapped

    return decorate


def _csrf_protected(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        expected = session.get("csrf_token")
        supplied = request.headers.get("X-CSRF-Token", "")
        if (
            not isinstance(expected, str)
            or not supplied
            or not secrets.compare_digest(expected, supplied)
        ):
            return jsonify(error="Your session expired. Refresh the page and try again."), 403
        return view(*args, **kwargs)

    return wrapped


def _bootstrap_admin(users_collection) -> None:
    email = os.environ.get("ADMIN_EMAIL", "").strip().casefold()
    password = os.environ.get("ADMIN_PASSWORD", "")
    if bool(email) != bool(password):
        raise RuntimeError("Set both ADMIN_EMAIL and ADMIN_PASSWORD to create the admin account.")
    if not email:
        return
    if (
        len(email) > 254
        or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)
        or len(password) < 12
        or len(password) > 128
    ):
        raise RuntimeError(
            "Admin configuration requires a valid email and a password of 12 to 128 characters."
        )

    existing = users_collection.find_one({"email": email})
    if existing is not None:
        if existing.get("role") != "admin":
            raise RuntimeError("ADMIN_EMAIL belongs to a student account; choose a different email.")
        return

    users_collection.insert_one(
        {
            "email": email,
            "password_hash": generate_password_hash(password),
            "name": os.environ.get("ADMIN_NAME", "Campus Administrator").strip()
            or "Campus Administrator",
            "department": "",
            "role": "admin",
            "created_at": datetime.now(timezone.utc),
        }
    )


def create_app(
    mongo_uri: str | None = None,
    database_name: str | None = None,
    mongo_client: MongoClient | None = None,
) -> Flask:
    """Create the Flask application and initialize the MongoDB collection."""
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "").lower() == "true",
        SESSION_REFRESH_EACH_REQUEST=False,
    )
    uri = mongo_uri or os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017")
    db_name = database_name or os.environ.get("MONGODB_DATABASE", "campuscare")
    owns_client = mongo_client is None
    client = (
        mongo_client
        if mongo_client is not None
        else MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    )

    try:
        client.admin.command("ping")
        database = client[db_name]
        for collection_name in (COLLECTION_NAME, USERS_COLLECTION_NAME):
            try:
                database.create_collection(collection_name)
            except CollectionInvalid:
                pass
        collection = database[COLLECTION_NAME]
        collection.create_index("id", unique=True, name="uniq_complaint_id")
        collection.create_index(
            [("created_at", DESCENDING), ("id", DESCENDING)],
            name="idx_complaint_created_at",
        )
        users_collection = database[USERS_COLLECTION_NAME]
        users_collection.create_index("email", unique=True, name="uniq_user_email")
        users_collection.create_index("role", name="idx_user_role")
        _bootstrap_admin(users_collection)
    except PyMongoError as error:
        if owns_client:
            client.close()
        raise RuntimeError(
            "Unable to connect to MongoDB. Start the MongoDB service and verify MONGODB_URI."
        ) from error

    app.extensions["campuscare_mongo_client"] = client
    app.extensions["campuscare_complaints"] = collection
    app.extensions["campuscare_users"] = users_collection

    @app.errorhandler(PyMongoError)
    def handle_database_error(error: PyMongoError):
        app.logger.exception("MongoDB operation failed: %s", error)
        return jsonify(
            error="MongoDB could not complete the request. Check the MongoDB service and server log."
        ), 503

    @app.errorhandler(BadRequest)
    def handle_bad_request(_error: BadRequest):
        return jsonify(error="Request body must contain valid JSON."), 400

    @app.get("/")
    def index():
        if not (FRONTEND_DIST / "index.html").is_file():
            return jsonify(
                error="React frontend is not built. Run 'npm run build' in the frontend folder."
            ), 503
        return send_from_directory(FRONTEND_DIST, "index.html")

    @app.get("/assets/<path:filename>")
    def frontend_asset(filename: str):
        return send_from_directory(FRONTEND_DIST / "assets", filename)

    @app.get("/api/auth/me")
    def auth_me():
        csrf_token = session.get("csrf_token")
        if not isinstance(csrf_token, str):
            csrf_token = secrets.token_urlsafe(32)
            session["csrf_token"] = csrf_token
        user = _current_user()
        if user is None:
            session.pop("user_id", None)
        return jsonify(
            user=_serialize_user(user) if user is not None else None,
            csrf_token=csrf_token,
        )

    def login(role: str):
        if not request.is_json:
            return jsonify(error="Content-Type must be application/json."), 415
        payload = request.get_json()
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400
        email = payload.get("email")
        password = payload.get("password")
        if (
            not isinstance(email, str)
            or not isinstance(password, str)
            or len(email) > 254
            or len(password) > 128
        ):
            return jsonify(error="Email or password is incorrect."), 401

        user = users_collection.find_one({"email": email.strip().casefold()})
        if (
            user is None
            or user.get("role") != role
            or not check_password_hash(user["password_hash"], password)
        ):
            return jsonify(error="Email or password is incorrect."), 401

        session.clear()
        session["user_id"] = str(user["_id"])
        csrf_token = secrets.token_urlsafe(32)
        session["csrf_token"] = csrf_token
        return jsonify(user=_serialize_user(user), csrf_token=csrf_token)

    @app.post("/api/auth/student/register")
    @_csrf_protected
    def register_student():
        if not request.is_json:
            return jsonify(error="Content-Type must be application/json."), 415
        payload = request.get_json()
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400

        name = payload.get("name")
        department = payload.get("department")
        email = payload.get("email")
        password = payload.get("password")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
            return jsonify(error="Name is required and must be at most 80 characters."), 400
        if not isinstance(department, str) or department not in DEPARTMENTS:
            return jsonify(error="Choose a valid department."), 400
        if not isinstance(email, str):
            return jsonify(error="Enter a valid email address."), 400
        email = email.strip().casefold()
        if len(email) > 254 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
            return jsonify(error="Enter a valid email address."), 400
        if not isinstance(password, str) or not 8 <= len(password) <= 128:
            return jsonify(error="Password must be between 8 and 128 characters."), 400

        user = {
            "email": email,
            "password_hash": generate_password_hash(password),
            "name": name.strip(),
            "department": department,
            "role": "student",
            "created_at": datetime.now(timezone.utc),
        }
        try:
            users_collection.insert_one(user)
        except DuplicateKeyError:
            return jsonify(error="An account with this email already exists."), 409

        session.clear()
        session["user_id"] = str(user["_id"])
        csrf_token = secrets.token_urlsafe(32)
        session["csrf_token"] = csrf_token
        return jsonify(user=_serialize_user(user), csrf_token=csrf_token), 201

    @app.post("/api/auth/student/login")
    @_csrf_protected
    def login_student():
        return login("student")

    @app.post("/api/auth/admin/login")
    @_csrf_protected
    def login_admin():
        return login("admin")

    @app.post("/api/auth/logout")
    @_csrf_protected
    def logout():
        session.clear()
        csrf_token = secrets.token_urlsafe(32)
        session["csrf_token"] = csrf_token
        return jsonify(user=None, csrf_token=csrf_token)

    @app.get("/api/complaints")
    @_role_required(None)
    def list_complaints():
        category = request.args.get("category", "").strip()
        status = request.args.get("status", "").strip()
        if category and category not in CATEGORIES:
            return jsonify(error="Unknown complaint category."), 400
        if status and status not in STATUSES:
            return jsonify(error="Unknown complaint status."), 400

        user = g.campuscare_user
        query: dict[str, Any] = {}
        if user.get("role") == "student":
            query["student_id"] = str(user["_id"])
        if category:
            query["category"] = category
        if status:
            query["status"] = status
        documents = _complaints_collection().find(query, {"_id": False}).sort(
            [("created_at", DESCENDING), ("id", DESCENDING)]
        )
        return jsonify(complaints=[_serialize_complaint(document) for document in documents])

    @app.get("/api/complaints/<complaint_id>")
    @_role_required(None)
    def get_complaint(complaint_id: str):
        user = g.campuscare_user
        query = {"id": complaint_id.upper()}
        if user.get("role") == "student":
            query["student_id"] = str(user["_id"])
        document = _complaints_collection().find_one(
            query,
            {"_id": False},
        )
        if document is None:
            return jsonify(error="Complaint not found."), 404
        return jsonify(complaint=_serialize_complaint(document))

    @app.post("/api/complaints")
    @_role_required("student")
    @_csrf_protected
    def create_complaint():
        if not request.is_json:
            return jsonify(error="Content-Type must be application/json."), 415
        payload = request.get_json()
        if not isinstance(payload, dict):
            return jsonify(error="Request body must be a JSON object."), 400

        fields: dict[str, str] = {}
        for field in ("category", "description"):
            value = payload.get(field)
            if not isinstance(value, str):
                return jsonify(error=f"{field.capitalize()} must be a string."), 400
            fields[field] = value.strip()

        if fields["category"] not in CATEGORIES:
            return jsonify(error="Choose a valid complaint category."), 400
        if not 10 <= len(fields["description"]) <= 1000:
            return jsonify(error="Description must be between 10 and 1,000 characters."), 400

        collection = _complaints_collection()
        for _attempt in range(5):
            complaint = {
                "id": f"CMP-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(5).upper()}",
                "student_id": str(g.campuscare_user["_id"]),
                "name": g.campuscare_user["name"],
                "department": g.campuscare_user["department"],
                **fields,
                "status": "Pending",
                "created_at": datetime.now(timezone.utc),
            }
            try:
                collection.insert_one(complaint)
                return jsonify(complaint=_serialize_complaint(complaint)), 201
            except DuplicateKeyError:
                continue
        return jsonify(error="Could not generate a unique complaint ID. Please try again."), 503

    @app.patch("/api/complaints/<complaint_id>")
    @_role_required("admin")
    @_csrf_protected
    def update_complaint(complaint_id: str):
        if not request.is_json:
            return jsonify(error="Content-Type must be application/json."), 415
        payload = request.get_json()
        if not isinstance(payload, dict) or set(payload) != {"status"}:
            return jsonify(error="Provide only a status field."), 400
        status = payload.get("status")
        if not isinstance(status, str) or status not in STATUSES:
            return jsonify(error="Choose a valid complaint status."), 400

        collection = _complaints_collection()
        result = collection.update_one(
            {"id": complaint_id.upper()},
            {"$set": {"status": status}},
        )
        if result.matched_count == 0:
            return jsonify(error="Complaint not found."), 404
        document = collection.find_one({"id": complaint_id.upper()}, {"_id": False})
        return jsonify(complaint=_serialize_complaint(document))

    @app.get("/api/stats")
    @_role_required("admin")
    def complaint_stats():
        collection = _complaints_collection()
        return jsonify(
            total=collection.count_documents({}),
            pending=collection.count_documents({"status": "Pending"}),
            in_progress=collection.count_documents({"status": "In Progress"}),
            resolved=collection.count_documents({"status": "Resolved"}),
        )

    @app.errorhandler(404)
    def handle_not_found(_error):
        if request.path.startswith("/api/"):
            return jsonify(error="API endpoint not found."), 404
        return "Page not found.", 404

    @app.get("/<path:frontend_path>")
    def frontend_route(frontend_path: str):
        if frontend_path == "api" or frontend_path.startswith("api/"):
            return jsonify(error="API endpoint not found."), 404
        if not (FRONTEND_DIST / "index.html").is_file():
            return jsonify(
                error="React frontend is not built. Run 'npm run build' in the frontend folder."
            ), 503
        return send_from_directory(FRONTEND_DIST, "index.html")

    return app


if __name__ == "__main__":
    application = create_app()
    application.run(
        host=os.environ.get("FLASK_HOST", "127.0.0.1"),
        port=int(os.environ.get("FLASK_PORT", "5000")),
        debug=os.environ.get("FLASK_DEBUG", "").lower() == "true",
    )
