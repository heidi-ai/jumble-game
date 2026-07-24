import { LEVELS, LEVEL_ORDER } from './jumble-words.js';

const $ = id => document.getElementById(id);

const HINTS_START = 5;
const SKIPS_START = 2;
const LIVES_START = 3;
const HINT_COST = 5;
const HINT_BONUS = 100;
const LEVEL_TIME = { easy: 2 * 60, medium: 3 * 60, hard: 4 * 60 };

// Supabase retired — now using Turso

const TURSO_URL = 'https://jumble-game-heididean.aws-us-west-2.turso.io';
const TURSO_TOKEN = import.meta.env.VITE_TURSO_TOKEN;

const state = {
  levelKey: 'easy',
  streak: 0,
  score: 0,
  hints: HINTS_START,
  skips: SKIPS_START,
  lives: LIVES_START,
  scrambled: [],
  answer: [],
  checked: false,
  hintUsed: false,
  currentWord: null,
  timerSeconds: LEVEL_TIME.easy,
  timerInterval: null,
  paused: false,
  pendingTimerReset: false,
};

const USED_KEY = 'jumble-used';
function getUsed(levelKey) {
  try { return JSON.parse(localStorage.getItem(`${USED_KEY}-${levelKey}`)) || []; }
  catch { return []; }
}
function setUsed(levelKey, arr) {
  try { localStorage.setItem(`${USED_KEY}-${levelKey}`, JSON.stringify(arr)); }
  catch {}
}

// ── High scores ──────────────────────────────────────────────────────────────

const tursoHeaders = {
  'Authorization': `Bearer ${TURSO_TOKEN}`,
  'Content-Type': 'application/json',
};

async function tursoQuery(sql, args = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: tursoHeaders,
    body: JSON.stringify({
      requests: [{ type: 'execute', stmt: { sql, args } }],
    }),
  });
  if (!res.ok) throw new Error(`Turso error (${res.status})`);
  const data = await res.json();
  return data.results[0].response.result;
}

async function fetchHighScores() {
  try {
    const result = await tursoQuery(
      'SELECT initials, score, date FROM scores ORDER BY score DESC LIMIT 10'
    );
    return result.rows.map(row => ({
      initials: row[0].value,
      score: Number(row[1].value),
      date: row[2].value,
    }));
  } catch {
    return [];
  }
}

async function insertHighScore(initials, score) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  await tursoQuery(
    'INSERT INTO scores (initials, score, date) VALUES (?, ?, ?)',
    [
      { type: 'text', value: initials.toUpperCase().padEnd(3, ' ').slice(0, 3) },
      { type: 'integer', value: String(score) },
      { type: 'text', value: date },
    ]
  );
}

async function renderLeaderboard() {
  const el = $('leaderboard-list');
  el.innerHTML = '<div class="lb-empty">Loading…</div>';
  const scores = await fetchHighScores();
  if (!scores.length) {
    el.innerHTML = '<div class="lb-empty">No scores yet — finish all three levels!</div>';
    return;
  }
  el.innerHTML = scores.map((s, i) => `
    <div class="lb-row">
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-initials">${s.initials}</span>
      <span class="lb-score">${s.score.toLocaleString()}</span>
      <span class="lb-date">${s.date}</span>
    </div>
  `).join('');
}

// ── Core game ─────────────────────────────────────────────────────────────────

function getLevelData() { return LEVELS[state.levelKey]; }

function scramble(word) {
  const a = word.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.join('') === word ? scramble(word) : a;
}

function pickWord() {
  const words = getLevelData().words;
  let used = getUsed(state.levelKey);
  let available = words.map((_, i) => i).filter(i => !used.includes(i));
  if (!available.length) { used = []; available = words.map((_, i) => i); }
  const idx = available[Math.floor(Math.random() * available.length)];
  setUsed(state.levelKey, [...used, idx]);
  return words[idx];
}

function loadWord(resetTimer = false) {
  state.currentWord = pickWord();
  state.scrambled = scramble(state.currentWord.word).map((l, i) => ({ l, id: i, used: false }));
  state.answer = Array(state.currentWord.word.length).fill(null);
  state.checked = false;
  state.hintUsed = false;
  state.paused = false;
  $('category').textContent = state.currentWord.category;
  $('hint-area').innerHTML = '';
  setFeedback('', '');
  $('level-banner').innerHTML = '';
  $('btn-check').disabled = false;
  $('btn-pause').disabled = false;
  $('btn-pause').textContent = '⏸ Pause';
  renderStreakPips();
  renderLives();
  renderSkips();
  renderTiles();
  updateHintButtons();
  if (resetTimer) {
    state.pendingTimerReset = true;
    showOverlay('Ready?');
  } else {
    hideOverlay();
  }
}

function renderLevelBadge() {
  const lvl = getLevelData();
  $('level-badge').innerHTML = `<span class="level-badge ${lvl.badgeClass}">${lvl.label}</span>`;
}

function renderTimer() {
  const m = Math.floor(state.timerSeconds / 60);
  const s = state.timerSeconds % 60;
  const el = $('timer-display');
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.style.color = state.timerSeconds <= 60 ? 'var(--red)' : '';
}

function startTimer() {
  stopTimer();
  state.timerSeconds = LEVEL_TIME[state.levelKey];
  renderTimer();
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    renderTimer();
    if (state.timerSeconds <= 0) {
      stopTimer();
      setFeedback("Time's up — game over!", 'danger');
      $('btn-check').disabled = true;
      $('btn-hint').disabled = true;
      $('btn-buy-hint').disabled = true;
      setTimeout(() => showTimerGameOver(), 1000);
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function showOverlay(message) {
  $('overlay-message').textContent = message;
  $('btn-start').textContent = '▶ Start';
  $('game-overlay').classList.add('visible');
  $('btn-pause').disabled = true;
}

function hideOverlay() {
  $('game-overlay').classList.remove('visible');
  $('btn-pause').disabled = false;
}

function startGame() {
  hideOverlay();
  if (state.pendingTimerReset) {
    state.pendingTimerReset = false;
    startTimer();
  } else {
    // resuming from pause — just restart the interval
    state.timerInterval = setInterval(() => {
      state.timerSeconds--;
      renderTimer();
      if (state.timerSeconds <= 0) {
        stopTimer();
        setFeedback("Time's up — game over!", 'danger');
        $('btn-check').disabled = true;
        $('btn-hint').disabled = true;
        $('btn-buy-hint').disabled = true;
        setTimeout(() => showTimerGameOver(), 1000);
      }
    }, 1000);
  }
  state.paused = false;
  $('btn-pause').textContent = '⏸ Pause';
}

function togglePause() {
  if (state.paused) {
    startGame();
  } else {
    stopTimer();
    state.paused = true;
    $('btn-pause').textContent = '▶ Resume';
    $('overlay-message').textContent = 'Game paused';
    $('btn-start').textContent = '▶ Resume';
    $('game-overlay').classList.add('visible');
  }
}

function showTimerGameOver() {
  $('level-banner').innerHTML = `
    <div class="level-up-banner">
      ⏱️ Time's Up!<br><br>
      You ran out of time.<br><br>
      Final score: <strong>${state.score.toLocaleString()}</strong><br><br>
      <div class="initials-form">
        <input id="initials-input" class="initials-input" maxlength="3" placeholder="AAA" autocomplete="off" spellcheck="false" />
        <button class="primary" id="btn-save-score">Save score</button>
      </div>
      <div id="save-error" style="font-size:13px;color:var(--red);margin-top:8px;"></div>
    </div>`;

  const input = $('initials-input');
  const saveBtn = $('btn-save-score');
  input.focus();

  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    saveBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  saveBtn.disabled = true;
  saveBtn.onclick = submit;

  async function submit() {
    const initials = input.value.trim();
    if (!initials) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await insertHighScore(initials, state.score);
      await renderLeaderboard();
      $('level-banner').innerHTML = `
        <div class="level-up-banner">
          ⏱️ Time's Up!<br><br>
          Final score: <strong>${state.score.toLocaleString()}</strong>
          <br><br><button class="primary" id="btn-restart">Play again</button>
        </div>`;
      $('btn-restart').onclick = restartGame;
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save score';
      const errEl = $('save-error');
      if (errEl) errEl.textContent = 'Save failed — please try again.';
    }
  }
}

function renderLives() {
  const hearts = Array.from({ length: LIVES_START }, (_, i) =>
    i < state.lives ? '❤️' : '🖤'
  ).join('');
  $('lives-display').textContent = hearts;
}

function renderStreakPips() {
  $('streak-pips').innerHTML = Array.from({ length: 5 }, (_, i) =>
    `<div class="pip${i < state.streak ? ' done' : ''}"></div>`
  ).join('');
}

function renderTiles() {
  const tilesEl = $('letter-tiles');
  const slotsEl = $('answer-slots');
  tilesEl.innerHTML = '';
  slotsEl.innerHTML = '';

  state.scrambled.forEach((t, i) => {
    if (t.used) return;
    const el = document.createElement('div');
    el.className = 'tile';
    el.textContent = t.l;
    el.onclick = () => placeLetter(i);
    tilesEl.appendChild(el);
  });

  state.answer.forEach((t, i) => {
    const el = document.createElement('div');
    if (t !== null) {
      el.className = 'tile slot filled';
      el.textContent = state.scrambled[t].l;
      el.onclick = () => removeLetter(i);
    } else {
      el.className = 'slot';
    }
    slotsEl.appendChild(el);
  });
}

function updateHintButtons() {
  $('btn-hint').disabled = state.hints <= 0 || state.checked || state.hintUsed;
  $('btn-buy-hint').disabled = state.hints > 0 || state.score < HINT_COST || state.checked || state.hintUsed;
}

function renderSkips() {
  $('skips-left').textContent = `${state.skips} skip${state.skips !== 1 ? 's' : ''} left`;
  $('btn-skip').disabled = state.skips <= 0 || state.paused;
}

function skipWord() {
  if (state.skips <= 0 || state.paused) return;
  state.skips--;
  renderSkips();
  setFeedback('Word skipped!', '');
  setTimeout(() => loadWord(false), 800);
}

function shuffleTiles() {
  if (state.checked) return;
  const oldScrambled = [...state.scrambled];
  const arr = [...state.scrambled];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  state.scrambled = arr;
  state.answer = state.answer.map(oldIdx =>
    oldIdx === null ? null : state.scrambled.indexOf(oldScrambled[oldIdx])
  );
  renderTiles();
}

function placeLetter(tileIdx) {
  if (state.checked) return;
  const slot = state.answer.indexOf(null);
  if (slot === -1) return;
  state.answer[slot] = tileIdx;
  state.scrambled[tileIdx].used = true;
  renderTiles();
}

function removeLetter(slotIdx) {
  if (state.checked) return;
  const tileIdx = state.answer[slotIdx];
  if (tileIdx === null) return;
  state.scrambled[tileIdx].used = false;
  state.answer[slotIdx] = null;
  renderTiles();
}

function clearAnswer() {
  if (state.checked) return;
  state.answer.forEach(t => { if (t !== null) state.scrambled[t].used = false; });
  state.answer = Array(state.currentWord.word.length).fill(null);
  renderTiles();
}

function useHint() {
  if (state.hints <= 0 || state.checked || state.hintUsed) return;
  state.hints--;
  state.hintUsed = true;
  $('hints-left').textContent = state.hints;
  $('hint-area').innerHTML = `<span class="hint-chip">${state.currentWord.hint}</span>`;
  updateHintButtons();
}

function buyHint() {
  if (state.hints > 0 || state.score < HINT_COST || state.checked || state.hintUsed) return;
  state.score -= HINT_COST;
  state.hintUsed = true;
  $('score').textContent = state.score;
  $('hint-area').innerHTML = `<span class="hint-chip">${state.currentWord.hint}</span>`;
  setFeedback(`Hint applied! −${HINT_COST} pts`, 'warning');
  updateHintButtons();
}

function checkAnswer() {
  if (state.paused) return;
  if (state.answer.includes(null)) { setFeedback('Fill all the letters first!', 'warning'); return; }
  const guess = state.answer.map(i => state.scrambled[i].l).join('');
  state.checked = true;
  updateHintButtons();
  const slots = $('answer-slots').children;

  if (guess === state.currentWord.word) {
    const pts = getLevelData().points;
    state.score += pts;
    state.streak++;
    $('score').textContent = state.score;
    Array.from(slots).forEach(s => s.className = 'tile correct');
    renderStreakPips();

    const nextIdx = LEVEL_ORDER.indexOf(state.levelKey) + 1;
    if (state.streak >= 5) {
      if (nextIdx >= LEVEL_ORDER.length) {
        const hintBonus = state.hints * HINT_BONUS;
        state.score += hintBonus;
        $('score').textContent = state.score;
        stopTimer();
        $('btn-check').disabled = true;
        $('btn-hint').disabled = true;
        $('btn-buy-hint').disabled = true;
        setFeedback(`+${pts} pts`, 'success');
        setTimeout(() => showInitialsPrompt(state.score, hintBonus), 900);
      } else {
        stopTimer();
        setFeedback(`+${pts} pts`, 'success');
        setTimeout(() => advanceLevel(nextIdx), 900);
      }
    } else {
      setFeedback(`Correct! +${pts} pts`, 'success');
      setTimeout(() => loadWord(false), 1100);
    }
  } else {
    state.lives--;
    renderLives();
    Array.from(slots).forEach(s => s.className = 'tile wrong');

    if (state.lives <= 0) {
      stopTimer();
      setFeedback('No lives left — game over!', 'danger');
      $('btn-check').disabled = true;
      $('btn-hint').disabled = true;
      $('btn-buy-hint').disabled = true;
      setTimeout(() => showGameOver(), 1000);
    } else {
      setFeedback(`Wrong! ${state.lives} ${state.lives === 1 ? 'life' : 'lives'} remaining`, 'danger');
      setTimeout(() => {
        state.checked = false;
        state.answer = Array(state.currentWord.word.length).fill(null);
        state.scrambled.forEach(t => t.used = false);
        renderTiles();
        setFeedback('', '');
        updateHintButtons();
      }, 1000);
    }
  }
}

function showGameOver() {
  $('level-banner').innerHTML = `
    <div class="level-up-banner">
      💀 Game Over!<br><br>
      You ran out of lives.<br><br>
      Final score: <strong>${state.score.toLocaleString()}</strong><br><br>
      <div class="initials-form">
        <input id="initials-input" class="initials-input" maxlength="3" placeholder="AAA" autocomplete="off" spellcheck="false" />
        <button class="primary" id="btn-save-score">Save score</button>
      </div>
      <div id="save-error" style="font-size:13px;color:var(--red);margin-top:8px;"></div>
    </div>`;

  const input = $('initials-input');
  const saveBtn = $('btn-save-score');
  input.focus();

  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    saveBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  saveBtn.disabled = true;
  saveBtn.onclick = submit;

  async function submit() {
    const initials = input.value.trim();
    if (!initials) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await insertHighScore(initials, state.score);
      await renderLeaderboard();
      $('level-banner').innerHTML = `
        <div class="level-up-banner">
          💀 Game Over!<br><br>
          Final score: <strong>${state.score.toLocaleString()}</strong>
          <br><br><button class="primary" id="btn-restart">Play again</button>
        </div>`;
      $('btn-restart').onclick = restartGame;
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save score';
      const errEl = $('save-error');
      if (errEl) errEl.textContent = 'Save failed — please try again.';
    }
  }
}

function advanceLevel(nextIdx) {
  state.levelKey = LEVEL_ORDER[nextIdx];
  state.streak = 0;
  state.timerSeconds = LEVEL_TIME[state.levelKey];
  renderTimer();
  renderLevelBadge();
  showBanner(`Level up! Welcome to ${getLevelData().label}`, false);
  setTimeout(() => loadWord(true), 2000);
}

// ── End-game flow ─────────────────────────────────────────────────────────────

function showInitialsPrompt(finalScore, hintBonus) {
  $('level-banner').innerHTML = `
    <div class="level-up-banner">
      You completed all levels!<br><br>
      ${hintBonus > 0
        ? `<span style="font-size:14px;opacity:0.8">${state.hints} unused hint${state.hints !== 1 ? 's' : ''} × ${HINT_BONUS} pts = +${hintBonus} bonus</span><br><br>`
        : ''}
      Final score: <strong>${finalScore.toLocaleString()}</strong><br><br>
      <div class="initials-form">
        <input id="initials-input" class="initials-input" maxlength="3" placeholder="AAA" autocomplete="off" spellcheck="false" />
        <button class="primary" id="btn-save-score">Save score</button>
      </div>
      <div id="save-error" style="font-size:13px;color:var(--red);margin-top:8px;"></div>
    </div>`;

  const input = $('initials-input');
  const saveBtn = $('btn-save-score');
  input.focus();

  input.addEventListener('input', () => {
    input.value = input.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
    saveBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  saveBtn.disabled = true;
  saveBtn.onclick = submit;

  async function submit() {
    const initials = input.value.trim();
    if (!initials) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      await insertHighScore(initials, finalScore);
      await renderLeaderboard();
      showFinalBanner(hintBonus, finalScore);
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save score';
      const errEl = $('save-error');
      if (errEl) errEl.textContent = 'Save failed — please try again.';
    }
  }
}

function showFinalBanner(hintBonus, finalScore) {
  $('level-banner').innerHTML = `
    <div class="level-up-banner">
      You completed all levels!<br><br>
      ${hintBonus > 0
        ? `<span style="font-size:14px;opacity:0.8">${state.hints} unused hint${state.hints !== 1 ? 's' : ''} × ${HINT_BONUS} pts = +${hintBonus} bonus</span><br><br>`
        : ''}
      Final score: <strong>${finalScore.toLocaleString()}</strong>
      <br><br><button class="primary" id="btn-restart">Play again</button>
    </div>`;
  $('btn-restart').onclick = restartGame;
}

function showBanner(msg) {
  $('level-banner').innerHTML = `<div class="level-up-banner">${msg}</div>`;
}

function restartGame() {
  Object.assign(state, { levelKey: 'easy', streak: 0, score: 0, hints: HINTS_START, skips: SKIPS_START, lives: LIVES_START, checked: false, paused: false, pendingTimerReset: false });
  $('score').textContent = '0';
  $('hints-left').textContent = HINTS_START;
  renderLevelBadge();
  loadWord(true);
}

function setFeedback(msg, type) {
  const el = $('feedback');
  el.textContent = msg;
  el.className = `feedback${type ? ' ' + type : ''}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

$('btn-check').onclick = checkAnswer;
$('btn-clear').onclick = clearAnswer;
$('btn-hint').onclick = useHint;
$('btn-buy-hint').onclick = buyHint;
$('btn-shuffle').onclick = shuffleTiles;
$('btn-skip').onclick = skipWord;
$('btn-start').onclick = startGame;
$('btn-pause').onclick = togglePause;

renderLevelBadge();
renderLeaderboard();
loadWord(true);
