/**
 * Sandbox for command block scripts. Each run gets a fresh worker that the
 * game terminates afterwards. Scripts have no DOM, storage or network
 * access; everything they can do goes through the small async API below,
 * which the game validates (range, block ids, limits) before acting.
 */

// Remove every way for a script to reach the network or spawn more code.
const BLOCKED = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'importScripts',
  'indexedDB',
  'caches',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'navigator',
  'location',
  'RTCPeerConnection',
];
for (let scope = self; scope; scope = Object.getPrototypeOf(scope)) {
  for (const name of BLOCKED) {
    if (!Object.prototype.hasOwnProperty.call(scope, name)) continue;
    try {
      delete scope[name];
    } catch {
      // Non-configurable: shadow it below instead.
    }
  }
}
for (const name of BLOCKED) {
  try {
    Object.defineProperty(self, name, {
      value: undefined,
      configurable: false,
    });
  } catch {
    // Already removed.
  }
}

const postToGame = self.postMessage.bind(self);
let nextCall = 1;
const pending = new Map();

function call(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = nextCall++;
    pending.set(id, { resolve, reject });
    postToGame({ type: 'call', id, method, args });
  });
}

function format(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg?.type === 'result') {
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error));
    else entry.resolve(msg.value);
    return;
  }
  if (msg?.type !== 'run') return;

  const { code, context } = msg;
  const block = Object.freeze({ ...context.block });
  const api = {
    block,
    power: context.power,
    world: Object.freeze({
      getBlock: (x, y, z) => call('getBlock', x, y, z),
      setBlock: (x, y, z, id) => call('setBlock', x, y, z, id),
      fill: (x1, y1, z1, x2, y2, z2, id) =>
        call('fill', x1, y1, z1, x2, y2, z2, id),
      time: () => call('time'),
      setTime: (t) => call('setTime', t),
    }),
    player: Object.freeze({
      position: () => call('playerPosition'),
      teleport: (x, y, z) => call('teleport', x, y, z),
      give: (id, count = 1) => call('give', id, count),
      heal: (amount = 20) => call('heal', amount),
    }),
    say: (...parts) => call('say', parts.map(format).join(' ')),
    spawn: (mobId, x, y, z) => call('spawn', mobId, x, y, z),
    sleep: (ms) =>
      new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, Number(ms) || 0))
      ),
    random: (min = 0, max = 1) => min + Math.random() * (max - min),
    here: (dx = 0, dy = 0, dz = 0) => ({
      x: block.x + dx,
      y: block.y + dy,
      z: block.z + dz,
    }),
  };

  try {
    const names = Object.keys(api);
    const run = new Function(
      ...names,
      `"use strict";\nreturn (async () => {\n${code}\n})();`
    );
    await run(...names.map((n) => api[n]));
    postToGame({ type: 'done' });
  } catch (error) {
    postToGame({ type: 'done', error: String(error?.message ?? error) });
  }
};
