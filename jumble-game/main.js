import { LEVELS, LEVEL_ORDER } from './jumble-words.js';

const $ = id => document.getElementById(id);

const HINTS_START = 5;
const HINT_COST = 5;
const HINT_BONUS = 100;
const LEVEL_TIME = 5 * 60; // 5 minutes in seconds

const SUPABASE_URL = 'https://ueaovkskozkglwlvrbwx.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VEkT1kNKr2Ajuh7BOmZJ6w_1L8YWGaL';

const state = {
  levelKey: 'easy',
  streak: 0,
  score: 0,
  hints: HINTS_START,
  scrambled: [],
  answer: [],
  checked: false,
  hintUsed: false,
  currentWord: null,
  timerSeconds: LEVEL_TIME,
  timerInterval: null,
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

const sbHeaders = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function fetchHighScores() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scores?select=initials,score,date&order=score.desc&limit=10`,
      { headers: sbHeaders }
    );
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return [];
  }
}

async function insertHighScore(initials, score) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      initials: initials.toUpperCase().padEnd(3, ' ').slice(0, 3),
      score,
      date,
    }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
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
  $('category').textContent = state.currentWord.category;
  $('hint-area').innerHTML = '';
  setFeedback('', '');
  $('level-banner').innerHTML = '';
  $('btn-check').disabled = false;
  if (resetTimer) startTimer();
  renderStreakPips();
  renderTiles();
  updateHintButtons();
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
  state.timerSeconds = LEVEL_TIME;
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

function renderStreakPips() {
  $('streak-pips').innerHTML = Array.from({ length: 10 }, (_, i) =>
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
    if (state.streak >= 10) {
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
        setFeedback(`+${pts} pts`, 'success');
        setTimeout(() => advanceLevel(nextIdx), 900);
      }
    } else {
      setFeedback(`Correct! +${pts} pts`, 'success');
      setTimeout(() => loadWord(false), 1100);
    }
  } else {
    Array.from(slots).forEach(s => s.className = 'tile wrong');
    setFeedback('Not quite — try again!', 'danger');
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

function advanceLevel(nextIdx) {
  state.levelKey = LEVEL_ORDER[nextIdx];
  state.streak = 0;
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
  Object.assign(state, { levelKey: 'easy', streak: 0, score: 0, hints: HINTS_START, checked: false });
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

renderLevelBadge();
renderLeaderboard();
loadWord(true);
