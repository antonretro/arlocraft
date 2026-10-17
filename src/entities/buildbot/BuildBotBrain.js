/**
 * Understands chat aimed at a Build Bot: works out whether a message is
 * addressed to a bot ("hey build bot …", "buildbot, …", "bot …") and what it
 * is being asked to do. Pure functions so they are easy to test.
 */

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

const GREETINGS = new Set([
  'hey',
  'hi',
  'hello',
  'yo',
  'ok',
  'okay',
  'oi',
  'please',
  'pls',
  'dear',
  'hay',
  'hei',
]);

/** True for "buildbot", "build bot", "buildbox", "bild bot", "biuld bot" and so on. */
function isBotNameJoined(joined) {
  if (joined.length < 6 || joined.length > 11) return false;
  return (
    levenshtein(joined, 'buildbot') <= 2 ||
    levenshtein(joined, 'buildbots') <= 2 ||
    levenshtein(joined, 'builderbot') <= 2
  );
}

function isSingleBotWord(word) {
  return ['bot', 'bots', 'robot', 'robots', 'botty', 'buddy'].includes(word);
}

function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9~\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Length of a bot name at words[i…], or 0. Also reports whether it was plural. */
function matchName(words, i) {
  const w0 = words[i];
  if (!w0) return null;
  const w1 = words[i + 1];
  if (w1 && isBotNameJoined(w0 + w1)) {
    return { length: 2, plural: /s$/.test(w1) && w1 !== 'bus' };
  }
  if (isBotNameJoined(w0)) return { length: 1, plural: w0.endsWith('s') };
  if (isSingleBotWord(w0)) return { length: 1, plural: w0.endsWith('s') };
  return null;
}

/**
 * Returns { command: string[], plural } when the message is addressed to a
 * bot, else null. The bot name can lead ("hey build bot, dig") or trail
 * ("dig a hole, build bot").
 */
export function parseAddress(text) {
  const words = normalize(text);
  if (words.length === 0) return null;

  let i = 0;
  let all = false;
  while (i < words.length && GREETINGS.has(words[i])) i++;
  if (words[i] === 'all' || words[i] === 'every') {
    all = true;
    i++;
    if (words[i] === 'the') i++;
  }
  if (words[i] === 'the' || words[i] === 'my' || words[i] === 'mr') i++;
  const lead = matchName(words, i);
  if (lead) {
    return {
      command: words.slice(i + lead.length),
      plural: all || lead.plural,
    };
  }

  // Trailing form: "come here build bot".
  for (const len of [2, 1]) {
    const start = words.length - len;
    if (start < 1) continue;
    const tail = matchName(words, start);
    if (tail && tail.length === len) {
      let end = start;
      while (end > 0 && ['hey', 'the', 'my'].includes(words[end - 1])) end--;
      return { command: words.slice(0, end), plural: tail.plural };
    }
  }
  return null;
}

// Words the intent matcher knows. Typos within one or two letters are
// snapped to the nearest of these.
const KEYWORDS = [
  'follow',
  'stay',
  'wait',
  'come',
  'here',
  'stop',
  'cancel',
  'halt',
  'trees',
  'tree',
  'wood',
  'woods',
  'logs',
  'log',
  'timber',
  'chop',
  'mine',
  'mining',
  'stone',
  'stones',
  'cobblestone',
  'cobble',
  'rock',
  'rocks',
  'diamonds',
  'diamond',
  'iron',
  'coal',
  'gold',
  'copper',
  'redstone',
  'lapis',
  'emerald',
  'emeralds',
  'ores',
  'ore',
  'find',
  'dig',
  'digging',
  'hole',
  'staircase',
  'stairs',
  'stair',
  'down',
  'build',
  'house',
  'home',
  'hut',
  'shelter',
  'wall',
  'tower',
  'bridge',
  'torches',
  'torch',
  'light',
  'give',
  'hand',
  'help',
  'inventory',
  'have',
  'collect',
  'gather',
  'harvest',
  'thanks',
  'thank',
  'please',
  'over',
  'what',
];

function snapWord(word) {
  if (word.length < 4 || KEYWORDS.includes(word)) return word;
  const limit = word.length >= 7 ? 2 : 1;
  let best = word;
  let bestDist = limit + 1;
  for (const key of KEYWORDS) {
    if (Math.abs(key.length - word.length) > limit) continue;
    const d = levenshtein(word, key);
    if (d < bestDist) {
      best = key;
      bestDist = d;
    }
  }
  return bestDist <= limit ? best : word;
}

const ORE_WORDS = {
  coal: 'coal',
  iron: 'iron',
  gold: 'gold',
  copper: 'copper',
  redstone: 'redstone',
  lapis: 'lapis',
  emerald: 'emerald',
  emeralds: 'emerald',
  diamond: 'diamond',
  diamonds: 'diamond',
  ore: 'any',
  ores: 'any',
};

/**
 * Maps the words after the bot's name to an intent:
 * { type, …details }. Unknown requests return { type: 'unknown' }.
 */
export function parseIntent(commandWords) {
  const words = commandWords.map(snapWord);
  const phrase = words.join(' ');
  const text = ` ${phrase} `;
  const has = (...keys) => keys.some((k) => text.includes(` ${k} `));

  if (words.length === 0) return { type: 'greet' };
  if (
    words.length <= 3 &&
    has('thanks', 'thank', 'thx', 'ty', 'good bot', 'nice', 'cool')
  )
    return { type: 'thanks' };
  if (has('what can you do', 'what do you do', 'commands'))
    return { type: 'help' };
  if (
    has(
      'what do you have',
      'what have you got',
      'whatcha got',
      'inventory',
      'what you have',
      'what is in your',
      'list'
    )
  )
    return { type: 'inventory' };
  if (
    has('give', 'hand over', 'hand it', 'hand me', 'gimme', 'drop', 'deliver')
  )
    return { type: 'give' };
  if (has('stop', 'cancel', 'halt', 'never mind', 'nevermind', 'quit', 'abort'))
    return { type: 'stop' };
  if (has('follow')) return { type: 'follow' };
  if (has('stay', 'wait', 'stand still', 'hold on', 'sit', 'dont move'))
    return { type: 'stay' };
  if (
    has('come') ||
    ['here', 'over here', 'to me', 'get over here', 'here boy'].includes(phrase)
  )
    return { type: 'come' };

  if (has('torch', 'torches', 'light', 'lights', 'lamp', 'lamps'))
    return { type: 'torches' };

  if (has('build', 'make', 'construct')) {
    const material = has('stone', 'cobblestone', 'cobble', 'rock')
      ? 'cobblestone'
      : has('wood', 'wooden', 'planks', 'plank')
        ? 'planks'
        : null;
    if (has('house', 'home', 'hut', 'shelter', 'cabin', 'base'))
      return { type: 'build', shape: 'house', material };
    if (has('tower', 'pillar', 'lookout'))
      return { type: 'build', shape: 'tower', material };
    if (has('bridge')) return { type: 'build', shape: 'bridge', material };
    if (has('wall', 'walls', 'fence'))
      return { type: 'build', shape: 'wall', material };
    if (has('stairs', 'staircase', 'stair'))
      return { type: 'dig', shape: 'staircase' };
    return { type: 'build', shape: null, material };
  }

  for (const word of words) {
    const ore = ORE_WORDS[word];
    if (ore) return { type: 'ore', ore };
  }

  if (
    has(
      'tree',
      'trees',
      'wood',
      'woods',
      'log',
      'logs',
      'timber',
      'chop',
      'lumber',
      'lumberjack'
    )
  )
    return { type: 'trees' };

  if (has('stone', 'stones', 'cobblestone', 'cobble', 'rock', 'rocks'))
    return { type: 'stone' };

  if (has('stairs', 'staircase', 'stair'))
    return { type: 'dig', shape: 'staircase' };
  if (has('dig', 'digging', 'hole', 'excavate', 'shovel', 'mine', 'mining'))
    return { type: 'dig', shape: 'hole' };

  if (has('help')) return { type: 'help' };
  if (has('hello', 'hi', 'hey')) return { type: 'greet' };
  return { type: 'unknown' };
}

export const BOT_HELP_LINES = [
  "Talk to me with 'hey build bot …'. I can:",
  "• 'mine trees' / 'chop wood' – fell nearby trees and bring you the logs",
  "• 'dig a hole' / 'dig stairs' – dig near you and keep the blocks",
  "• 'mine stone' / 'find iron', 'find coal', 'find diamonds' – mine shallow stone and ore",
  "• 'build a house', 'a wall', 'a tower', 'a bridge' – uses planks or cobblestone",
  "• 'light it up' – place torches around you",
  "• 'follow me', 'stay', 'come here', 'stop'",
  "• 'give me' / 'what do you have' – hand over or list what I collected",
];
