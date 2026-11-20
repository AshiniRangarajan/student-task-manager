# CampusCare — Smart Campus Complaint Management

A responsive complaint management app built with React, Flask, and MongoDB. It uses free local technologies and no paid APIs.

## Project layout

- `frontend/` — React frontend built with Vite
- `backend/app.py` — Flask REST API and MongoDB collection setup
- `requirements.txt` — Python dependencies
- `.env.example` — local MongoDB and Flask configuration template

## 1. Install MongoDB

1. Install **MongoDB Community Server** for Windows. During setup, select **Install MongoD as a Service** so it starts automatically.
2. Install **MongoDB Compass** if you want a graphical view of the records.
3. Confirm the MongoDB Windows service is running. If needed, open an Administrator Command Prompt and run:

   ```cmd
   net start MongoDB
   ```

The default local connection is `mongodb://127.0.0.1:27017`. In Compass, use this same connection string and click **Connect**. The app creates the `campuscare` database, `complaints` and `users` collections, and indexes automatically when Flask starts. Submitted records and student accounts then appear in Compass.

## 2. Configure the application

Open PowerShell or Command Prompt in the project folder:

```cmd
cd /d "C:\student complaint"
copy .env.example .env
```

If `.env` already exists, keep it and edit it instead of copying over it. The defaults work with a local MongoDB service. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before starting Flask to create the first authorized admin account. Use a valid email and a password of at least 12 characters. Admin accounts are not created through public registration. The configured admin is created only if that email is not already registered; restart Flask after setting these values. Keep `.env` private; it is excluded from version control.

Set `FLASK_SECRET_KEY` to a long random value to keep login sessions valid across server restarts. If it is blank, the app generates an in-memory key, so all users will need to sign in again after Flask restarts. Leave `SESSION_COOKIE_SECURE=false` for local HTTP development; use `true` only when serving the app over HTTPS.

## 3. Install and run

Install Python 3.10+ and Node.js 20.19+ (or 22.12+). Use two terminals. The commands below use Command Prompt (CMD) syntax.

**Window 1 — backend:**

```cmd
cd /d "C:\student complaint"
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
python backend\app.py
```

**Window 2 — frontend:**

```cmd
cd /d "C:\student complaint\frontend"
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Keep MongoDB and both terminal windows running while using the app. Press **Ctrl+C** in each application terminal to stop it.

For a single Flask-hosted production build, run `npm run build` in the `frontend` folder, then start the backend and open **http://127.0.0.1:5000**.

### PowerShell commands

PowerShell does not support CMD's `cd /d`. Use `Set-Location` instead. In a backend terminal:

```powershell
Set-Location "C:\student complaint"
& ".\.venv\Scripts\python.exe" ".\backend\app.py"
```

In a second terminal:

```powershell
Set-Location "C:\student complaint\frontend"
npm run dev
```

## Features

- Public landing page with separate Student Login and Admin Login pages
- Student registration with name, department, email, and a securely hashed password
- Session-based login, logout, CSRF protection, and role-protected APIs
- Students can submit complaints, search by ID, and see only their own complaints
- Admin complaint table with category/status filters and protected status updates
- Dashboard counts for total, pending, in progress, and resolved complaints
- Complaint IDs, server-side validation, and MongoDB storage

## Login and access

- Students create their own account from **Student Login → Create a student account**.
- Admins sign in with the email/password configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`. Never expose these settings in frontend code or commit `.env`.
- Student complaint ownership and admin-only status updates are enforced by Flask, not just by hiding frontend pages. A student attempting to access admin APIs receives an authorization error.

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/me` | Read the current session and receive its CSRF token |
| `POST` | `/api/auth/student/register` | Register a student and start their session |
| `POST` | `/api/auth/student/login` | Sign in as a student |
| `POST` | `/api/auth/admin/login` | Sign in as an authorized admin |
| `POST` | `/api/auth/logout` | End the current session |
| `POST` | `/api/complaints` | Validate and submit a complaint |
| `GET` | `/api/complaints` | List own student complaints or all complaints for admins |
| `GET` | `/api/complaints/<id>` | Search a complaint visible to the signed-in user |
| `PATCH` | `/api/complaints/<id>` | Admin-only status update |
| `GET` | `/api/stats` | Admin-only dashboard counts |

## Important

This project is suitable as a local/demo application. Before public deployment, use HTTPS, set a strong persistent `FLASK_SECRET_KEY`, configure MongoDB authentication and network access, and consider adding login rate limits and account recovery.
