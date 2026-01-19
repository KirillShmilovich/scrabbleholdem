# Scrabble Hold'em

A local multiplayer word game combining Scrabble-style letter scoring with Texas Hold'em-inspired shared dice. Players join from their phones and compete to form the highest-scoring words.

## How It Works

1. **Host creates a lobby** and gets a 4-character code
2. **Players join** by entering the code on their phones
3. Each round, everyone sees **5 shared community dice** plus their own **3 private dice**
4. **Form the best word** using any combination of community + personal letters
5. **Placement scoring**: 1st place = 3 pts, 2nd = 2 pts, 3rd = 1 pt
6. After all rounds, highest total points wins

## Quick Start

```bash
npm install
npm start
```

Open the URL shown in terminal on all devices. One person creates a lobby, others join with the code.

## Game Flow

1. **Lobby**: Host configures rounds (3-20) and timer (30-600 seconds), then starts
2. **Round**: Timer counts down. First submission halves remaining time. All submitted = round ends early
3. **Results**: See everyone's words and scores, plus an AI-generated fun fact connecting the words
4. **Repeat** until all rounds complete, then view final standings

## Modifiers

Each round, one community die gets a random modifier:

- **Letter multipliers**: ×2, ×3, ×4 on that letter
- **Position bonuses**: Extra points if the modified letter is first, last, middle, etc.
- **Length bonuses**: Rewards for specific word lengths (3, 4, 5, or 6+ letters)
- **Composition bonuses**: Balanced vowels/consonants, vowel-rich words, odd/even length

## Letter Point Values

| Points | Letters |
|--------|---------|
| 1 | A, E, I, O, U, L, N, R, S, T |
| 2 | B, C, D, G, H, M, P |
| 3 | F, K, V, W, Y |
| 4 | J, Qu, X, Z |

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML/CSS/JS
- **Real-time sync**: WebSockets
- **Fun facts**: OpenRouter API (LLM-generated connections between played words)
- **Images**: Cloudflare AI (optional AI-generated illustrations)

## Word List

Uses **NWL2023** (North American Scrabble Players Association Word List) with ~196k official Scrabble words.

**Source:** [scrabblewords/scrabblewords](https://github.com/scrabblewords/scrabblewords/blob/main/words/North-American/NWL2023.txt)

```bash
# Update word list
curl -sL "https://raw.githubusercontent.com/scrabblewords/scrabblewords/main/words/North-American/NWL2023.txt" | awk '{print $1}' > data/words.txt
```

## Environment Variables

```
PORT                   # Server port (default: 3000)
OPENROUTER_API_KEY     # For fun fact generation
CLOUDFLARE_API_TOKEN   # For image generation (optional)
CLOUDFLARE_ACCOUNT_ID  # Cloudflare account ID (optional)
```

## Remote Play

For friends not on local WiFi: set up port forwarding (port 3000) or deploy to a cloud host like Render.




