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
- **AI**: OpenRouter for everything — bot players, fun facts, word definitions, images

## AI Models

All LLM calls go through OpenRouter. Defaults live in `LLM_CONFIG` in `server.js`
and can be overridden per slot without editing code:

| Slot | Env var | Default | Used for |
|------|---------|---------|----------|
| Bots | `LLM_BOT_MODEL` | `openai/gpt-5.6-luna` | AI players' word choices |
| Flavour text | `LLM_FLAVOUR_MODEL` | `openai/gpt-5.6-luna` | Fun facts, definitions, image prompts |
| Images | `LLM_IMAGE_MODEL` | `black-forest-labs/flux.2-klein-4b` | Fun fact illustrations |

Flavour text runs with reasoning off — it appears on the results screen while
players are reading, so latency beats polish. `meta/muse-spark-1.3-contributor`
is noticeably more accurate on obscure Scrabble words if you would rather trade
a few seconds for that.

**Bot difficulty is the reasoning setting, not the model or the prompt.** Both
tiers send the identical prompt (`BOT_SYSTEM_PROMPT`); easy runs with reasoning
off, hard with `effort: 'minimal'` (see `BOT_TIERS`). The bot asks for five
ranked candidate words and the server picks the best legal one, working out the
tile assignment itself. If the model returns nothing usable before the round
clock runs out, the server plays a brute-forced fallback word scaled to that
tier's strength, so **a bot never misses a round**.

Rough cost for a 10-round game with 3 humans and 2 bots: **~$0.16**, about 90% of
which is image generation.

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
OPENROUTER_API_KEY     # Required. Bots, fun facts, definitions, and images all
                       # go through OpenRouter (see LLM_CONFIG in server.js)
```

## Remote Play

For friends not on local WiFi: set up port forwarding (port 3000) or deploy to a cloud host like Render.




