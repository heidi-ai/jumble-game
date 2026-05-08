# Jumble Word Game

A browser-based word unscrambling game with three difficulty levels, a streak system, and hints.

## How to play

1. A scrambled word and its **category** are shown.
2. Click the scrambled letter tiles to build your answer in the slots above.
3. Click a filled slot to send a letter back to the pool.
4. Hit **Check** to submit. Correct answers earn points; wrong answers reset your streak.
5. Use **Hint** to reveal a clue (limited per level).
6. **Streak up 10 correct answers in a row** to advance to the next level.

## Levels

| Level | Points per word | Hints |
|-------|----------------|-------|
| Easy | 10 | 5 |
| Medium | 20 | 4 |
| Hard | 30 | 3 |

## Running locally

```bash
cd jumble-game
npx vite
```

Then open `http://localhost:5173` in your browser.

## Project structure

```
jumble-game/
├── index.html       # Game UI
├── main.js          # Game logic
├── jumble-words.js  # Word bank (Easy / Medium / Hard)
└── style.css        # Styles
```
