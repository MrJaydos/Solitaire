/* ══════════════════════════════════════════════════════════════
   Klondike Solitaire — game.js
   State is pure JS; DOM is re-rendered on every state change.
   ══════════════════════════════════════════════════════════════ */

const SUITS  = ['♠', '♥', '♦', '♣'];
const RANKS  = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RED_SUITS = new Set(['♥', '♦']);

function isRed(suit) { return RED_SUITS.has(suit); }

/* ─── State ─────────────────────────────────────────────────── */
let state = null;  // { stock, waste, foundations[4], tableau[7], moveCount, won, stockPasses }
let timerInterval = null;
let timerStart = null;
let elapsed = 0;   // ms
let timerRunning = false;
let hintTimeout = null;
const HINT_DELAY = 60_000;
let undoStack = [];

/* ─── Hard mode ─────────────────────────────────────────────── */
let hardMode = localStorage.getItem('solitaire-hard') === 'true';
const MAX_STOCK_PASSES = 2;

/* ─── Draw count ─────────────────────────────────────────────── */
let drawCount = parseInt(localStorage.getItem('solitaire-draw') || '3', 10);
if (drawCount !== 1) drawCount = 3;

/* ─── Sound ──────────────────────────────────────────────────── */
let soundEnabled = localStorage.getItem('solitaire-sound') !== 'false';
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const noise = (dur, vol) => {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    src.connect(g); g.connect(ctx.destination);
    src.start(now);
  };

  if (type === 'place') noise(0.07, 0.18);
  else if (type === 'flip')  noise(0.045, 0.12);
  else if (type === 'draw')  noise(0.05,  0.09);
  else if (type === 'win') {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      const t   = now + i * 0.13;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.4);
    });
  }
}

/* ─── Auto-complete ──────────────────────────────────────────── */
let autoCompleting = false;
let autoCompleteTimer = null;

function shouldAutoComplete() {
  if (!state || state.won || state.stock.length > 0) return false;
  return state.tableau.every(col => col.every(c => c.faceUp));
}

function checkAutoComplete() {
  if (autoCompleting || !shouldAutoComplete()) return;
  autoCompleting = true;
  autoCompleteTimer = setTimeout(doAutoCompleteStep, 300);
}

function doAutoCompleteStep() {
  if (!state || state.won) { autoCompleting = false; return; }

  const sources = [
    { type: 'waste' },
    ...state.tableau.map((_, col) => ({ type: 'tableau', col })),
  ];

  for (const src of sources) {
    const pile = src.type === 'waste' ? state.waste : state.tableau[src.col];
    if (pile.length === 0) continue;
    const card = pile[pile.length - 1];
    const fi = foundationIndexForCard(card);
    if (fi === -1) continue;

    // Capture source rect before DOM update
    let srcRect = null;
    if (src.type === 'waste') {
      srcRect = document.getElementById('waste').lastChild?.getBoundingClientRect();
    } else {
      const colEl = document.querySelectorAll('.tableau-col')[src.col];
      srcRect = colEl?.lastChild?.getBoundingClientRect();
    }

    pile.pop();
    state.foundations[fi].push(card);
    recordMove();
    flipTopTableau();
    render();
    checkWin();
    playSound('place');
    if (srcRect) animateSmartMove([srcRect], { type: 'foundation', idx: fi }, 1);

    if (!state.won) autoCompleteTimer = setTimeout(doAutoCompleteStep, 150);
    else autoCompleting = false;
    return;
  }

  autoCompleting = false; // no moves found
}

function cancelAutoComplete() {
  clearTimeout(autoCompleteTimer);
  autoCompleting = false;
}

/* ─── Personal stats ─────────────────────────────────────────── */
const STATS_KEY = 'solitaire-stats';

function loadStats() {
  try { return { ...defaultStats(), ...JSON.parse(localStorage.getItem(STATS_KEY)) }; }
  catch { return defaultStats(); }
}
function defaultStats() {
  return { played: 0, won: 0, bestTime: null, streak: 0, longestStreak: 0 };
}
function saveStats(s) { localStorage.setItem(STATS_KEY, JSON.stringify(s)); }

function recordGameStart() {
  if (state && state.moveCount > 0 && !state.won) {
    const s = loadStats();
    s.played++;
    s.streak = 0;
    saveStats(s);
  }
}

function recordGameWin(ms) {
  const s = loadStats();
  s.played++;
  s.won++;
  s.streak++;
  if (s.streak > s.longestStreak) s.longestStreak = s.streak;
  if (s.bestTime === null || ms < s.bestTime) s.bestTime = ms;
  saveStats(s);
}

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
  recordGameStart();
  cancelAutoComplete();
  resetTimer();
  clearTimeout(hintTimeout);
  clearHint();
  stopCelebration();
  undoStack = [];
  updateUndoButton();
  document.getElementById('move-counter').textContent = '0 moves';
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
    stockPasses: 0,
  };

  render();
  animateDeal();
  resetHintTimer();
}

function animateDeal() {
  // Stagger each tableau card flying in from the stock pile position.
  const stockEl = document.getElementById('stock');
  const stockRect = stockEl.getBoundingClientRect();

  const cardEls = [];
  document.querySelectorAll('.tableau-col').forEach(colEl => {
    colEl.querySelectorAll('.card').forEach(c => cardEls.push(c));
  });

  cardEls.forEach((cardEl, i) => {
    const destRect = cardEl.getBoundingClientRect();
    const dx = stockRect.left - destRect.left;
    const dy = stockRect.top  - destRect.top;

    cardEl.style.transition = 'none';
    cardEl.style.transform  = `translate(${dx}px, ${dy}px)`;
    cardEl.style.opacity    = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cardEl.style.transition = `transform 0.3s ease, opacity 0.15s ease`;
        cardEl.style.transitionDelay = `${i * 30}ms`;
        cardEl.style.transform  = 'translate(0, 0)';
        cardEl.style.opacity    = '1';
      });
    });
  });
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
  resetHintTimer();
  updateUndoButton();
}

/* ─── Win check ─────────────────────────────────────────────── */
function checkWin() {
  const won = state.foundations.every(f => f.length === 13);
  if (won && !state.won) {
    state.won = true;
    cancelAutoComplete();
    stopTimer();
    clearTimeout(hintTimeout);
    clearHint();
    undoStack = [];
    updateUndoButton();
    const ms = getElapsedMs();
    recordGameWin(ms);
    window.lastWinMoves = state.moveCount;
    playSound('win');
    startCelebration(state.foundations.map(f => [...f]));
    setTimeout(showWin, 1000);
  }
}

/* ─── Undo ───────────────────────────────────────────────────── */
function saveUndoState() {
  if (hardMode) return;
  undoStack.push({
    stock:       state.stock.map(c => ({ ...c })),
    waste:       state.waste.map(c => ({ ...c })),
    foundations: state.foundations.map(f => f.map(c => ({ ...c }))),
    tableau:     state.tableau.map(col => col.map(c => ({ ...c }))),
  });
}

function undo() {
  if (undoStack.length === 0) return;
  const prev = undoStack.pop();
  const moveCount = state.moveCount + 1; // undo costs a move
  state = { ...prev, moveCount, won: false };
  document.getElementById('move-counter').textContent =
    `${state.moveCount} move${state.moveCount === 1 ? '' : 's'}`;
  resetHintTimer();
  updateUndoButton();
  render();
}

function updateUndoButton() {
  const btn = document.getElementById('btn-undo');
  if (btn) btn.disabled = undoStack.length === 0;
}

/* ─── Hint system ───────────────────────────────────────────── */
function resetHintTimer() {
  clearHint();
  clearTimeout(hintTimeout);
  if (hardMode) return;
  hintTimeout = setTimeout(triggerHint, HINT_DELAY);
}

function clearHint() {
  document.querySelectorAll('.hint-source, .hint-dest')
    .forEach(el => el.classList.remove('hint-source', 'hint-dest'));
}

function triggerHint() {
  const hint = findHint();
  if (!hint) return;

  if (hint.srcType === 'waste') {
    document.getElementById('waste').lastChild?.classList.add('hint-source');
  } else if (hint.srcType === 'tableau') {
    const colEl = document.querySelectorAll('.tableau-col')[hint.srcCol];
    const cardEls = colEl.querySelectorAll('.card');
    Array.from(cardEls).slice(cardEls.length - hint.count)
      .forEach(el => el.classList.add('hint-source'));
  } else if (hint.srcType === 'stock') {
    document.getElementById('stock').classList.add('hint-source');
  }

  if (hint.destType === 'foundation') {
    document.querySelector(`.foundation[data-foundation="${hint.destIdx}"]`)
      ?.classList.add('hint-dest');
  } else if (hint.destType === 'tableau') {
    document.querySelectorAll('.tableau-col')[hint.destIdx]
      ?.classList.add('hint-dest');
  }
}

function findHint() {
  // 1. Any card → foundation (always the highest-priority move)
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    const fi = foundationIndexForCard(card);
    if (fi !== -1) return { srcType: 'waste', destType: 'foundation', destIdx: fi, count: 1 };
  }
  for (let col = 0; col < 7; col++) {
    const cards = state.tableau[col];
    if (!cards.length) continue;
    const card = cards[cards.length - 1];
    if (!card.faceUp) continue;
    const fi = foundationIndexForCard(card);
    if (fi !== -1) return { srcType: 'tableau', srcCol: col, destType: 'foundation', destIdx: fi, count: 1 };
  }

  // 2. Moves that reveal a face-down card (most strategically valuable)
  for (let srcCol = 0; srcCol < 7; srcCol++) {
    const srcCards = state.tableau[srcCol];
    const firstFaceUp = srcCards.findIndex(c => c.faceUp);
    if (firstFaceUp <= 0) continue; // nothing face-down underneath
    const card = srcCards[firstFaceUp];
    const count = srcCards.length - firstFaceUp;
    for (let destCol = 0; destCol < 7; destCol++) {
      if (destCol === srcCol) continue;
      const destCards = state.tableau[destCol];
      if (destCards.length === 0) continue;
      if (canStackOnTableau(card, destCards[destCards.length - 1])) {
        return { srcType: 'tableau', srcCol, destType: 'tableau', destIdx: destCol, count };
      }
    }
  }

  // 3. Waste → tableau
  if (state.waste.length > 0) {
    const card = state.waste[state.waste.length - 1];
    for (let destCol = 0; destCol < 7; destCol++) {
      const destCards = state.tableau[destCol];
      const topCard = destCards.length > 0 ? destCards[destCards.length - 1] : null;
      if (canStackOnTableau(card, topCard)) {
        return { srcType: 'waste', destType: 'tableau', destIdx: destCol, count: 1 };
      }
    }
  }

  // 4. Any tableau sequence → tableau
  for (let srcCol = 0; srcCol < 7; srcCol++) {
    const srcCards = state.tableau[srcCol];
    const firstFaceUp = srcCards.findIndex(c => c.faceUp);
    if (firstFaceUp === -1) continue;
    for (let startIdx = firstFaceUp; startIdx < srcCards.length; startIdx++) {
      const count = srcCards.length - startIdx;
      const card = srcCards[startIdx];
      for (let destCol = 0; destCol < 7; destCol++) {
        if (destCol === srcCol) continue;
        const destCards = state.tableau[destCol];
        const topCard = destCards.length > 0 ? destCards[destCards.length - 1] : null;
        if (canStackOnTableau(card, topCard)) {
          return { srcType: 'tableau', srcCol, destType: 'tableau', destIdx: destCol, count };
        }
      }
    }
  }

  // 5. Draw from stock
  if (state.stock.length > 0 || state.waste.length > 1) {
    return { srcType: 'stock', destType: null, destIdx: null, count: 0 };
  }

  return null;
}

/* ─── Smart auto-move on click ──────────────────────────────── */
function smartMove(source, colOrIdx, count) {
  let cards;
  if (source === 'waste') {
    cards = [state.waste[state.waste.length - 1]];
  } else {
    const col = state.tableau[colOrIdx];
    cards = col.slice(col.length - count);
  }
  const card = cards[0];

  // --- Find destination ---
  let dest = null;

  if (cards.length === 1) {
    const fi = foundationIndexForCard(card);
    if (fi !== -1) dest = { type: 'foundation', idx: fi };
  }

  if (!dest) {
    outer: for (const preferEmpty of [false, true]) {
      for (let destCol = 0; destCol < 7; destCol++) {
        if (source === 'tableau' && destCol === colOrIdx) continue;
        const destCards = state.tableau[destCol];
        if (preferEmpty !== (destCards.length === 0)) continue;
        const topCard = destCards.length > 0 ? destCards[destCards.length - 1] : null;
        if (canStackOnTableau(card, topCard)) {
          dest = { type: 'tableau', idx: destCol };
          break outer;
        }
      }
    }
  }

  if (!dest) {
    recordMove(); // failed click still costs a move — no undo state saved
    return false;
  }

  // Snapshot source positions before DOM changes
  const sourceRects = captureSourceRects(source, colOrIdx, count);

  saveUndoState();

  // Apply move
  if (dest.type === 'foundation') {
    removeFromSource(source, colOrIdx, count);
    state.foundations[dest.idx].push(card);
  } else {
    removeFromSource(source, colOrIdx, count);
    state.tableau[dest.idx].push(...cards);
  }
  recordMove();
  const flipped = flipTopTableau();
  render();
  checkWin();
  checkAutoComplete();
  playSound(flipped ? 'flip' : 'place');

  // Animate the cards flying to their new home
  animateSmartMove(sourceRects, dest, count);

  return true;
}

function captureSourceRects(source, colOrIdx, count) {
  if (source === 'waste') {
    const el = document.getElementById('waste').lastChild;
    return el ? [el.getBoundingClientRect()] : [];
  }
  const colEl = document.querySelectorAll('.tableau-col')[colOrIdx];
  const allCards = colEl.querySelectorAll('.card');
  return Array.from(allCards).slice(allCards.length - count)
    .map(el => el.getBoundingClientRect());
}

function animateSmartMove(sourceRects, dest, count) {
  let destEls;
  if (dest.type === 'foundation') {
    const foundEl = document.querySelector(`.foundation[data-foundation="${dest.idx}"]`);
    const last = foundEl?.lastChild;
    destEls = last ? [last] : [];
  } else {
    const colEl = document.querySelectorAll('.tableau-col')[dest.idx];
    const allCards = colEl.querySelectorAll('.card');
    destEls = Array.from(allCards).slice(Math.max(0, allCards.length - count));
  }

  destEls.forEach((el, i) => {
    const src = sourceRects[i];
    if (!src) return;
    const dst = el.getBoundingClientRect();
    const dx = src.left - dst.left;
    const dy = src.top  - dst.top;

    // Place at source position instantly, then transition to final spot
    el.style.transition = 'none';
    el.style.transform  = `translate(${dx}px, ${dy}px)`;
    el.style.zIndex     = '50';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition      = `transform 0.22s cubic-bezier(0.25, 0.1, 0.25, 1)`;
        el.style.transitionDelay = `${i * 18}ms`;
        el.style.transform       = 'translate(0, 0)';
        el.addEventListener('transitionend', () => {
          el.style.cssText = el.style.cssText
            .replace(/transition[^;]*;?/g, '')
            .replace(/transform[^;]*;?/g, '')
            .replace(/z-index[^;]*;?/g, '');
        }, { once: true });
      });
    });
  });
}

function flipTopTableau() {
  let flipped = false;
  for (const col of state.tableau) {
    if (col.length > 0 && !col[col.length - 1].faceUp) {
      col[col.length - 1].faceUp = true;
      flipped = true;
    }
  }
  return flipped;
}

/* ──────────────────────────────────────────────────────────────
   CARD FACE DESIGNS — large centred suit symbol on every card
   ────────────────────────────────────────────────────────────── */
function buildCardCenter(rank, suit) {
  return `<div class="card-center"><span class="pip-center">${suit}</span></div>`;
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
      ${buildCardCenter(card.rank, card.suit)}
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

  const exhausted = hardMode && state.stockPasses >= MAX_STOCK_PASSES && state.stock.length === 0;
  el.classList.toggle('exhausted', exhausted);

  const passesEl = document.getElementById('stock-passes');
  if (passesEl) {
    if (hardMode) {
      const remaining = MAX_STOCK_PASSES - state.stockPasses;
      passesEl.textContent = remaining > 0 ? `♻ ${remaining} left` : 'No recycles left';
      passesEl.classList.toggle('exhausted', remaining <= 0);
    } else {
      passesEl.textContent = '';
      passesEl.classList.remove('exhausted');
    }
  }
}

function renderWaste() {
  const el = document.getElementById('waste');
  el.innerHTML = '';
  if (state.waste.length === 0) return;

  if (drawCount === 1) {
    const card = state.waste[state.waste.length - 1];
    const cardEl = makeCardEl(card);
    cardEl.style.top  = '0px';
    cardEl.style.left = '0px';
    el.appendChild(cardEl);
    setupDrag(cardEl, 'waste', state.waste.length - 1, 1);
    cardEl.addEventListener('click', () => {
      if (dragOccurred) return;
      smartMove('waste', state.waste.length - 1, 1);
    });
  } else {
    const FAN_OFFSET = window.innerWidth <= 600 ? 7 : 18;
    const SHOW = Math.min(state.waste.length, 3);
    for (let i = state.waste.length - SHOW; i < state.waste.length; i++) {
      const card = state.waste[i];
      const cardEl = makeCardEl(card);
      const pos = i - (state.waste.length - SHOW);
      cardEl.style.top  = '0px';
      cardEl.style.left = `${pos * FAN_OFFSET}px`;
      el.appendChild(cardEl);
    }
    const topEl = el.lastChild;
    if (topEl) {
      setupDrag(topEl, 'waste', state.waste.length - 1, 1);
      topEl.addEventListener('click', () => {
        if (dragOccurred) return;
        smartMove('waste', state.waste.length - 1, 1);
      });
    }
  }
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

const FACE_DOWN_OFFSET = 20;
const FACE_UP_OFFSET   = 30;

function renderTableau() {
  document.querySelectorAll('.tableau-col').forEach((el, col) => {
    el.innerHTML = '';
    const cards = state.tableau[col];
    let y = 0;

    cards.forEach((card, idx) => {
      const cardEl = makeCardEl(card);
      cardEl.style.top = `${y}px`;

      if (card.faceUp) {
        const count = cards.length - idx;
        setupDrag(cardEl, 'tableau', col, count);
        cardEl.addEventListener('click', () => {
          if (dragOccurred) return;
          smartMove('tableau', col, count);
        });
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
let drag = null;        // active drag: { source, colOrIdx, count, ghost, cards, offX, offY }
let pendingDrag = null; // pre-threshold: { startX, startY, el, source, colOrIdx, count, offX, offY }
let dragOccurred = false;

const DRAG_THRESHOLD = 5; // px

function setupDrag(el, source, colOrIdx, count) {
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    prepareDrag(e.clientX, e.clientY, el, source, colOrIdx, count);
  });
  el.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    prepareDrag(t.clientX, t.clientY, el, source, colOrIdx, count);
  }, { passive: true });
}

// Store intent but don't build the ghost until the pointer actually moves.
function prepareDrag(clientX, clientY, el, source, colOrIdx, count) {
  dragOccurred = false;
  const rect = el.getBoundingClientRect();
  pendingDrag = {
    startX: clientX, startY: clientY,
    el, source, colOrIdx, count,
    offX: clientX - rect.left,
    offY: clientY - rect.top,
  };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup',   onDragEnd);
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend',  onTouchEnd);
}

// Commit the drag once the movement threshold is crossed.
function activateDrag(clientX, clientY) {
  if (!pendingDrag || drag) return;
  const { el, source, colOrIdx, count, offX, offY } = pendingDrag;
  pendingDrag = null;

  let cards;
  if (source === 'waste') {
    cards = [state.waste[state.waste.length - 1]];
  } else {
    const col = state.tableau[colOrIdx];
    cards = col.slice(col.length - count);
  }

  const ghost = buildGhost(cards, el);
  document.body.appendChild(ghost);
  drag = { source, colOrIdx, count, ghost, cards, offX, offY };
  positionGhost(clientX, clientY);

  // Dim originals
  if (source === 'waste') {
    document.getElementById('waste').lastChild?.classList.add('dragging');
  } else {
    const colEl = document.querySelectorAll('.tableau-col')[colOrIdx];
    const cardEls = colEl.querySelectorAll('.card');
    for (let i = cardEls.length - count; i < cardEls.length; i++) {
      cardEls[i].classList.add('dragging');
    }
  }

  dragOccurred = true;
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

function onDragMove(e) {
  if (pendingDrag && !drag) {
    const dx = e.clientX - pendingDrag.startX;
    const dy = e.clientY - pendingDrag.startY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) activateDrag(e.clientX, e.clientY);
  }
  if (drag) { positionGhost(e.clientX, e.clientY); dragOccurred = true; }
}

function onTouchMove(e) {
  const t = e.touches[0];
  if (pendingDrag && !drag) {
    const dx = t.clientX - pendingDrag.startX;
    const dy = t.clientY - pendingDrag.startY;
    if (Math.hypot(dx, dy) >= DRAG_THRESHOLD) activateDrag(t.clientX, t.clientY);
  }
  if (drag) { e.preventDefault(); positionGhost(t.clientX, t.clientY); dragOccurred = true; }
}

function onTouchEnd(e) {
  const t = e.changedTouches[0];
  if (!drag && pendingDrag) {
    // Tap (no movement) — treat as smart move
    const { source, colOrIdx, count } = pendingDrag;
    pendingDrag = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup',   onDragEnd);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend',  onTouchEnd);
    smartMove(source, colOrIdx, count);
    return;
  }
  endDrag(document.elementFromPoint(t.clientX, t.clientY));
}

function onDragEnd(e) { endDrag(e.target); }

function endDrag(targetEl) {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);
  document.removeEventListener('touchmove', onTouchMove);
  document.removeEventListener('touchend',  onTouchEnd);

  pendingDrag = null; // discard if it was just a click

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

    saveUndoState();
    removeFromSource(source, colOrIdx, count);
    state.foundations[fi].push(card);
    recordMove();
    const flipped1 = flipTopTableau();
    render();
    checkWin();
    checkAutoComplete();
    playSound(flipped1 ? 'flip' : 'place');

  } else if (pile.type === 'tableau') {
    const destCol = parseInt(pile.el.dataset.col);
    const destCards = state.tableau[destCol];
    const topCard = destCards.length > 0 ? destCards[destCards.length - 1] : null;

    if (!canStackOnTableau(card, topCard)) { render(); return; }

    saveUndoState();
    removeFromSource(source, colOrIdx, count);
    state.tableau[destCol].push(...cards);
    recordMove();
    const flipped2 = flipTopTableau();
    render();
    checkWin();
    checkAutoComplete();
    playSound(flipped2 ? 'flip' : 'place');
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
    saveUndoState();
    const toDraw = Math.min(drawCount, state.stock.length);
    for (let i = 0; i < toDraw; i++) {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
    }
    playSound('draw');
  } else {
    if (hardMode && state.stockPasses >= MAX_STOCK_PASSES) return;
    saveUndoState();
    state.stock = state.waste.slice().reverse().map(c => ({ ...c, faceUp: false }));
    state.waste = [];
    if (hardMode) state.stockPasses++;
    playSound('draw');
  }
  recordMove();
  render();
  checkAutoComplete();
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
  const nameEl = document.getElementById('player-name');
  const savedName = localStorage.getItem('solitaire-name');
  if (savedName) nameEl.value = savedName;
  nameEl.focus();

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

document.getElementById('btn-undo').addEventListener('click', undo);

/* ─── Hard mode toggle ──────────────────────────────────────── */
function updateHardModeUI() {
  document.documentElement.classList.toggle('hard-mode', hardMode);
  const btn = document.getElementById('btn-hard-mode');
  if (btn) btn.classList.toggle('hard-active', hardMode);
}

function toggleHardMode() {
  hardMode = !hardMode;
  localStorage.setItem('solitaire-hard', hardMode);
  updateHardModeUI();
  newGame();
}

document.getElementById('btn-hard-mode').addEventListener('click', toggleHardMode);

/* ─── Draw count toggle ─────────────────────────────────────── */
function updateDrawUI() {
  document.documentElement.classList.toggle('draw-one', drawCount === 1);
  const btn = document.getElementById('btn-draw-toggle');
  if (btn) {
    btn.textContent = drawCount === 1 ? 'Draw 1' : 'Draw 3';
    btn.classList.toggle('draw-one', drawCount === 1);
  }
}

function toggleDraw() {
  drawCount = drawCount === 3 ? 1 : 3;
  localStorage.setItem('solitaire-draw', drawCount);
  updateDrawUI();
  newGame();
}

document.getElementById('btn-draw-toggle').addEventListener('click', toggleDraw);

/* ─── Sound toggle ──────────────────────────────────────────── */
function updateSoundUI() {
  const btn = document.getElementById('btn-sound');
  if (btn) {
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabled);
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('solitaire-sound', soundEnabled);
  updateSoundUI();
}

document.getElementById('btn-sound').addEventListener('click', toggleSound);

/* ─── Boot ──────────────────────────────────────────────────── */
setupDropZones();
updateHardModeUI();
updateDrawUI();
updateSoundUI();
newGame();
