# Jumble Word Game

A browser-based word unscrambling game with three difficulty levels, a countdown timer, lives, hints, and a live global leaderboard.

**Live game:** [heidi-ai.github.io/jumble-game](https://heidi-ai.github.io/jumble-game/)

---

## How to Play

1. Hit **▶ Start** to begin — this starts the 3-minute countdown timer
2. Unscramble the letters to spell the hidden word
3. Use the letter tiles to build your answer, then press **Check**
4. Advance through Easy → Medium → Hard by getting **10 correct in a row** per level
5. When the game ends, enter your initials to save your score to the leaderboard

### Scoring
| Action | Points |
|--------|--------|
| Correct answer | 10 pts × streak multiplier |
| Hint bonus | +100 pts per unused free hint at end of game |
| Buying a hint | −5 pts |

### Lives & Timer
- You have **3 lives** — each wrong answer costs one
- Each level has a **3-minute timer** — running out ends the game
- Pausing stops the timer and hides the clue

---

## Project Structure

```
jumble-game/
├── jumble-game/          ← Source code (edit these files)
│   ├── index.html        ← Page layout and structure
│   ├── main.js           ← All game logic
│   ├── style.css         ← All visual styling
│   ├── logo.svg          ← Tile-style logo (JMBLE + floating U)
│   ├── favicon.svg       ← J-tile browser tab icon
│   ├── jumble-words.js   ← Word list and categories by level
│   ├── vite.config.js    ← Build configuration
│   └── .env.local        ← Local secrets (gitignored, never committed)
├── .github/workflows/
│   └── deploy.yml        ← Auto-deploys to GitHub Pages on every push to main
├── dist/                 ← Built output (auto-generated, don't edit)
└── README.md             ← This file
```

---

## How the Code Works

### Game Logic (`main.js`)

The entire game runs from a single **state object** that tracks everything:

```js
const state = {
  levelKey: 'easy',        // current level: 'easy' | 'medium' | 'hard'
  streak: 0,               // correct answers in a row (need 10 to advance)
  score: 0,                // running score
  hints: 5,                // free hints remaining
  lives: 3,                // wrong guesses remaining
  scrambled: [],           // letter tiles (each has a .used flag)
  answer: [],              // slots the player is filling in
  checked: false,          // whether current answer has been checked
  hintUsed: false,         // whether a hint was used on this word
  currentWord: null,       // the word object being played
  timerSeconds: 180,       // countdown (3 min = 180 seconds)
  timerInterval: null,     // reference to the timer so it can be stopped
  paused: false,           // whether game is paused
  pendingTimerReset: false // true when a new word needs a fresh timer start
};
```

**Key functions:**
- `loadWord()` — picks a random unused word for the current level and sets up tiles
- `startTimer()` — begins the 3-minute countdown; turns red at 60 seconds
- `stopTimer()` — pauses or stops the countdown
- `checkAnswer()` — compares player's answer to the correct word, updates score and lives
- `showOverlay(message)` — displays the start/pause screen over the game
- `startGame()` — hides the overlay and starts the timer
- `togglePause()` — pauses the timer and hides the clue
- `showGameOver()` — shows the 💀 Game Over screen with score save form
- `showTimerGameOver()` — shows the ⏱️ Time's Up screen with score save form
- `restartGame()` — resets everything and starts fresh

### Word List (`jumble-words.js`)

Words are organized into three levels. Each word has:
- The answer word
- A category (shown as the clue)
- Optional hint text

### Styling (`style.css`)

Uses **CSS custom properties** (variables) for theming, with automatic dark mode support:
```css
:root { --bg: #fff; --text: #111; ... }
@media (prefers-color-scheme: dark) { :root { --bg: #1a1a1a; ... } }
```

The tile-inspired design gives buttons, stat chips, and letter tiles a consistent look with subtle borders, shadows, and a slight press animation when clicked.

---

## Leaderboard (Turso Database)

Scores are saved to a **Turso** database — a free SQLite-based cloud database that never pauses for inactivity.

**Dashboard:** [turso.tech](https://turso.tech)  
**Database:** `jumble-game-heididean`  
**Table:** `scores` with columns: `id`, `initials`, `score`, `date`, `created_at`

To manually view or manage scores, log in at Turso and use the query shell:

```sql
-- View all scores
SELECT * FROM scores ORDER BY score DESC;

-- Add a score manually
INSERT INTO scores (initials, score, date) VALUES ('HD', 500, 'Jul 22, 2026');

-- Delete a score by ID
DELETE FROM scores WHERE id = 1;
```

### Auth token

The database auth token is stored as a **GitHub Actions secret** (`TURSO_TOKEN`) and injected at build time — it is never stored in the source code. For local development, add it to `jumble-game/.env.local`.

If the token needs to be rotated (e.g. for security reasons):
1. Generate a new token in the Turso dashboard
2. Update the `TURSO_TOKEN` secret in [GitHub repo settings](https://github.com/heidi-ai/jumble-game/settings/secrets/actions)
3. Update `jumble-game/.env.local` on your local machine
4. Push any change to `main` to trigger a fresh deployment with the new token

> **Note:** The previous database was Supabase, which was retired because its free tier pauses after inactivity.

---

## Local Development

To run the game on your computer, first create a local secrets file:

```
jumble-game/.env.local
```

Add this line (get the token value from the GitHub repository secret or Turso dashboard):
```
VITE_TURSO_TOKEN=your-token-here
```

Then start the dev server:

```bash
cd jumble-game
npx vite --port 5173
```

Open [localhost:5173/jumble-game/](http://localhost:5173/jumble-game/) in your browser. Changes to source files update live automatically.

> **Note:** `.env.local` is gitignored and will never be committed — keep your token there, not in the source code.

---

## Deploying to GitHub Pages

Deployment is **automatic** — just push to `main` and GitHub Actions handles the rest:

```bash
git push origin main
```

The workflow (`.github/workflows/deploy.yml`) will:
1. Install dependencies
2. Build the project (injecting the `TURSO_TOKEN` secret)
3. Deploy the built files to the `gh-pages` branch

The live site updates within a minute or two of pushing.

> **Important:** The repository must remain **public** for GitHub Pages to work on the free plan. Making it private will take the site offline.

---

## Feature History

| Branch | Feature |
|--------|---------|
| `3_lives` | 3 lives system — 3 wrong guesses ends the game |
| `timer` | 3-minute countdown per level — running out ends the game |
| `start-and-pause` | Start overlay hides the first clue; Pause stops timer and hides clue |
| `ui-enhancements` | Tile-inspired UI redesign + JMBLE logo |
| `main` | Leaderboard migrated from Supabase → Turso |
| `main` | Turso auth token moved to GitHub secret |
| `main` | J-tile favicon added |
| `main` | Auto-deploy via GitHub Actions added |
