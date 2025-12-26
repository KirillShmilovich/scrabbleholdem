require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO for production (handles proxies like Render)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Load dictionary for word validation
let dictionary = new Set();
try {
  const wordsPath = path.join(__dirname, 'data', 'words.txt');
  const wordsContent = fs.readFileSync(wordsPath, 'utf8');
  wordsContent.split('\n').forEach(word => {
    const cleaned = word.trim().toUpperCase();
    if (cleaned.length >= 2) {
      dictionary.add(cleaned);
    }
  });
  console.log(`📚 Dictionary loaded: ${dictionary.size} words`);
} catch (err) {
  console.error('Failed to load dictionary:', err.message);
}

// Word validation API
app.get('/api/validate/:word', (req, res) => {
  const word = (req.params.word || '').toUpperCase().trim();
  const isValid = dictionary.has(word);
  res.json({ word, isValid, dictionarySize: dictionary.size });
});

// Word definition API using OpenRouter
app.get('/api/define/:word', async (req, res) => {
  const word = (req.params.word || '').toLowerCase().trim();
  
  if (!word) {
    return res.status(400).json({ error: 'No word provided' });
  }
  
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Scrabble Holdem'
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3-nano-30b-a3b:free',
        messages: [
          {
            role: 'system',
            content:
              'You are a Scrabble-friendly mini-dictionary with a light, playful tone. ' +
              'Be accurate first; be fun and interesting second.\n\n' +
              'Reply with EXACTLY three lines and nothing else:\n' +
              'DEF: <brief definition>\n' +
              'EX: <one natural example sentence using the word in that same sense>\n' +
              'TRIVIA: <a fun "did you know?" fact>\n\n' +
              'Notes: Scrabble words can be inflections, variants, archaic spellings, or abbreviations—define them as such when appropriate.'
          },
          {
            role: 'user',
            content:
              `Word: ${JSON.stringify(word)}\n` +
              'Rules:\n' +
              '- DEF: concise plain-English meaning (or "plural of …", "past tense of …", etc.).\n' +
              '- EX: one sentence using the word.\n' +
              '- TRIVIA: a fun fact—could be pop culture, a famous quote, a record, a surprising use, or etymology if it\'s genuinely interesting. Keep it brief.\n' +
              '- No extra lines, no bullets, no markdown, no preamble.'
          }
        ],
        reasoning: { enabled: false },
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('OpenRouter error:', data.error);
      return res.status(500).json({ error: 'Failed to get definition' });
    }
    
    let content = data.choices?.[0]?.message?.content || '';
    
    // Clean up model-specific tokens
    content = content
      .replace(/<\/?s>/g, '')
      .replace(/\[\/INST\]/g, '')
      .replace(/\[INST\]/g, '')
      .trim();
    
    // Parse the response
    const defMatch = content.match(/DEF:\s*(.+)/i);
    const exMatch = content.match(/EX:\s*(.+)/i);
    const triviaMatch = content.match(/TRIVIA:\s*(.+)/i);
    
    let definition = defMatch ? defMatch[1].trim() : 'Definition not available';
    let example = exMatch ? exMatch[1].trim() : '';
    let trivia = triviaMatch ? triviaMatch[1].trim() : '';
    
    // Clean up any remaining artifacts
    definition = definition.replace(/\[\/INST\]/g, '').trim();
    example = example.replace(/\[\/INST\]/g, '').trim();
    trivia = trivia.replace(/\[\/INST\]/g, '').trim();
    
    res.json({
      word: word,
      definition: definition,
      example: example,
      trivia: trivia
    });
    
  } catch (err) {
    console.error('Definition API error:', err);
    res.status(500).json({ error: 'Failed to fetch definition' });
  }
});

// Letter point values - compressed range (1-4) to balance short vs long words
const LETTERS = [
  { letter: 'A', points: 1 },
  { letter: 'E', points: 1 },
  { letter: 'I', points: 1 },
  { letter: 'O', points: 1 },
  { letter: 'U', points: 1 },
  { letter: 'L', points: 1 },
  { letter: 'N', points: 1 },
  { letter: 'R', points: 1 },
  { letter: 'S', points: 1 },
  { letter: 'T', points: 1 },
  { letter: 'D', points: 2 },
  { letter: 'G', points: 2 },
  { letter: 'B', points: 2 },
  { letter: 'C', points: 2 },
  { letter: 'M', points: 2 },
  { letter: 'P', points: 2 },
  { letter: 'H', points: 2 },
  { letter: 'F', points: 3 },
  { letter: 'V', points: 3 },
  { letter: 'W', points: 3 },
  { letter: 'Y', points: 3 },
  { letter: 'K', points: 3 },
  { letter: 'J', points: 4 },
  { letter: 'X', points: 4 },
  { letter: 'Q', points: 4 },
  { letter: 'Z', points: 4 },
];

// Create a balanced deck with better distribution for word-making
function createLetterDeck() {
  const deck = [];
  
  const vowelCounts = { A: 4, E: 5, I: 4, O: 4, U: 3 };
  const consonantCounts = {
    B: 2, C: 2, D: 3, F: 2, G: 2, H: 2,
    J: 1, K: 1, L: 3, M: 2, N: 3, P: 2,
    Q: 1, R: 3, S: 3, T: 3, V: 2, W: 2,
    X: 1, Y: 2, Z: 1
  };
  
  for (const [letter, count] of Object.entries(vowelCounts)) {
    const letterData = LETTERS.find(l => l.letter === letter);
    for (let i = 0; i < count; i++) {
      deck.push({ ...letterData });
    }
  }
  
  for (const [letter, count] of Object.entries(consonantCounts)) {
    const letterData = LETTERS.find(l => l.letter === letter);
    for (let i = 0; i < count; i++) {
      deck.push({ ...letterData });
    }
  }
  
  return deck;
}

// Shuffle array (Fisher-Yates)
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Modifiers - ALL are letter-specific
const MODIFIERS = [
  { name: 'Double Letter', shortName: '×2', multiplier: 2, type: 'multiply', color: '#3b82f6', desc: 'This letter scores ×2 points' },
  { name: 'Triple Letter', shortName: '×3', multiplier: 3, type: 'multiply', color: '#8b5cf6', desc: 'This letter scores ×3 points' },
  { name: 'Quad Letter', shortName: '×4', multiplier: 4, type: 'multiply', color: '#ec4899', desc: 'This letter scores ×4 points' },
  { name: 'Start Bonus', shortName: '1st', multiplier: 2, type: 'position', position: 'start', color: '#f97316', desc: '×2 if used as FIRST letter of your word' },
  { name: 'End Bonus', shortName: 'END', multiplier: 2, type: 'position', position: 'end', color: '#fb923c', desc: '×2 if used as LAST letter of your word' },
  { name: 'Middle Power', shortName: 'MID', multiplier: 3, type: 'position', position: 'middle', color: '#fbbf24', desc: '×3 if used in the MIDDLE (not first or last)' },
  { name: 'Long Word', shortName: '6+', multiplier: 1, type: 'length', minLength: 6, bonus: 12, color: '#10b981', desc: '+12 bonus if your word is 6+ letters' },
  { name: 'Short & Sweet', shortName: '4', multiplier: 3, type: 'length', exactLength: 4, color: '#14b8a6', desc: '×3 if your word is exactly 4 letters' },
  { name: 'Five Alive', shortName: '5', multiplier: 2, type: 'length', exactLength: 5, bonus: 5, color: '#0d9488', desc: '×2 + 5 bonus if your word is exactly 5 letters' },
  { name: 'Odd Word', shortName: 'ODD', multiplier: 1, type: 'parity', parity: 'odd', bonus: 8, color: '#8b5cf6', desc: '+8 bonus if word has ODD number of letters' },
  { name: 'Even Word', shortName: 'EVEN', multiplier: 1, type: 'parity', parity: 'even', bonus: 8, color: '#a855f7', desc: '+8 bonus if word has EVEN number of letters' },
  { name: 'Vowel Buddy', shortName: 'V+', multiplier: 2, type: 'neighbor', neighborType: 'vowel', color: '#06b6d4', desc: '×2 if this letter is next to a VOWEL' },
  { name: 'Bonus +5', shortName: '+5', multiplier: 1, type: 'bonus', bonus: 5, color: '#22c55e', desc: '+5 points if you use this letter' },
  { name: 'Bonus +10', shortName: '+10', multiplier: 1, type: 'bonus', bonus: 10, color: '#16a34a', desc: '+10 points if you use this letter' },
];

// Points awarded for placement each round
const PLACEMENT_POINTS = {
  1: 3,  // 1st place
  2: 2,  // 2nd place
  3: 1,  // 3rd place
};

// Generate unique lobby code
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique player ID
function generatePlayerId() {
  return 'player_' + Math.random().toString(36).substr(2, 9);
}

// Active lobbies: lobbyCode -> lobbyState
const lobbies = new Map();

// Create a new lobby
function createLobby(hostSocketId, hostName) {
  let code = generateLobbyCode();
  // Ensure unique
  while (lobbies.has(code)) {
    code = generateLobbyCode();
  }
  
  const hostId = generatePlayerId();
  
  const lobby = {
    code,
    hostId,
    status: 'waiting', // waiting, playing, finished
    settings: {
      totalRounds: 10,
      timerDuration: 75, // seconds
    },
    players: new Map(), // visibleId -> player data
    playerSockets: new Map(), // visibleId -> socket.id
    
    // Game state
    roundNumber: 0,
    communityDice: [],
    modifier: null,
    letterDeck: [],
    deckIndex: 0,
    playerSubmissions: new Map(), // visibleId -> submission
    timerRemaining: 0,
    timerInterval: null,
    timerHalved: false, // Has first submission halved the timer this round?
    revealed: false,
    roundHistory: [], // Array of round results for end-game summary
    deleteTimeout: null, // Timeout for deleting empty lobby
  };
  
  // Add host as first player
  lobby.players.set(hostId, {
    visibleId: hostId,
    name: hostName,
    dice: [],
    totalPoints: 0,
    isHost: true,
  });
  lobby.playerSockets.set(hostId, hostSocketId);
  
  lobbies.set(code, lobby);
  
  return { lobby, hostId };
}

// Initialize or reshuffle deck for a lobby
function resetDeck(lobby) {
  lobby.letterDeck = shuffle(createLetterDeck());
  lobby.deckIndex = 0;
}

// Draw a letter from the lobby's deck
function drawLetter(lobby) {
  if (lobby.deckIndex >= lobby.letterDeck.length) {
    resetDeck(lobby);
  }
  return { ...lobby.letterDeck[lobby.deckIndex++] };
}

// Ensure at least one vowel in a set of dice
function ensureVowel(dice, lobby) {
  const vowels = ['A', 'E', 'I', 'O', 'U'];
  const hasVowel = dice.some(d => vowels.includes(d.letter));
  
  if (!hasVowel) {
    const vowelLetter = vowels[Math.floor(Math.random() * vowels.length)];
    const vowelData = LETTERS.find(l => l.letter === vowelLetter);
    const replaceIndex = Math.floor(Math.random() * dice.length);
    dice[replaceIndex] = { ...vowelData };
  }
  
  return dice;
}

// Roll dice for a player (3 dice)
function rollPlayerDice(lobby) {
  const dice = [drawLetter(lobby), drawLetter(lobby), drawLetter(lobby)];
  return ensureVowel(dice, lobby);
}

// Roll community dice (5 dice) - ensures variety
function rollCommunityDice(lobby) {
  const dice = [];
  const usedLetters = new Set();
  
  let attempts = 0;
  while (dice.length < 5 && attempts < 20) {
    const letter = drawLetter(lobby);
    if (!usedLetters.has(letter.letter) || attempts > 10) {
      dice.push(letter);
      usedLetters.add(letter.letter);
    }
    attempts++;
  }
  
  while (dice.length < 5) {
    dice.push(drawLetter(lobby));
  }
  
  return ensureVowel(dice, lobby);
}

// Generate a random modifier attached to a die
function rollModifier() {
  const index = Math.floor(Math.random() * MODIFIERS.length);
  const dieIndex = Math.floor(Math.random() * 5);
  return {
    ...MODIFIERS[index],
    dieIndex,
  };
}

// Start a new round in a lobby
function startNewRound(lobby) {
  lobby.roundNumber++;
  lobby.communityDice = rollCommunityDice(lobby);
  lobby.modifier = rollModifier();
  lobby.playerSubmissions.clear();
  lobby.revealed = false;
  lobby.timerRemaining = lobby.settings.timerDuration;
  lobby.timerHalved = false;
  
  // Roll new dice for all players
  lobby.players.forEach((player, visibleId) => {
    player.dice = rollPlayerDice(lobby);
  });
  
  // Start the timer
  startTimer(lobby);
  
  return lobby;
}

// Start timer for a lobby
function startTimer(lobby) {
  stopTimer(lobby);
  
  lobby.timerRemaining = lobby.settings.timerDuration;
  
  lobby.timerInterval = setInterval(() => {
    lobby.timerRemaining--;
    
    // Broadcast timer update to all players
    broadcastToLobby(lobby, 'game:timerUpdate', { 
      remaining: lobby.timerRemaining,
      total: lobby.settings.timerDuration 
    });
    
    if (lobby.timerRemaining <= 0) {
      stopTimer(lobby);
      // Auto-reveal when timer ends
      revealResults(lobby);
    }
  }, 1000);
}

// Stop timer for a lobby
function stopTimer(lobby) {
  if (lobby.timerInterval) {
    clearInterval(lobby.timerInterval);
    lobby.timerInterval = null;
  }
}

// Broadcast to all players in a lobby
function broadcastToLobby(lobby, event, data) {
  lobby.playerSockets.forEach((socketId, visibleId) => {
    io.to(socketId).emit(event, data);
  });
}

// Get player state for sending to a player
function getPlayerState(lobby, visibleId) {
  const player = lobby.players.get(visibleId);
  const players = Array.from(lobby.players.values()).map(p => {
    const isConnected = lobby.playerSockets.has(p.visibleId);
    const isReconnecting = !isConnected && p.disconnectedAt && (Date.now() - p.disconnectedAt < 30000);
    
    return {
      visibleId: p.visibleId,
      name: p.name,
      totalPoints: p.totalPoints,
      isHost: p.isHost,
      hasSubmitted: lobby.playerSubmissions.has(p.visibleId),
      isConnected,
      isReconnecting,
    };
  });
  
  return {
    lobbyCode: lobby.code,
    status: lobby.status,
    settings: lobby.settings,
    roundNumber: lobby.roundNumber,
    totalRounds: lobby.settings.totalRounds,
    communityDice: lobby.communityDice,
    modifier: lobby.modifier,
    player: player,
    players: players,
    timerRemaining: lobby.timerRemaining,
    revealed: lobby.revealed,
    isHost: player?.isHost || false,
  };
}

// Calculate placements and award points
function calculatePlacements(lobby) {
  const submissions = [];
  
  lobby.playerSubmissions.forEach((submission, visibleId) => {
    const player = lobby.players.get(visibleId);
    if (player && submission && submission.isValid) {
      submissions.push({
        visibleId,
        name: player.name,
        word: submission.word,
        score: submission.score,
        breakdown: submission.breakdown,
      });
    }
  });
  
  // Sort by score descending
  submissions.sort((a, b) => b.score - a.score);
  
  // Assign placements (handling ties)
  let currentPlace = 0;
  let lastScore = null;
  let skipCount = 0;
  
  const results = submissions.map((sub, idx) => {
    if (sub.score !== lastScore) {
      currentPlace = idx + 1;
      lastScore = sub.score;
    }
    
    const pointsEarned = PLACEMENT_POINTS[currentPlace] || 0;
    
    // Update player's total points
    const player = lobby.players.get(sub.visibleId);
    if (player) {
      player.totalPoints += pointsEarned;
    }
    
    return {
      ...sub,
      place: currentPlace,
      pointsEarned,
    };
  });
  
  // Add players who didn't submit valid words
  lobby.players.forEach((player, visibleId) => {
    const hasResult = results.some(r => r.visibleId === visibleId);
    if (!hasResult) {
      const submission = lobby.playerSubmissions.get(visibleId);
      results.push({
        visibleId,
        name: player.name,
        word: submission?.word || '—',
        score: submission?.score || 0,
        breakdown: submission?.breakdown || '',
        place: null,
        pointsEarned: 0,
        isInvalid: submission && !submission.isValid,
        noSubmission: !submission,
      });
    }
  });
  
  return results;
}

// Reveal results for a round
function revealResults(lobby) {
  if (lobby.revealed) return;
  
  stopTimer(lobby);
  lobby.revealed = true;
  
  const results = calculatePlacements(lobby);
  
  // Get updated standings
  const standings = Array.from(lobby.players.values())
    .map(p => ({
      visibleId: p.visibleId,
      name: p.name,
      totalPoints: p.totalPoints,
      isHost: p.isHost,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
  
  // Capture standings snapshot after points are awarded
  const standingsSnapshot = Array.from(lobby.players.values())
    .map(p => ({
      visibleId: p.visibleId,
      name: p.name,
      totalPoints: p.totalPoints,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
  
  // Store round in history with full details
  lobby.roundHistory.push({
    roundNumber: lobby.roundNumber,
    results: results.map(r => {
      // Get player's dice letters from their submission
      const submission = lobby.playerSubmissions.get(r.visibleId);
      const player = lobby.players.get(r.visibleId);
      const playerLetters = submission?.playerLetters || player?.dice?.map(d => d.letter).join('') || '';
      
      return {
        visibleId: r.visibleId,
        name: r.name,
        word: r.word || '—',
        score: r.score || 0,
        place: r.place,
        pointsEarned: r.pointsEarned || 0,
        isInvalid: r.isInvalid,
        noSubmission: r.noSubmission,
        playerLetters, // Include the player's dice letters
      };
    }),
    standings: standingsSnapshot, // Running totals after this round
    communityLetters: lobby.communityDice.map(d => d.letter).join(''),
    modifier: lobby.modifier?.name,
  });
  
  // Check if this is the last round (but don't end game yet - wait for host to view final results)
  const isLastRound = lobby.roundNumber >= lobby.settings.totalRounds;
  
  // Broadcast results (same for all rounds including last)
  broadcastToLobby(lobby, 'game:roundResults', {
    roundNumber: lobby.roundNumber,
    totalRounds: lobby.settings.totalRounds,
    results,
    standings,
    isLastRound, // Changed from isGameOver - signals UI to show "See Final Results" button
  });
  
  console.log(`Round ${lobby.roundNumber} results for lobby ${lobby.code}:`, 
    results.map(r => `${r.name}: ${r.word} (${r.score}pts, ${r.pointsEarned} earned)`).join(', '));
}

// Health check endpoint (keeps Render from sleeping as fast)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    uptime: process.uptime(),
    activeLobbies: lobbies.size,
    lobbyCodes: Array.from(lobbies.keys()),
  });
});

// Debug endpoint to check if a lobby exists
app.get('/api/lobby/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const lobby = lobbies.get(code);
  if (lobby) {
    res.json({ 
      exists: true, 
      code: lobby.code,
      playerCount: lobby.players.size,
      status: lobby.status,
    });
  } else {
    res.json({ 
      exists: false, 
      code,
      activeLobbies: lobbies.size,
      serverUptime: Math.floor(process.uptime()),
    });
  }
});

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Keep board route but redirect to player
app.get('/board', (req, res) => {
  res.redirect('/play');
});

app.get('/player', (req, res) => {
  res.redirect('/play');
});

// Catch-all: serve index.html for any unknown routes (SPA-style)
app.get('*', (req, res) => {
  // Don't catch API routes or socket.io
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Create a new lobby
  socket.on('lobby:create', (data) => {
    const { name } = data;
    const { lobby, hostId } = createLobby(socket.id, name || 'Host');
    
    socket.visibleId = hostId;
    socket.lobbyCode = lobby.code;
    
    resetDeck(lobby);
    
    console.log(`Lobby ${lobby.code} created by ${name} (${hostId})`);
    
    socket.emit('lobby:created', {
      lobbyCode: lobby.code,
      visibleId: hostId,
      state: getPlayerState(lobby, hostId),
    });
  });
  
  // Join an existing lobby
  socket.on('lobby:join', (data) => {
    const { code, name, existingId } = data;
    const upperCode = code?.toUpperCase();
    const lobby = lobbies.get(upperCode);
    
    if (!lobby) {
      console.log(`Lobby join failed: ${upperCode} not found. Active lobbies: ${Array.from(lobbies.keys()).join(', ') || 'none'}`);
      socket.emit('lobby:error', { 
        message: `Lobby "${upperCode}" not found. The host may need to create a new lobby.`,
        hint: lobbies.size === 0 ? 'No active lobbies on server - it may have restarted.' : null,
      });
      return;
    }
    
    let visibleId = existingId;
    let player;
    let isReturningPlayer = false;
    
    // Check if returning player FIRST (before blocking new joins)
    if (existingId && lobby.players.has(existingId)) {
      player = lobby.players.get(existingId);
      isReturningPlayer = true;
      console.log(`Player returning to lobby ${code}: ${player.name} (game status: ${lobby.status})`);
      
      // Clear any pending removal timeout
      if (player.removeTimeout) {
        clearTimeout(player.removeTimeout);
        player.removeTimeout = null;
      }
      
      // Clear any pending host transfer timeout
      if (player.hostTransferTimeout) {
        clearTimeout(player.hostTransferTimeout);
        player.hostTransferTimeout = null;
      }
      
      // Clear disconnected timestamp
      player.disconnectedAt = null;
    } else {
      // New player - check if game is in progress
      if (lobby.status !== 'waiting') {
        socket.emit('lobby:error', { message: 'Game already in progress. You cannot join mid-game.' });
        return;
      }
      
      visibleId = generatePlayerId();
      player = {
        visibleId,
        name: name || `Player ${lobby.players.size + 1}`,
        dice: [],
        totalPoints: 0,
        isHost: false,
      };
      lobby.players.set(visibleId, player);
      console.log(`New player joined lobby ${code}: ${player.name}`);
    }
    
    // Update socket mapping
    lobby.playerSockets.set(visibleId, socket.id);
    socket.visibleId = visibleId;
    socket.lobbyCode = code.toUpperCase();
    
    // Cancel any pending lobby deletion since someone joined
    if (lobby.deleteTimeout) {
      clearTimeout(lobby.deleteTimeout);
      lobby.deleteTimeout = null;
      console.log(`Lobby ${lobby.code} deletion cancelled - player joined`);
    }
    
    // Send appropriate state based on game status
    if (isReturningPlayer && lobby.status === 'playing') {
      // Player returning mid-game - send them directly to game screen
      socket.emit('lobby:rejoined', {
        lobbyCode: lobby.code,
        visibleId,
        state: getPlayerState(lobby, visibleId),
        gameInProgress: true,
      });
    } else {
      // Normal lobby join
      socket.emit('lobby:joined', {
        lobbyCode: lobby.code,
        visibleId,
        state: getPlayerState(lobby, visibleId),
      });
    }
    
    // Notify all players of updated player list
    broadcastPlayerList(lobby);
  });
  
  // Update lobby settings (host only)
  socket.on('lobby:updateSettings', (data) => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const player = lobby.players.get(socket.visibleId);
    if (!player?.isHost) return;
    
    if (data.totalRounds) {
      lobby.settings.totalRounds = Math.min(20, Math.max(3, data.totalRounds));
    }
    if (data.timerDuration) {
      lobby.settings.timerDuration = Math.min(180, Math.max(30, data.timerDuration));
    }
    
    // Broadcast updated settings
    broadcastToLobby(lobby, 'lobby:settingsUpdated', lobby.settings);
  });
  
  // Start game (host only)
  socket.on('game:start', () => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const player = lobby.players.get(socket.visibleId);
    if (!player?.isHost) {
      socket.emit('game:error', { message: 'Only the host can start the game' });
      return;
    }
    
    if (lobby.players.size < 2) {
      socket.emit('game:error', { message: 'Need at least 2 players to start' });
      return;
    }
    
    lobby.status = 'playing';
    lobby.roundNumber = 0;
    
    // Reset all player points
    lobby.players.forEach(p => {
      p.totalPoints = 0;
    });
    
    console.log(`Game starting in lobby ${lobby.code} with ${lobby.players.size} players`);
    
    // Notify all players that game is starting
    broadcastToLobby(lobby, 'game:starting', {
      totalRounds: lobby.settings.totalRounds,
    });
    
    // Start first round after a brief delay
    setTimeout(() => {
      startNewRound(lobby);
      
      // Send individual state to each player
      lobby.players.forEach((p, visibleId) => {
        const socketId = lobby.playerSockets.get(visibleId);
        if (socketId) {
          io.to(socketId).emit('game:newRound', getPlayerState(lobby, visibleId));
        }
      });
    }, 1500);
  });
  
  // Start new round (host only, after results shown)
  socket.on('game:nextRound', () => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const player = lobby.players.get(socket.visibleId);
    if (!player?.isHost) return;
    
    if (lobby.status !== 'playing') return;
    if (!lobby.revealed) return; // Must reveal first
    if (lobby.roundNumber >= lobby.settings.totalRounds) return; // Game over
    
    startNewRound(lobby);
    
    // Send individual state to each player
    lobby.players.forEach((p, visibleId) => {
      const socketId = lobby.playerSockets.get(visibleId);
      if (socketId) {
        io.to(socketId).emit('game:newRound', getPlayerState(lobby, visibleId));
      }
    });
    
    console.log(`Round ${lobby.roundNumber} started in lobby ${lobby.code}`);
  });
  
  // Player submits word
  socket.on('player:submitWord', (data) => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const visibleId = socket.visibleId;
    if (!visibleId || !lobby.players.has(visibleId)) return;
    
    if (lobby.revealed) {
      socket.emit('player:submitError', { message: 'Round already ended!' });
      return;
    }
    
    const player = lobby.players.get(visibleId);
    
    // Check if this is the first submission (before adding to map)
    const isFirstSubmission = lobby.playerSubmissions.size === 0;
    
    // Store player's dice letters for round history display
    const playerLetters = player.dice.map(d => d.letter).join('');
    
    lobby.playerSubmissions.set(visibleId, {
      word: data.word,
      score: data.score,
      breakdown: data.breakdown,
      isValid: data.isValid,
      playerLetters, // Store which letters the player had
      timestamp: Date.now(),
    });
    
    console.log(`${player.name} submitted: "${data.word}" (${data.score} pts, valid: ${data.isValid})`);
    
    // First submission halves the timer (if not already halved and not in last 10 seconds)
    if (isFirstSubmission && !lobby.timerHalved && lobby.timerRemaining > 10) {
      lobby.timerHalved = true;
      const newTime = Math.max(10, Math.floor(lobby.timerRemaining / 2));
      console.log(`First submission! Timer halved: ${lobby.timerRemaining}s → ${newTime}s`);
      lobby.timerRemaining = newTime;
      
      // Broadcast timer halved event to all players
      broadcastToLobby(lobby, 'game:timerHalved', {
        remaining: lobby.timerRemaining,
        playerName: player.name,
      });
    }
    
    // Confirm to player
    socket.emit('player:submitConfirmed', { word: data.word, score: data.score });
    
    // Update all players on who has submitted
    broadcastPlayerList(lobby);

    // Check if all players have submitted
    if (lobby.playerSubmissions.size === lobby.players.size) {
      console.log(`All players submitted in lobby ${lobby.code}. Ending round early.`);
      revealResults(lobby);
    }
  });
  
  // View final results (host only, after last round)
  socket.on('game:viewFinalResults', () => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const player = lobby.players.get(socket.visibleId);
    if (!player?.isHost) return;
    
    if (lobby.roundNumber < lobby.settings.totalRounds) return; // Not last round yet
    if (lobby.status === 'finished') return; // Already finished
    
    lobby.status = 'finished';
    
    // Get final standings
    const standings = Array.from(lobby.players.values())
      .map(p => ({
        visibleId: p.visibleId,
        name: p.name,
        totalPoints: p.totalPoints,
        isHost: p.isHost,
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);
    
    // Broadcast final results with round history
    broadcastToLobby(lobby, 'game:finalResults', {
      winner: standings[0],
      standings,
      roundHistory: lobby.roundHistory,
      totalRounds: lobby.settings.totalRounds,
    });
    
    console.log(`Game finished in lobby ${lobby.code}. Winner: ${standings[0]?.name}`);
  });
  
  // Play again (host only, after game over)
  socket.on('game:playAgain', () => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (!lobby) return;
    
    const player = lobby.players.get(socket.visibleId);
    if (!player?.isHost) return;
    
    if (lobby.status !== 'finished') return;
    
    // Reset game state
    lobby.status = 'waiting';
    lobby.roundNumber = 0;
    lobby.communityDice = [];
    lobby.modifier = null;
    lobby.playerSubmissions.clear();
    lobby.revealed = false;
    lobby.roundHistory = [];
    resetDeck(lobby);
    
    // Reset all player points
    lobby.players.forEach(p => {
      p.totalPoints = 0;
      p.dice = [];
    });
    
    // Broadcast return to lobby
    broadcastToLobby(lobby, 'game:returnToLobby', {
      lobbyCode: lobby.code,
    });
    
    broadcastPlayerList(lobby);
    
    console.log(`Lobby ${lobby.code} reset for new game`);
  });
  
  // Handle disconnect
  socket.on('disconnect', () => {
    const lobby = lobbies.get(socket.lobbyCode);
    if (lobby && socket.visibleId) {
      const player = lobby.players.get(socket.visibleId);
      if (player) {
        console.log(`Player disconnected from lobby ${lobby.code}: ${player.name}`);
        // Remove socket mapping but keep player data for reconnection
        lobby.playerSockets.delete(socket.visibleId);
        
        // Mark player as disconnected (but don't remove them yet)
        player.disconnectedAt = Date.now();
        
        // Update player list to show disconnected status
        broadcastPlayerList(lobby);
        
        // If host disconnects, wait 30 seconds before reassigning
        if (player.isHost && lobby.status === 'waiting') {
          console.log(`Host ${player.name} disconnected. Waiting 30s before reassigning...`);
          
          // Clear any existing host transfer timeout
          if (player.hostTransferTimeout) {
            clearTimeout(player.hostTransferTimeout);
          }
          
          player.hostTransferTimeout = setTimeout(() => {
            // Check if host is still disconnected
            if (!lobby.playerSockets.has(socket.visibleId) && player.isHost) {
              // Find a connected player to be new host
              for (const [visId, p] of lobby.players) {
                if (lobby.playerSockets.has(visId) && visId !== socket.visibleId) {
                  player.isHost = false;
                  p.isHost = true;
                  console.log(`New host for lobby ${lobby.code}: ${p.name}`);
                  broadcastPlayerList(lobby);
                  break;
                }
              }
            }
          }, 30 * 1000); // 30 seconds
        }
        
        // Schedule player removal after 2 minutes of being disconnected
        if (player.removeTimeout) {
          clearTimeout(player.removeTimeout);
        }
        
        player.removeTimeout = setTimeout(() => {
          const currentLobby = lobbies.get(lobby.code);
          if (currentLobby && !currentLobby.playerSockets.has(socket.visibleId)) {
            // Player still disconnected, remove them
            console.log(`Removing ${player.name} from lobby ${lobby.code} (disconnected for 2 min)`);
            currentLobby.players.delete(socket.visibleId);
            broadcastPlayerList(currentLobby);
            
            // If lobby is now empty, schedule deletion
            if (currentLobby.players.size === 0) {
              stopTimer(currentLobby);
              lobbies.delete(lobby.code);
              console.log(`Lobby ${lobby.code} deleted (no players)`);
            }
          }
        }, 2 * 60 * 1000); // 2 minutes
        
        // Schedule lobby deletion if no connected players (with 5 minute grace period)
        if (lobby.playerSockets.size === 0) {
          if (lobby.deleteTimeout) {
            clearTimeout(lobby.deleteTimeout);
          }
          
          console.log(`Lobby ${lobby.code} has no connected players. Will delete in 5 minutes if no one rejoins.`);
          
          lobby.deleteTimeout = setTimeout(() => {
            const currentLobby = lobbies.get(lobby.code);
            if (currentLobby && currentLobby.playerSockets.size === 0) {
              stopTimer(currentLobby);
              lobbies.delete(lobby.code);
              console.log(`Lobby ${lobby.code} deleted (empty for 5 minutes)`);
            }
          }, 5 * 60 * 1000); // 5 minutes
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

// Broadcast updated player list to all in lobby
function broadcastPlayerList(lobby) {
  const players = Array.from(lobby.players.values()).map(p => {
    const isConnected = lobby.playerSockets.has(p.visibleId);
    const isReconnecting = !isConnected && p.disconnectedAt && (Date.now() - p.disconnectedAt < 30000);
    
    return {
      visibleId: p.visibleId,
      name: p.name,
      totalPoints: p.totalPoints,
      isHost: p.isHost,
      hasSubmitted: lobby.playerSubmissions.has(p.visibleId),
      isConnected,
      isReconnecting, // True for first 30 seconds after disconnect
    };
  });
  
  broadcastToLobby(lobby, 'lobby:playersUpdated', { 
    players,
    settings: lobby.settings,
    status: lobby.status,
  });
}

// Get local IP address for display
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
const serverStartTime = new Date();

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  
  console.log('\n🎲 Scrabble Hold\'em Server Started!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🎮 Play:     http://${localIP}:${PORT}`);
  console.log(`⏰ Started:  ${serverStartTime.toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Note: Lobbies are stored in memory. Server restart = lobbies lost.\n');
});
