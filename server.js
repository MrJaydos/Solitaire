const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/data/leaderboard.db';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// DB init
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    time_ms      INTEGER NOT NULL,
    moves        INTEGER NOT NULL DEFAULT 0,
    submitted_at TEXT    NOT NULL,
    ip           TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_time ON scores(time_ms ASC);
`);
try { db.exec(`ALTER TABLE scores ADD COLUMN moves INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

const submitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  keyGenerator: (req) => req.ip,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Wait 60 seconds.' },
});

function sanitizeName(raw) {
  return String(raw)
    .trim()
    .replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]))
    .slice(0, 20);
}

// GET /api/scores
app.get('/api/scores', (req, res) => {
  const rows = db.prepare(`
    SELECT name, time_ms AS timeMs, moves, submitted_at AS date
    FROM scores
    ORDER BY time_ms ASC
    LIMIT 20
  `).all();

  const scored = rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    timeMs: r.timeMs,
    moves: r.moves || 0,
    date: r.date.slice(0, 10),
  }));

  res.json(scored);
});

// POST /api/scores
app.post('/api/scores', submitLimiter, (req, res) => {
  const { name, timeMs, moves } = req.body;

  if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) {
    return res.status(400).json({ error: 'timeMs must be a number.' });
  }
  if (timeMs < 10_000 || timeMs > 7_200_000) {
    return res.status(400).json({ error: 'timeMs out of valid range.' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required.' });
  }

  const cleanName = sanitizeName(name);
  if (cleanName.length === 0) {
    return res.status(400).json({ error: 'name cannot be empty.' });
  }

  const cleanMoves = (typeof moves === 'number' && Number.isFinite(moves)) ? Math.max(0, Math.round(moves)) : 0;
  const now = new Date().toISOString();
  const ip = req.ip || 'unknown';

  db.prepare(`
    INSERT INTO scores (name, time_ms, moves, submitted_at, ip) VALUES (?, ?, ?, ?, ?)
  `).run(cleanName, Math.round(timeMs), cleanMoves, now, ip);

  const rank = db.prepare(`
    SELECT COUNT(*) AS r FROM scores WHERE time_ms <= ?
  `).get(Math.round(timeMs)).r;

  res.json({ ok: true, rank });
});

app.listen(PORT, () => console.log(`Solitaire running on port ${PORT}`));
