/* ══════════════════════════════════════════════════════════════
   Klondike Solitaire — game.js
   State is pure JS; DOM is re-rendered on every state change.
   ══════════════════════════════════════════════════════════════ */

const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);

function isRed(suit) { return RED_SUITS.has(suit); }

/* ─── State ─────────────────────────────────────────────────── */
let state = null;  // { stock, waste, foundations[4], tableau[7], moveCount, won }
let timerInterval = null;
let timerStart = null;
let elapsed = 0;   // ms
let timerRunning = false;

/* ─── Timer helpers ─────────────────────────────────────────── */
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerStart = Date.now() - elapsed;
  timerInterval = setInterval(updateTimerDisplay, 500);
}

function stopTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  if (timerStart !== null) elapsed = Date.now() - timerStart;
}

function resetTimer() {
  stopTimer();
  elapsed = 0;
  timerStart = null;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (timerStart !== null && timerRunning) {
    elapsed = Date.now() - timerStart;
  }
  const s = Math.floor(elapsed / 1000);
  const m = Math.floor(s / 60);
  document.getElementById('timer-display').textContent =
    `${m}:${String(s % 60).padStart(2, '0')}`;
}

function getElapsedMs() {
  return timerRunning ? Date.now() - timerStart : elapsed;
}

/* ─── Deck / shuffle ────────────────────────────────────────── */
function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, faceUp: false });
    }
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ─── New game ──────────────────────────────────────────────── */
function newGame() {
  resetTimer();
  const deck = shuffle(buildDeck());
  const tableau = Array.from({ length: 7 }, () => []);

  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const card = { ...deck[idx++] };
      card.faceUp = (row === col);
      tableau[col].push(card);
    }
  }

  state = {
    stock: deck.slice(idx).map(c => ({ ...c, faceUp: false })),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moveCount: 0,
    won: false,
  };

  render();
}

/* ─── Rules ─────────────────────────────────────────────────── */
function rankIndex(rank) { return RANKS.indexOf(rank); }

function canStackOnTableau(card, target) {
  // target is the top card of a tableau column
  if (!target) return card.rank === 'K';
  if (!target.faceUp) return false;
  return isRed(card.suit) !== isRed(target.suit) &&
         rankIndex(card.rank) === rankIndex(target.rank) - 1;
}

function canStackOnFoundation(card, pile) {
  if (pile.length === 0) return card.rank === 'A';
  const top = pile[pile.length - 1];
  return top.suit === card.suit &&
         rankIndex(card.rank) === rankIndex(top.rank) + 1;
}

function foundationIndexForCard(card) {
  for (let i = 0; i < 4; i++) {
    if (canStackOnFoundation(card, state.foundations[i])) return i;
  }
  return -1;
}

/* ─── Move recording ────────────────────────────────────────── */
function recordMove() {
  state.moveCount++;
  document.getElementById('move-counter').textContent =
    `${state.moveCount} move${state.moveCount === 1 ? '' : 's'}`;
  if (!timerRunning) startTimer();
}

/* ─── Win check ─────────────────────────────────────────────── */
function checkWin() {
  const won = state.foundations.every(f => f.length === 13);
  if (won && !state.won) {
    state.won = true;
    stopTimer();
    setTimeout(showWin, 400);
  }
}

/* ─── Auto-move to foundation ───────────────────────────────── */
function tryAutoMoveToFoundation(card, sourceList, sourceIdx) {
  const fi = foundationIndexForCard(card);
  if (fi === -1) return false;
  // Only auto-move single face-up cards from waste or top of tableau
  sourceList.splice(sourceIdx, 1);
  state.foundations[fi].push(card);
  recordMove();
  flipTopTableau();
  render();
  checkWin();
  return true;
}

function flipTopTableau() {
  for (const col of state.tableau) {
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
    }
  }
}

/* ──────────────────────────────────────────────────────────────
   RENDERING
   ────────────────────────────────────────────────────────────── */
function render() {
  renderStock();
  renderWaste();
  renderFoundations();
  renderTableau();
}

function makeCardEl(card, extraClass = '') {
  const el = document.createElement('div');
  el.className = `card ${card.faceUp ? (isRed(card.suit) ? 'red' : 'black') : 'face-down'} ${extraClass}`;

  if (card.faceUp) {
    el.innerHTML = `
      <div class="rank-suit-tl"><span class="rank">${card.rank}</span><span class="suit">${card.suit}</span></div>
      <div class="rank-suit-br"><span class="rank">${card.rank}</span><span class="suit">${card.suit}</span></div>
    `;
  }

  el.dataset.suit = card.suit;
  el.dataset.rank = card.rank;
  el.dataset.faceUp = card.faceUp ? '1' : '0';
  return el;
}

function renderStock() {
  const el = document.getElementById('stock');
  el.innerHTML = '';
  el.classList.toggle('empty', state.stock.length === 0);

  if (state.stock.length > 0) {
    const top = makeCardEl({ suit: '', rank: '', faceUp: false });
    el.appendChild(top);
  }
}

function renderWaste() {
  const el = document.getElementById('waste');
  el.innerHTML = '';
  if (state.waste.length === 0) return;

  const SHOW = Math.min(state.waste.length, 1);
  for (let i = state.waste.length - SHOW; i < state.waste.length; i++) {
    const card = state.waste[i];
    const cardEl = makeCardEl(card);
    cardEl.style.top = '0px';
    el.appendChild(cardEl);
  }

  // Make top card draggable
  const topEl = el.lastChild;
  if (topEl) setupDrag(topEl, 'waste', state.waste.length - 1, 1);

  // Click to auto-move top waste card
  topEl && topEl.addEventListener('click', () => {
    const card = state.waste[state.waste.length - 1];
    tryAutoMoveToFoundation(card, state.waste, state.waste.length - 1);
  });
}

function renderFoundations() {
  document.querySelectorAll('.foundation').forEach((el, i) => {
    el.innerHTML = '';
    const pile = state.foundations[i];
    if (pile.length === 0) return;
    const card = pile[pile.length - 1];
    const cardEl = makeCardEl(card);
    cardEl.style.top = '0px';
    el.appendChild(cardEl);
  });
}

const FACE_DOWN_OFFSET = 18;
const FACE_UP_OFFSET   = 26;

function renderTableau() {
  document.querySelectorAll('.tableau-col').forEach((el, col) => {
    el.innerHTML = '';
    const cards = state.tableau[col];
    let y = 0;

    cards.forEach((card, idx) => {
      const cardEl = makeCardEl(card);
      cardEl.style.top = `${y}px`;

      if (card.faceUp) {
        // Single click on top face-up card: try auto-move to foundation
        if (idx === cards.length - 1) {
          cardEl.addEventListener('click', (e) => {
            if (dragOccurred) return; // suppress click after drag
            tryAutoMoveToFoundation(card, state.tableau[col], idx);
          });
          setupDrag(cardEl, 'tableau', col, cards.length - idx);
        } else {
          // Middle of a sequence — drag the whole sub-sequence
          setupDrag(cardEl, 'tableau', col, cards.length - idx);
        }
        y += FACE_UP_OFFSET;
      } else {
        y += FACE_DOWN_OFFSET;
      }

      el.appendChild(cardEl);
    });

    // Update min-height so drop target is big enough
    const minH = Math.max(100, y + 100);
    el.style.minHeight = `${minH}px`;
  });
}

/* ──────────────────────────────────────────────────────────────
   DRAG AND DROP  (mouse + touch unified)
   ────────────────────────────────────────────────────────────── */
let drag = null;   // { source, colOrIdx, count, ghost, cards, startX, startY }
let dragOccurred = false;

function setupDrag(el, source, colOrIdx, count) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startDrag(e.clientX, e.clientY, el, source, colOrIdx, count);
  });
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY, el, source, colOrIdx, count);
  }, { passive: true });
}

function startDrag(clientX, clientY, el, source, colOrIdx, count) {
  dragOccurred = false;

  // Collect the cards being dragged
  let cards;
  if (source === 'waste') {
    cards = [state.waste[state.waste.length - 1]];
  } else {
    const col = state.tableau[colOrIdx];
    cards = col.slice(col.length - count);
  }

  // Build ghost
  const ghost = buildGhost(cards, el);
  document.body.appendChild(ghost);

  // Position ghost under pointer
  const rect = el.getBoundingClientRect();
  const offX = clientX - rect.left;
  const offY = clientY - rect.top;

  drag = { source, colOrIdx, count, ghost, cards, offX, offY };
  positionGhost(clientX, clientY);

  // Mark originals as dim
  if (source === 'waste') {
    document.getElementById('waste').lastChild?.classList.add('dragging');
  } else {
    const colEl = document.querySelectorAll('.tableau-col')[colOrIdx];
    const cardEls = colEl.querySelectorAll('.card');
    for (let i = cardEls.length - count; i < cardEls.length; i++) {
      cardEls[i].classList.add('dragging');
    }
  }

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup',   onDragEnd);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend',  onTouchEnd);
}

function buildGhost(cards, refEl) {
  const ghost = document.createElement('div');
  ghost.id = 'drag-ghost';

  cards.forEach((card, i) => {
    const cardEl = makeCardEl(card);
    cardEl.style.position = 'absolute';
    cardEl.style.top = `${i * FACE_UP_OFFSET}px`;
    ghost.appendChild(cardEl);
  });

  const h = parseInt(getComputedStyle(refEl).getPropertyValue('--card-h') ||
    getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 100;
  const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 72;
  ghost.style.width  = `${w}px`;
  ghost.style.height = `${h + (cards.length - 1) * FACE_UP_OFFSET}px`;
  ghost.style.pointerEvents = 'none';
  return ghost;
}

function positionGhost(x, y) {
  if (!drag) return;
  drag.ghost.style.left = `${x - drag.offX}px`;
  drag.ghost.style.top  = `${y - drag.offY}px`;
}

function onDragMove(e) { positionGhost(e.clientX, e.clientY); dragOccurred = true; }
function onTouchMove(e) {
  e.preventDefault();
  const t = e.touches[0];
  positionGhost(t.clientX, t.clientY);
  dragOccurred = true;
}
function onTouchEnd(e) {
  const t = e.changedTouches[0];
  const target = document.elementFromPoint(t.clientX, t.clientY);
  endDrag(target);
}
function onDragEnd(e) { endDrag(e.target); }

function endDrag(targetEl) {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend',  onTouchEnd);

  if (!drag) return;

  drag.ghost.remove();
  const { source, colOrIdx, count, cards } = drag;
  drag = null;

  // Find drop target pile
  const pile = findDropTarget(targetEl);
  if (pile) {
    applyDrop(pile, source, colOrIdx, count, cards);
  } else {
    // Snap back
    render();
  }

  document.querySelectorAll('.card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.pile.drag-over').forEach(el => el.classList.remove('drag-over'));
}

function findDropTarget(el) {
  let node = el;
  while (node && node !== document.body) {
    if (node.classList.contains('foundation'))  return { type: 'foundation', el: node };
    if (node.classList.contains('tableau-col')) return { type: 'tableau',    el: node };
    node = node.parentElement;
  }
  return null;
}

function applyDrop(pile, source, colOrIdx, count, cards) {
  const card = cards[0]; // top of the sequence being dropped

  if (pile.type === 'foundation') {
    if (cards.length !== 1) { render(); return; } // can't move sequences to foundation
    const fi = parseInt(pile.el.dataset.foundation);
    if (!canStackOnFoundation(card, state.foundations[fi])) { render(); return; }

    // Remove from source
    removeFromSource(source, colOrIdx, count);
    state.foundations[fi].push(card);
    recordMove();
    flipTopTableau();
    render();
    checkWin();

  } else if (pile.type === 'tableau') {
    const destCol = parseInt(pile.el.dataset.col);
    const destCards = state.tableau[destCol];
    const topCard = destCards.length > 0 ? destCards[destCards.length - 1] : null;

    if (!canStackOnTableau(card, topCard)) { render(); return; }

    removeFromSource(source, colOrIdx, count);
    state.tableau[destCol].push(...cards);
    recordMove();
    flipTopTableau();
    render();
    checkWin();
  }
}

function removeFromSource(source, colOrIdx, count) {
  if (source === 'waste') {
    state.waste.splice(state.waste.length - count, count);
  } else {
    state.tableau[colOrIdx].splice(state.tableau[colOrIdx].length - count, count);
  }
}

/* ──────────────────────────────────────────────────────────────
   CLICK HANDLERS (non-drag)
   ────────────────────────────────────────────────────────────── */
document.getElementById('stock').addEventListener('click', () => {
  if (state.stock.length > 0) {
    const card = state.stock.pop();
    card.faceUp = true;
    state.waste.push(card);
  } else {
    // Recycle
    state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
    state.waste = [];
  }
  recordMove();
  render();
});

// Drop zones for foundation and tableau (pointer-based)
function setupDropZones() {
  document.querySelectorAll('.foundation, .tableau-col').forEach(el => {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  });
}

/* ──────────────────────────────────────────────────────────────
   WIN OVERLAY
   ────────────────────────────────────────────────────────────── */
function showWin() {
  const ms = getElapsedMs();
  const s  = Math.floor(ms / 1000);
  const m  = Math.floor(s / 60);
  document.getElementById('win-time').textContent =
    `Time: ${m}:${String(s % 60).padStart(2, '0')}`;
  document.getElementById('win-moves').textContent =
    `Moves: ${state.moveCount}`;
  document.getElementById('win-overlay').classList.remove('hidden');
  document.getElementById('player-name').focus();

  // Expose to leaderboard.js
  window.lastWinMs = ms;
}

document.getElementById('btn-play-again').addEventListener('click', () => {
  document.getElementById('win-overlay').classList.add('hidden');
  newGame();
});

document.getElementById('btn-new-game').addEventListener('click', () => {
  document.getElementById('win-overlay').classList.add('hidden');
  newGame();
});

/* ─── Boot ──────────────────────────────────────────────────── */
setupDropZones();
newGame();
