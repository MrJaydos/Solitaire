/* ══════════════════════════════════════════════════════════════
   leaderboard.js — fetch / render / submit + dark mode + name persistence
   ══════════════════════════════════════════════════════════════ */

/* ─── Dark mode ─────────────────────────────────────────────── */
(function initDarkMode() {
  const btn = document.getElementById('btn-dark-mode');
  const isLight = localStorage.getItem('solitaire-theme') === 'light';
  if (isLight) {
    document.documentElement.classList.add('light');
    btn.textContent = '🌙';
  }
  btn.addEventListener('click', () => {
    const nowLight = document.documentElement.classList.toggle('light');
    localStorage.setItem('solitaire-theme', nowLight ? 'light' : 'dark');
    btn.textContent = nowLight ? '🌙' : '☀';
  });
})();

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

async function fetchScores() {
  const res = await fetch('/api/scores');
  if (!res.ok) throw new Error('Failed to load scores');
  return res.json();
}

function renderLeaderboard(scores) {
  const el = document.getElementById('leaderboard-content');

  if (!scores || scores.length === 0) {
    el.innerHTML = '<p class="lb-empty">No scores yet — be the first to win!</p>';
    return;
  }

  const rows = scores.map(s => `
    <tr>
      <td class="rank">${s.rank}</td>
      <td>${escHtml(s.name)}</td>
      <td class="time-col">${formatTime(s.timeMs)}</td>
      <td class="moves-col">${s.moves || '--'}</td>
      <td class="date-col">${s.date}</td>
    </tr>
  `).join('');

  el.innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="rank">#</th>
          <th>Name</th>
          <th class="time-col">Time</th>
          <th class="moves-col">Moves</th>
          <th class="date-col">Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Leaderboard modal ─────────────────────────────────────── */
document.getElementById('btn-leaderboard').addEventListener('click', async () => {
  document.getElementById('leaderboard-overlay').classList.remove('hidden');
  document.getElementById('leaderboard-content').textContent = 'Loading…';
  try {
    const scores = await fetchScores();
    renderLeaderboard(scores);
  } catch {
    document.getElementById('leaderboard-content').innerHTML =
      '<p class="lb-empty">Could not load scores. Try again later.</p>';
  }
});

document.getElementById('btn-close-lb').addEventListener('click', () => {
  document.getElementById('leaderboard-overlay').classList.add('hidden');
});

document.getElementById('leaderboard-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('leaderboard-overlay')) {
    document.getElementById('leaderboard-overlay').classList.add('hidden');
  }
});

/* ─── Win overlay submit ────────────────────────────────────── */
document.getElementById('btn-submit-score').addEventListener('click', submitScore);

document.getElementById('player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitScore();
});

document.getElementById('btn-skip-submit').addEventListener('click', () => {
  document.getElementById('submit-form').classList.add('hidden');
  document.getElementById('submit-status').textContent = '';
});

async function submitScore() {
  const nameEl   = document.getElementById('player-name');
  const statusEl = document.getElementById('submit-status');
  const submitBtn = document.getElementById('btn-submit-score');

  const name = nameEl.value.trim();
  if (!name) {
    statusEl.textContent = 'Please enter a name.';
    nameEl.focus();
    return;
  }
  localStorage.setItem('solitaire-name', name);

  const timeMs = window.lastWinMs;
  const moves  = window.lastWinMoves || 0;
  if (!timeMs || timeMs < 1) {
    statusEl.textContent = 'Invalid time — please play a full game.';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, timeMs, moves }),
    });

    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Submission failed.';
      submitBtn.disabled = false;
      return;
    }

    statusEl.textContent = `Submitted! You ranked #${data.rank}.`;
    document.getElementById('submit-form').innerHTML =
      `<p style="text-align:center;color:var(--accent);font-size:1rem;">
        ✓ Score saved — you ranked <strong>#${data.rank}</strong>!
      </p>`;

  } catch {
    statusEl.textContent = 'Network error. Try again.';
    submitBtn.disabled = false;
  }
}

/* ─── Stats modal ───────────────────────────────────────────── */
function renderStats() {
  const s = (() => {
    try { return { played:0, won:0, bestTime:null, streak:0, longestStreak:0,
                   ...JSON.parse(localStorage.getItem('solitaire-stats')) }; }
    catch { return { played:0, won:0, bestTime:null, streak:0, longestStreak:0 }; }
  })();
  const rate = s.played > 0 ? Math.round(s.won / s.played * 100) : 0;
  document.getElementById('stat-played').textContent  = s.played;
  document.getElementById('stat-won').textContent     = s.won;
  document.getElementById('stat-rate').textContent    = `${rate}%`;
  document.getElementById('stat-best').textContent    = s.bestTime != null ? formatTime(s.bestTime) : '--';
  document.getElementById('stat-streak').textContent  = s.streak;
  document.getElementById('stat-longest').textContent = s.longestStreak;
}

document.getElementById('btn-stats').addEventListener('click', () => {
  renderStats();
  document.getElementById('stats-overlay').classList.remove('hidden');
});

document.getElementById('btn-close-stats').addEventListener('click', () => {
  document.getElementById('stats-overlay').classList.add('hidden');
});

document.getElementById('stats-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('stats-overlay'))
    document.getElementById('stats-overlay').classList.add('hidden');
});

document.getElementById('btn-reset-stats').addEventListener('click', () => {
  localStorage.removeItem('solitaire-stats');
  renderStats();
});

/* ─── Share result ──────────────────────────────────────────── */
document.getElementById('btn-share').addEventListener('click', async () => {
  const ms    = window.lastWinMs || 0;
  const moves = window.lastWinMoves || 0;
  const s     = Math.floor(ms / 1000);
  const m     = Math.floor(s / 60);
  const text  = `I won Solitaire in ${m}:${String(s % 60).padStart(2,'0')} with ${moves} moves! 🃏\nhttps://solitaire.alfi3.com`;
  const btn   = document.getElementById('btn-share');

  const reset = (label, delay = 2000) => {
    btn.textContent = label;
    setTimeout(() => { btn.textContent = 'Share'; }, delay);
  };

  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (_) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    reset('✓ Copied!');
  } catch (_) {
    reset('Failed');
  }
});
