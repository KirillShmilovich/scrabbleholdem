# 🎲 Scrabble Hold'em

A local multiplayer word game combining Scrabble-style letter scoring with Texas Hold'em mechanics. Play with friends on the same WiFi network!

## How It Works

- **Board Display** (iPad/TV): Shows 5 community dice + a modifier (like "Triple Letter" or "Double Word")
- **Player Phones**: Each player sees their own 3 personal dice
- **Goal**: Combine your letters with the community dice to form the highest-scoring word!

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Connect devices:**
   - The terminal will show URLs for your local network
   - Open the **Board** on a shared screen (iPad between everyone)
   - Each player joins via their phone at the **Player** URL

## Game Rules

1. The board shows 5 community letter dice (shared by all players)
2. Each player has 3 private letter dice on their phone
3. A modifier die shows bonuses like:
   - **Normal** - No modifier
   - **Double Letter** - One letter scores 2×
   - **Triple Letter** - One letter scores 3×
   - **Double Word** - Whole word scores 2×
   - **Triple Word** - Whole word scores 3×
4. Use any combination of your letters + community letters to form a word
5. Score your word based on Scrabble point values (shown on each die)
6. Wager on who has the best word, just like poker!

## Letter Point Values

| Letter | Points |
|--------|--------|
| A, E, I, O, U, L, N, S, T, R | 1 |
| D, G | 2 |
| B, C, M, P | 3 |
| F, H, V, W, Y | 4 |
| K | 5 |
| J, X | 8 |
| Q, Z | 10 |

## Tech Stack

- **Backend**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML/CSS/JS
- **Real-time sync**: WebSockets
- **Word Definitions**: OpenRouter API (Mistral 7B)

## Word List

This game uses the **NWL2023** (North American Scrabble Players Association Word List) containing **196,601 official Scrabble words**.

**Source:** [scrabblewords/scrabblewords](https://github.com/scrabblewords/scrabblewords/blob/main/words/North-American/NWL2023.txt)

To update the word list in the future:
```bash
curl -sL "https://raw.githubusercontent.com/scrabblewords/scrabblewords/main/words/North-American/NWL2023.txt" | awk '{print $1}' > data/words.txt
```

## Remote Play

To play with friends not on your local WiFi, set up port forwarding on your router (port 3000) and share the public IP shown when the server starts.

Enjoy the game! 🎲




