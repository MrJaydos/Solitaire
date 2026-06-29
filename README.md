# Solitaire

Klondike Solitaire with a shared server-side leaderboard.  
Live at **https://solitaire.alfi3.com**

---

## Running locally

```bash
npm install

# DB defaults to /data/leaderboard.db — override for local dev:
DB_PATH=./leaderboard.db node server.js
```

Then open http://localhost:3000.

---

## API

| Method | Path         | Body / Response |
|--------|-------------|-----------------|
| GET    | /api/scores | Returns top 20 scores: `[{ rank, name, timeMs, date }]` |
| POST   | /api/scores | Body: `{ name: string, timeMs: number }` → `{ ok: true, rank: number }` |

**Validation rules (POST):**
- `timeMs` must be between 10 000 ms (10 s) and 7 200 000 ms (2 h)
- `name` is trimmed, HTML-escaped, max 20 characters
- Rate limited to 1 submission per IP per 60 seconds (HTTP 429 if exceeded)

---

## Database

SQLite file at `$DB_PATH` (default `/data/leaderboard.db`).

Schema:
```sql
CREATE TABLE scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  time_ms      INTEGER NOT NULL,
  submitted_at TEXT    NOT NULL,
  ip           TEXT    NOT NULL
);
```

---

## Coolify deployment

### Persistent volume (required)

**The SQLite file must survive container rebuilds.**  
In Coolify, add a persistent volume mount for the service:

```
Host path (or named volume): /data/solitaire
Container path:              /data
```

Without this, the leaderboard resets on every redeploy.

### Deploy flow

1. Push to the GitHub repo (`git push origin main`).
2. Coolify detects the push via webhook and triggers a rebuild.
3. Coolify builds the Dockerfile, then replaces the running container.
4. The `/data` volume is preserved across rebuilds.

### Environment variables (Coolify)

| Variable  | Default              | Notes |
|-----------|----------------------|-------|
| `PORT`    | `3000`               | Port the Node server listens on |
| `DB_PATH` | `/data/leaderboard.db` | Path to SQLite file — keep inside the mounted volume |
