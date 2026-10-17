import ScriptWorker from './scriptWorker.js?worker';

/**
 * Runs command blocks. A command block holds either a classic slash
 * command ("/tp 0 80 0") or a JavaScript program that runs in an isolated
 * worker (see scriptWorker.js). Every request a script makes is checked
 * here before it touches the game:
 *   - edits only within RANGE blocks of the command block,
 *   - at most MAX_WRITES block changes per run,
 *   - only real block / mob ids,
 *   - MAX_RUNTIME_MS total run time, one run per block at a time.
 * Scripts written by other players in multiplayer only run when the host
 * enables "allowRemoteScripts".
 */
const RANGE = 64;
const MAX_WRITES = 8192;
const MAX_FILL_VOLUME = 32768;
const MAX_RUNTIME_MS = 8000;
const MAX_SAY_LENGTH = 200;

export function isSlashCommand(code) {
  return /^\s*\//.test(code ?? '') && !String(code).includes('\n');
}

export class CommandBlockRunner {
  constructor(game) {
    this.game = game;
    this.running = new Map(); // block key -> { worker, timer }
  }

  getData(x, y, z) {
    const key = this.game.world.coords.getKey(x, y, z);
    return this.game.world.state.blockData.get(key) ?? null;
  }

  /** Redstone trigger (rising edge) or the editor's "Run" button. */
  run(x, y, z, power = 15, { code = null, onLog = null } = {}) {
    const world = this.game.world;
    const key = world.coords.getKey(x, y, z);
    const data = this.getData(x, y, z);
    const source = code ?? data?.command ?? '';
    if (!source.trim()) return false;
    if (
      code === null &&
      data?.remote &&
      !this.game.settings?.allowRemoteScripts
    ) {
      return false;
    }

    if (isSlashCommand(source)) {
      this.game.commandManager?.execute(source.trim().replace(/^\//, ''));
      return true;
    }
    if (this.running.has(key)) return false;
    return this.runScript(key, { x, y, z }, power, source, onLog);
  }

  /** Runs a script centred on a position (mod chat commands). */
  runAt(position, code, onLog = null) {
    const key = `at:${position.x}|${position.y}|${position.z}:${Date.now()}`;
    return this.runScript(key, position, 15, code, onLog);
  }

  runScript(key, block, power, code, onLog) {
    let worker;
    try {
      worker = new ScriptWorker();
    } catch (error) {
      this.log(onLog, `Scripts unavailable: ${error.message}`, true);
      return false;
    }
    const state = { writes: 0 };
    const finish = (error) => {
      const entry = this.running.get(key);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.worker.terminate();
      this.running.delete(key);
      if (error) this.log(onLog, `Script error: ${error}`, true);
      else onLog?.('Script finished.', false);
    };
    const timer = setTimeout(
      () => finish(`stopped after ${MAX_RUNTIME_MS / 1000}s`),
      MAX_RUNTIME_MS
    );
    this.running.set(key, { worker, timer });

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg?.type === 'done') return finish(msg.error);
      if (msg?.type !== 'call') return;
      let value;
      let error = null;
      try {
        value = this.handleCall(
          block,
          state,
          msg.method,
          msg.args ?? [],
          onLog
        );
      } catch (err) {
        error = err.message;
      }
      worker.postMessage({ type: 'result', id: msg.id, value, error });
    };
    worker.onerror = (event) => finish(event.message || 'worker error');
    worker.postMessage({ type: 'run', code, context: { block, power } });
    return true;
  }

  log(onLog, text, isError) {
    if (onLog) onLog(text, isError);
    else
      this.game.chat?.addMessage(
        'Command Block',
        text,
        isError ? 'error' : 'system'
      );
  }

  // ─── API implementation ──────────────────────────────────────────

  coord(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
    return Math.floor(n);
  }

  inRange(block, x, y, z) {
    if (
      Math.abs(x - block.x) > RANGE ||
      Math.abs(y - block.y) > RANGE ||
      Math.abs(z - block.z) > RANGE
    ) {
      throw new Error(`(${x}, ${y}, ${z}) is more than ${RANGE} blocks away`);
    }
  }

  blockId(id) {
    if (id === null || id === 'air') return null;
    if (typeof id !== 'string' || !/^[a-z0-9_:]{1,64}$/.test(id)) {
      throw new Error(`invalid block id ${JSON.stringify(id)}`);
    }
    if (!this.game.world.getBlockData(id.split(':')[0])) {
      throw new Error(`unknown block "${id}"`);
    }
    return id;
  }

  handleCall(block, state, method, args, onLog) {
    const world = this.game.world;
    switch (method) {
      case 'getBlock': {
        const [x, y, z] = args.map((v, i) => this.coord(v, 'xyz'[i]));
        return world.getBlockAt(x, y, z);
      }
      case 'setBlock': {
        const [x, y, z] = args
          .slice(0, 3)
          .map((v, i) => this.coord(v, 'xyz'[i]));
        this.inRange(block, x, y, z);
        const id = this.blockId(args[3]);
        if (++state.writes > MAX_WRITES)
          throw new Error('too many block changes');
        world.setBlockAt(x, y, z, id);
        return true;
      }
      case 'fill': {
        const c = args.slice(0, 6).map((v) => this.coord(v, 'coordinate'));
        const id = this.blockId(args[6]);
        const [x0, x1] = [Math.min(c[0], c[3]), Math.max(c[0], c[3])];
        const [y0, y1] = [Math.min(c[1], c[4]), Math.max(c[1], c[4])];
        const [z0, z1] = [Math.min(c[2], c[5]), Math.max(c[2], c[5])];
        this.inRange(block, x0, y0, z0);
        this.inRange(block, x1, y1, z1);
        const volume = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
        if (volume > MAX_FILL_VOLUME)
          throw new Error(`fill too large (${volume} blocks)`);
        if ((state.writes += volume) > MAX_WRITES)
          throw new Error('too many block changes');
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++)
            for (let z = z0; z <= z1; z++) world.setBlockAt(x, y, z, id);
        return volume;
      }
      case 'time':
        return this.game.dayNight?.timeOfDay ?? 0;
      case 'setTime': {
        const t = Number(args[0]);
        if (!Number.isFinite(t)) throw new Error('time must be a number 0-1');
        this.game.dayNight?.setTime?.(
          ((t % 1) + 1) % 1,
          this.game.dayNight?.totalDays ?? 0
        );
        return true;
      }
      case 'playerPosition': {
        const p = this.game.getPlayerPosition();
        return { x: p.x, y: p.y, z: p.z };
      }
      case 'teleport': {
        const [x, y, z] = args.map((v, i) => this.coord(v, 'xyz'[i]));
        this.game.physics?.resetPlayer(x + 0.5, y, z + 0.5);
        return true;
      }
      case 'give': {
        const id = String(args[0] ?? '');
        if (!/^[a-z0-9_:]{1,64}$/.test(id)) throw new Error('invalid item id');
        const count = Math.max(
          1,
          Math.min(64, Math.floor(Number(args[1]) || 1))
        );
        const kind = world.getBlockData(id) ? 'block' : 'item';
        this.game.gameState.addItemToInventory(id, count, kind);
        window.dispatchEvent(new CustomEvent('inventory-changed'));
        return true;
      }
      case 'heal': {
        const amount = Math.max(0, Math.min(20, Number(args[0]) || 0));
        this.game.gameState.hp = Math.min(20, this.game.gameState.hp + amount);
        window.dispatchEvent(
          new CustomEvent('hp-changed', { detail: this.game.gameState.hp })
        );
        return true;
      }
      case 'say': {
        this.log(onLog, String(args[0] ?? '').slice(0, MAX_SAY_LENGTH), false);
        if (onLog) {
          this.game.chat?.addMessage(
            'Command Block',
            String(args[0] ?? '').slice(0, MAX_SAY_LENGTH),
            'system'
          );
        }
        return true;
      }
      case 'spawn': {
        const mob = String(args[0] ?? '');
        if (!/^[a-z0-9_]{1,40}$/.test(mob)) throw new Error('invalid mob id');
        const [x, y, z] = args
          .slice(1, 4)
          .map((v, i) => this.coord(v, 'xyz'[i]));
        this.inRange(block, x, y, z);
        const spawned = this.game.entities?.spawn(mob, x + 0.5, y, z + 0.5);
        if (!spawned) throw new Error(`could not spawn "${mob}"`);
        return true;
      }
      default:
        throw new Error(`unknown function ${method}`);
    }
  }
}
