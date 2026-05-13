import { LEVELS, LEVEL_ORDER } from './jumble-words.js';

const $ = id => document.getElementById(id);

const HINTS_START = 5;
const HINT_COST = 5;
const HINT_BONUS = 100;
const STORAGE_KEY = 'jumble-highscores';

const state = {
  levelKey: 'easy',
  streak: 0,
  score: 0,
  usedIndexes: [],
  hints: HINTS_START,
  scrambled: [],
  answer: [],
  checked: false,
  hintUsed: false,
  currentWord: null,
};

// ── High scores ──────────────────────────────────────────────────────────────

function loadHighScores() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveHighScore(initials, score) {
  const scores = loadHighScores();
  scores.push({
    initials: initials.toUpperCase().padEnd(3, ' ').slice(0, 3),
    score,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  });
  scores.sort((a, b) => b.score - a.score);
  const top3 = scores.slice(0, 3);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(top3));
  return top3;
}

function renderLeaderboard() {
  const scores = loadHighScores();
  const el = $('leaderboard-list');
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
  let available = words.map((_, i) => i).filter(i => !state.usedIndexes.includes(i));
  if (!available.length) { state.usedIndexes = []; available = words.map((_, i) => i); }
  const idx = available[Math.floor(Math.random() * available.length)];
  state.usedIndexes.push(idx);
  return words[idx];
}

function loadWord() {
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
  renderStreakPips();
  renderTiles();
  updateHintButtons();
}

function renderLevelBadge() {
  const lvl = getLevelData();
  $('level-badge').innerHTML = `<span class="level-badge ${lvl.badgeClass}">${lvl.label}</span>`;
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
  $('btn-buy-hint').disabled = state.score < HINT_COST || state.checked;
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
  if (state.score < HINT_COST || state.checked) return;
  state.score -= HINT_COST;
  state.hints++;
  $('score').textContent = state.score;
  $('hints-left').textContent = state.hints;
  setFeedback(`Hint purchased! −${HINT_COST} pts`, 'warning');
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
      setTimeout(loadWord, 1100);
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
  state.usedIndexes = [];
  renderLevelBadge();
  showBanner(`Level up! Welcome to ${getLevelData().label}`, false);
  setTimeout(loadWord, 2000);
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

  function submit() {
    const initials = input.value.trim();
    if (!initials) return;
    saveHighScore(initials, finalScore);
    renderLeaderboard();
    showFinalBanner(hintBonus, finalScore);
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
  Object.assign(state, { levelKey: 'easy', streak: 0, score: 0, usedIndexes: [], hints: HINTS_START, checked: false });
  $('score').textContent = '0';
  $('hints-left').textContent = HINTS_START;
  renderLevelBadge();
  loadWord();
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
loadWord();
