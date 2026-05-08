import { LEVELS, LEVEL_ORDER } from './jumble-words.js';

const $ = id => document.getElementById(id);

const state = {
  levelKey: 'easy',
  streak: 0,
  score: 0,
  usedIndexes: [],
  hints: 5,
  scrambled: [],
  answer: [],
  checked: false,
  currentWord: null,
};

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
  $('category').textContent = state.currentWord.category;
  $('hint-area').innerHTML = '';
  setFeedback('', '');
  $('level-banner').innerHTML = '';
  $('btn-check').disabled = false;
  $('btn-hint').disabled = false;
  renderStreakPips();
  renderTiles();
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
  if (state.hints <= 0 || state.checked) return;
  state.hints--;
  $('hints-left').textContent = state.hints;
  $('hint-area').innerHTML = `<span class="hint-chip">${state.currentWord.hint}</span>`;
}

function checkAnswer() {
  if (state.answer.includes(null)) { setFeedback('Fill all the letters first!', 'warning'); return; }
  const guess = state.answer.map(i => state.scrambled[i].l).join('');
  state.checked = true;
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
        setFeedback(`+${pts} pts`, 'success');
        showBanner(`You completed all levels! Final score: ${state.score}`, true);
        $('btn-check').disabled = true;
        $('btn-hint').disabled = true;
      } else {
        setFeedback(`+${pts} pts`, 'success');
        setTimeout(() => advanceLevel(nextIdx), 900);
      }
    } else {
      setFeedback(`Correct! +${pts} pts`, 'success');
      setTimeout(loadWord, 1100);
    }
  } else {
    state.streak = 0;
    renderStreakPips();
    Array.from(slots).forEach(s => s.className = 'tile wrong');
    setFeedback('Not quite — streak reset!', 'danger');
    setTimeout(() => {
      state.checked = false;
      state.answer = Array(state.currentWord.word.length).fill(null);
      state.scrambled.forEach(t => t.used = false);
      renderTiles();
      setFeedback('', '');
    }, 1000);
  }
}

function advanceLevel(nextIdx) {
  state.levelKey = LEVEL_ORDER[nextIdx];
  state.streak = 0;
  state.usedIndexes = [];
  state.hints = getLevelData().hints;
  $('hints-left').textContent = state.hints;
  renderLevelBadge();
  showBanner(`Level up! Welcome to ${getLevelData().label}`, false);
  setTimeout(loadWord, 2000);
}

function showBanner(msg, isFinal) {
  $('level-banner').innerHTML = `
    <div class="level-up-banner">
      ${msg}
      ${isFinal ? '<br><br><button class="primary" id="btn-restart">Play again</button>' : ''}
    </div>`;
  if (isFinal) $('btn-restart').onclick = restartGame;
}

function restartGame() {
  Object.assign(state, { levelKey: 'easy', streak: 0, score: 0, usedIndexes: [], hints: 5, checked: false });
  $('score').textContent = '0';
  $('hints-left').textContent = '5';
  renderLevelBadge();
  loadWord();
}

function setFeedback(msg, type) {
  const el = $('feedback');
  el.textContent = msg;
  el.className = `feedback${type ? ' ' + type : ''}`;
}

$('btn-check').onclick = checkAnswer;
$('btn-clear').onclick = clearAnswer;
$('btn-hint').onclick = useHint;

renderLevelBadge();
loadWord();
