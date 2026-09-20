# Running AIGH Nursing Workforce on your computer

The system has three parts:

- **web** — React/Vite frontend (the UI)
- **api** — Express + Prisma backend (REST API)
- **db** — PostgreSQL database (the 33-table schema lives in `server/prisma/schema.prisma`)

There are two ways to run it.

---

## Option A — Docker (one command, recommended)

Requires Docker Desktop running.

```bash
docker compose up --build
```

This starts PostgreSQL, pushes the schema, seeds the demo data, starts the API, and serves the web app. When it finishes building:

- Open **http://localhost:5173**
- API is at **http://localhost:3001** (e.g. http://localhost:3001/api/health)

Stop with `Ctrl+C`. Data persists in the `pgdata` volume. To wipe the database and start fresh: `docker compose down -v`.

---

## Option B — Run each part manually (no Docker)

Requires Node.js 20+ and PostgreSQL installed and running.

### 1. Database
Create a database named `nurseapp` (any Postgres user works — adjust the URL below to match yours):

```bash
createdb nurseapp
```

### 2. API (backend)
```bash
cd server
npm install
# point at your database:
#   Windows PowerShell:  $env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nurseapp"
#   macOS/Linux:         export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nurseapp"
npm run setup     # prisma generate + db push + seed
npm run dev       # API on http://localhost:3001
```

### 3. Web (frontend) — in a second terminal
```bash
cd app
npm install
# create app/.env.local with:  VITE_API_URL=http://localhost:3001
npm run dev       # UI on http://localhost:5173
```

Open **http://localhost:5173**.

---

## Running the frontend by itself (no backend, no database)

The UI also runs completely standalone on built-in seed data — handy for a quick look:

```bash
cd app
npm install
npm run dev
```

Leave `VITE_API_URL` **unset** (don't create `.env.local`). The app detects no API and uses its in-memory demo data. Set `VITE_API_URL` to switch it to the real database.

---

## Demo accounts (any password works)

| Email | Role |
|-------|------|
| admin@aigh.sa | System Admin |
| hr.admin@aigh.sa | HR Admin |
| supervisor@aigh.sa | Supervisor |
| employee@aigh.sa | Employee |

## How the pieces connect

- The frontend reads all data from `GET /api/bootstrap` on startup when `VITE_API_URL` is set.
- Creating/editing employees, contracts, credentials and shift assignments writes through to the API, which persists to PostgreSQL via Prisma.
- If the API is unreachable, the UI keeps working on local state and logs a warning — it never blocks.
