# Adaptive Timer Scaling Design

## Problem

The game timer currently caps at 600s (10:00) with 5 hardcoded presets and a hand-tuned recommendation table that flatlines at 6+ players. For larger lobbies (7-20 players), the timer halving mechanic (each player's first submission halves the remaining time, floor 10s) means the starting timer needs to scale higher to give everyone adequate thinking time.

## Solution: Formula-Driven Adaptive Timer (Approach A)

Replace the hardcoded lookup table and fixed presets with a formula-driven system that scales to any lobby size.

### Core Formula

```js
recommended(N) = clamp(75, 1800, round_to_15(20 * N ^ 1.9))
```

This closely matches existing hand-tuned values for 2-6 players and extends smoothly:

| Players | Current | Formula |
|---------|---------|---------|
| 1-2     | 1:15    | 1:15    |
| 3       | 3:00    | 2:45    |
| 4       | 5:00    | 4:45    |
| 5       | 8:00    | 7:00    |
| 6       | 10:00   | 10:00   |
| 7       | -       | 13:30   |
| 8       | -       | 17:15   |
| 10      | -       | 26:30   |
| 11+     | -       | 30:00 (cap) |

### Dynamic Maximum

Instead of a fixed 600s max:

```
maxTimer(N) = min(3600, round_to_15(recommended(N) * 2))
```

Allows the host to go up to 2x the recommended time, capped at 1 hour.

### Dynamic Step Size

Stepping ±15s is appropriate for short timers but tedious for 20+ minute timers:

- Timer < 300s (5:00): ±15s
- Timer 300-600s: ±30s
- Timer > 600s: ±60s

### Dynamic Preset Buttons

Replace the 5 hardcoded buttons with 3 contextual presets that regenerate when player count changes:

| Preset     | Calculation                   | Purpose        |
|------------|-------------------------------|----------------|
| Quick      | round_to_15(recommended * 0.7)| Faster pace    |
| Recommended| formula output                | Default        |
| Extended   | round_to_15(min(maxTimer, recommended * 1.4)) | Relaxed pace |

The "Recommended" preset gets the `.recommended` CSS class (gold border highlight). Active selection keeps `.active` class. Buttons are regenerated dynamically via JS rather than hardcoded in HTML.

### Backend Validation

`server.js` line 2066 changes from:
```js
Math.min(600, Math.max(30, data.timerDuration))
```
to:
```js
Math.min(dynamicMax, Math.max(30, data.timerDuration))
```

Where `dynamicMax` is computed from the current lobby player count using the same formula logic. The formula must be duplicated server-side (or extracted to shared code, but since this is a single-file server + single HTML page, duplication is fine).

## Files to Change

### `public/player.html`

1. **JS: `getRecommendedTimerSeconds()`** (line 2932-2938) - Replace lookup table with formula
2. **JS: New `getMaxTimer()` function** - Compute dynamic max from player count
3. **JS: New `getStepSize()` function** - Return ±step based on current timer value
4. **JS: New `generatePresets()` function** - Build Quick/Recommended/Extended buttons dynamically
5. **JS: `setTimer()`** (line 2956-2963) - Use dynamic max instead of hardcoded 600
6. **JS: `updateTimerPresetState()`** (line 2940-2954) - Adapt to dynamic presets
7. **JS: Timer ±button handlers** (line 2977-2985) - Use dynamic step size
8. **JS: `updateWaitingRoom()`** (line 2908-2917) - Call `generatePresets()` when player count changes
9. **HTML: Timer presets container** (line 2295-2301) - Remove hardcoded buttons, keep empty container
10. **JS: Preset click handlers** (line 2987-2996) - Use event delegation on container instead of static querySelectorAll

### `server.js`

1. **Settings validation** (line 2066) - Use dynamic max based on `lobby.players.size`
2. **Add server-side formula** - Duplicate `getRecommendedTimerSeconds()` and `getMaxTimer()` for validation

## Behavior Unchanged

- Auto-timer: still enabled by default, disables on manual override, re-enables on... (actually it never re-enables - once you manually touch the timer, auto stays off until page reload)
- Hint text: still shows "Recommended: X:XX for N players"
- Non-host sync: non-hosts still see timer updates in real-time via `lobby:settingsUpdated`
- Timer halving during gameplay: completely unaffected (that's game logic, not lobby config)

## Design Rationale

The `N^1.9` exponent was chosen because it closely fits the existing hand-tuned values (which were presumably playtested) while providing a smooth mathematical extension. The near-quadratic growth compensates for the exponential nature of the halving mechanic: with N players, up to N-1 halvings occur, but the 10s floor means only ~log2(T/10) halvings are meaningful. In practice, even a 30-minute starting timer for 12+ players produces rounds of only ~5-8 minutes wall-clock time because the halvings compress the tail aggressively.
