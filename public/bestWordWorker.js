let dictionary = new Set();
let dictionaryLoaded = false;
let dictionaryLoadingPromise = null;

async function ensureDictionary() {
  if (dictionaryLoaded) return;
  if (!dictionaryLoadingPromise) {
    dictionaryLoadingPromise = fetch('/api/dictionary')
      .then(response => response.text())
      .then(text => {
        text.split('\n').forEach(word => {
          const cleaned = word.trim().toUpperCase();
          if (cleaned.length >= 2) {
            dictionary.add(cleaned);
          }
        });
        dictionaryLoaded = true;
      });
  }
  await dictionaryLoadingPromise;
}

function scoreSequence(sequence, modifier) {
  if (!modifier || !sequence.length) return 0;

  const modifierTileIndex = sequence.findIndex(tile => tile.source === 'community' && tile.index === modifier.dieIndex);
  const modifierSelected = modifierTileIndex >= 0;

  const letterCount = sequence.reduce((sum, tile) => sum + tile.letterLength, 0);
  const modifierLetterPos = modifierTileIndex >= 0
    ? sequence.slice(0, modifierTileIndex).reduce((sum, tile) => sum + tile.letterLength, 0)
    : -1;

  const tileContainsLetterPos = (targetPos) => {
    if (modifierTileIndex < 0) return false;
    const tileLen = sequence[modifierTileIndex].letterLength;
    return targetPos >= modifierLetterPos && targetPos < modifierLetterPos + tileLen;
  };

  let modifierApplies = false;
  let modifierMultiplier = 1;
  let modifierBonusPoints = 0;

  if (modifierSelected) {
    const modTileLen = sequence[modifierTileIndex].letterLength;

    switch (modifier.type) {
      case 'multiply':
        modifierApplies = true;
        modifierMultiplier = modifier.multiplier;
        break;

      case 'position':
        if (modifier.position === 'start' && modifierLetterPos === 0) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'end' && modifierLetterPos + modTileLen === letterCount) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'middle' && modifierLetterPos > 0 && modifierLetterPos + modTileLen < letterCount) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'second' && tileContainsLetterPos(1)) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'penultimate' && tileContainsLetterPos(letterCount - 2) && letterCount >= 2) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'center' && letterCount % 2 === 1 && tileContainsLetterPos(Math.floor(letterCount / 2))) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        } else if (modifier.position === 'centerAny') {
          const midLeft = Math.floor((letterCount - 1) / 2);
          const midRight = Math.ceil((letterCount - 1) / 2);
          if (tileContainsLetterPos(midLeft) || tileContainsLetterPos(midRight)) {
            modifierApplies = true;
            modifierMultiplier = modifier.multiplier;
          }
        }

        if (modifierApplies && typeof modifier.bonus === 'number') {
          modifierBonusPoints = modifier.bonus;
        }
        break;

      case 'length':
        if (modifier.minLength && letterCount >= modifier.minLength) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus || 0;
          modifierMultiplier = modifier.multiplier || 1;
        } else if (modifier.exactLength && letterCount === modifier.exactLength) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus || 0;
          modifierMultiplier = modifier.multiplier || 1;
        } else if (modifier.maxLength && letterCount <= modifier.maxLength) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus || 0;
          modifierMultiplier = modifier.multiplier || 1;
        }
        break;

      case 'parity': {
        const isOdd = letterCount % 2 === 1;
        if ((modifier.parity === 'odd' && isOdd) || (modifier.parity === 'even' && !isOdd)) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus;
        }
        break;
      }

      case 'neighbor': {
        const prevTile = modifierTileIndex > 0 ? sequence[modifierTileIndex - 1] : null;
        const nextTile = modifierTileIndex < sequence.length - 1 ? sequence[modifierTileIndex + 1] : null;
        const vowels = 'AEIOU';
        const prevEndsWithVowel = prevTile && vowels.includes(prevTile.letterUpper.slice(-1));
        const nextStartsWithVowel = nextTile && vowels.includes(nextTile.letterUpper[0]);
        if (prevEndsWithVowel || nextStartsWithVowel) {
          modifierApplies = true;
          modifierMultiplier = modifier.multiplier;
        }
        break;
      }

      case 'composition': {
        const wordString = sequence.map(tile => tile.letterUpper).join('');
        const vowelCount = [...wordString].filter(c => 'AEIOU'.includes(c)).length;
        const consonantCount = letterCount - vowelCount;
        if (modifier.compositionType === 'balanced' && vowelCount === consonantCount) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus;
        } else if (modifier.compositionType === 'vowelRich' && vowelCount > consonantCount) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus;
        } else if (modifier.compositionType === 'vowelCount' && vowelCount >= (modifier.minVowels || 0)) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus;
        } else if (modifier.compositionType === 'consonantCount' && consonantCount >= (modifier.minConsonants || 0)) {
          modifierApplies = true;
          modifierBonusPoints = modifier.bonus;
        }
        break;
      }

      case 'bonus':
        modifierApplies = true;
        modifierBonusPoints = modifier.bonus;
        break;
    }
  }

  let baseScore = 0;
  for (let i = 0; i < sequence.length; i++) {
    const tile = sequence[i];
    let points = tile.points;
    const isModifierTile = modifierSelected && tile.source === 'community' && tile.index === modifier.dieIndex;

    if (isModifierTile && modifierApplies && modifierMultiplier > 1) {
      points *= modifierMultiplier;
    }

    baseScore += points;
  }

  return baseScore + modifierBonusPoints;
}

function computeBestWord(payload) {
  const communityDice = Array.isArray(payload.communityDice) ? payload.communityDice : [];
  const playerDice = Array.isArray(payload.playerDice) ? payload.playerDice : [];
  const modifier = payload.modifier;

  const tiles = [];
  communityDice.forEach((die, index) => {
    if (!die || !die.letter) return;
    tiles.push({
      letter: die.letter,
      letterUpper: String(die.letter).toUpperCase(),
      letterLength: String(die.letter).length,
      points: Number(die.points) || 0,
      source: 'community',
      index,
    });
  });

  playerDice.forEach((die, index) => {
    if (!die || !die.letter) return;
    tiles.push({
      letter: die.letter,
      letterUpper: String(die.letter).toUpperCase(),
      letterLength: String(die.letter).length,
      points: Number(die.points) || 0,
      source: 'player',
      index,
    });
  });

  const used = new Array(tiles.length).fill(false);
  const sequence = [];

  let bestWord = null;
  let bestScore = 0;
  let bestLength = 0;

  const dfs = (currentWordUpper, usedPlayerTile) => {
    for (let i = 0; i < tiles.length; i++) {
      if (used[i]) continue;
      const tile = tiles[i];

      used[i] = true;
      sequence.push(tile);

      const nextWordUpper = currentWordUpper + tile.letterUpper;
      const nextUsedPlayerTile = usedPlayerTile || tile.source === 'player';

      if (nextUsedPlayerTile && nextWordUpper.length >= 2 && dictionary.has(nextWordUpper)) {
        const score = scoreSequence(sequence, modifier);
        if (
          score > bestScore ||
          (score === bestScore && nextWordUpper.length > bestLength) ||
          (score === bestScore && nextWordUpper.length === bestLength && (!bestWord || nextWordUpper < bestWord))
        ) {
          bestScore = score;
          bestWord = nextWordUpper;
          bestLength = nextWordUpper.length;
        }
      }

      if (sequence.length < tiles.length) {
        dfs(nextWordUpper, nextUsedPlayerTile);
      }

      sequence.pop();
      used[i] = false;
    }
  };

  dfs('', false);

  return { bestWord, bestScore };
}

self.onmessage = async (event) => {
  const payload = event.data || {};
  if (payload.type !== 'computeBest') return;

  try {
    await ensureDictionary();
    const result = computeBestWord(payload);
    self.postMessage({
      type: 'bestWordResult',
      roundNumber: payload.roundNumber,
      bestWord: result.bestWord,
      bestScore: result.bestScore,
    });
  } catch (err) {
    self.postMessage({
      type: 'bestWordError',
      roundNumber: payload.roundNumber,
      error: err?.message || 'Best word computation failed',
    });
  }
};
