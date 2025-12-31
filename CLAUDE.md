# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scrabble Hold'em is a local multiplayer word game combining Scrabble scoring with Texas Hold'em mechanics. Players connect via their phones to play together, with a shared board display (e.g., iPad/TV) showing community dice.

## Commands

```bash
npm install     # Install dependencies
npm start       # Start server (runs node server.js)
npm run dev     # Same as npm start
```

The server runs on port 3000 by default (configurable via `PORT` env var).

## Architecture

**Single-server monolith** - Express serves static files and handles Socket.IO for real-time game state:

- `server.js` - All backend logic (~1400 lines): lobby management, game state machine, word validation, LLM API integrations
- `public/player.html` - Main game UI (players join here, handles both lobby and gameplay)
- `public/index.html` - Landing page/home
- `public/styles.css` - Shared CSS
- `data/words.txt` - NWL2023 Scrabble dictionary (~196k words)

**State management:**
- All game state is in-memory (`lobbies` Map in server.js)
- Each lobby has: players, game status, round state, timer, submissions, round history
- Server restart = all lobbies lost

**Real-time communication:**
- Socket.IO events prefixed by domain: `lobby:*`, `game:*`, `player:*`
- Key events: `lobby:create`, `lobby:join`, `game:start`, `game:newRound`, `player:submitWord`, `game:roundResults`

## External APIs

All LLM calls go through OpenRouter (`OPENROUTER_API_KEY` env var):
- Fun facts connecting played words (generated server-side via `generateFunFact()`)
- Image prompt generation for fun fact illustrations (via `generateImagePrompt()`)

Image generation via Cloudflare AI (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` env vars):
- Uses FLUX.1-schnell model

## Environment Variables

```
OPENROUTER_API_KEY     # For LLM features (definitions, fun facts)
CLOUDFLARE_API_TOKEN   # For image generation
CLOUDFLARE_ACCOUNT_ID  # Cloudflare account ID
PORT                   # Server port (default: 3000)
```

## Game Flow

1. Host creates lobby (gets 4-char code)
2. Players join with code
3. Host starts game
4. Each round: community dice dealt, players see private dice, submit words within timer
5. First submission halves timer; all submitted = round ends early
6. Results shown with placements (1st=3pts, 2nd=2pts, 3rd=1pt)
7. After configured rounds, final standings shown
