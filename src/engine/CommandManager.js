import { MOBS } from '../data/mobs.js';
import { BLOCKS, BLOCKS_BY_ID } from '../data/blocks.js';
import { TOOLS } from '../data/tools.js';
import { ARMOR } from '../data/items/armor.js';
import { normalizeBlockVariantId } from '../data/blockIds.js';
import { POTION_EFFECTS } from './PotionSystem.js';
import { levenshtein } from '../entities/buildbot/BuildBotBrain.js';

/**
 * CommandManager
 * Registers chat commands with usage and argument metadata, runs them, and
 * answers the chat box's helper popup (matching commands, argument
 * completions and errors as you type).
 */

const MAX_FILL = 32768;
const MAX_SUMMON = 16;

// Mob ids the world generator uses that map onto existing mobs.
const EXTRA_MOB_IDS = { villager_desert: 'Desert Villager', knight: 'Knight' };
const MOB_ALIASES = {
  buildbot: 'build_bot',
  build: 'build_bot',
  'build-bot': 'build_bot',
  bot: 'build_bot',
  robot: 'build_bot',
};

const TIME_VALUES = {
  sunrise: 0,
  day: 1000,
  noon: 6000,
  sunset: 12000,
  night: 13000,
  midnight: 18000,
};

const WEATHER_TYPES = {
  clear: { type: 'clear', intensity: 0, label: 'Clear skies' },
  rain: { type: 'rain', intensity: 0.68, label: 'Rain' },
  thunder: { type: 'storm', intensity: 1, label: 'Thunderstorm' },
};

const GAMEMODES = {
  survival: 'SURVIVAL',
  creative: 'CREATIVE',
  adventure: 'ADVENTURE',
  s: 'SURVIVAL',
  c: 'CREATIVE',
  a: 'ADVENTURE',
  0: 'SURVIVAL',
  1: 'CREATIVE',
  2: 'ADVENTURE',
};

const COORD_RE = /^(~(-?\d+(\.\d+)?)?|-?\d+(\.\d+)?)$/;

function titleCase(id) {
  return String(id)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ranks candidates: prefix matches first, then substring matches. */
function rank(candidates, partial, limit = 40) {
  const p = partial.toLowerCase();
  if (!p) return candidates.slice(0, limit);
  const starts = [];
  const contains = [];
  for (const c of candidates) {
    const v = c.value.toLowerCase();
    if (v.startsWith(p)) starts.push(c);
    else if (v.includes(p) || c.detail?.toLowerCase().includes(p))
      contains.push(c);
  }
  starts.sort((a, b) => a.value.length - b.value.length);
  return [...starts, ...contains].slice(0, limit);
}

function closest(word, options) {
  let best = null;
  let bestD = Infinity;
  for (const o of options) {
    const d = levenshtein(word, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : null;
}

export class CommandManager {
  constructor(game) {
    this.game = game;
    this.commands = new Map();
    this.aliases = new Map();
    this.buildCatalogs();
    this.init();
  }

  buildCatalogs() {
    this.mobList = [
      ...MOBS.map((m) => ({
        value: m.id,
        detail:
          m.name +
          (m.companion
            ? ' · helper robot'
            : m.friendly
              ? ''
              : m.neutral
                ? ' · neutral'
                : ' · hostile'),
      })),
      ...Object.entries(EXTRA_MOB_IDS).map(([value, detail]) => ({
        value,
        detail,
      })),
    ];
    // build_bot first: it is the one people summon most.
    this.mobList.sort((a, b) =>
      a.value === 'build_bot' ? -1 : b.value === 'build_bot' ? 1 : 0
    );
    this.mobIds = new Set(this.mobList.map((m) => m.value));

    const items = new Map();
    for (const b of BLOCKS) {
      if (b.id.startsWith('spawn_egg_')) continue;
      items.set(b.id, b.name || titleCase(b.id));
    }
    for (const t of TOOLS) items.set(t.id, t.name || titleCase(t.id));
    for (const a of ARMOR) items.set(a.id, a.name || titleCase(a.id));
    this.itemList = [...items.entries()]
      .map(([value, detail]) => ({ value, detail }))
      .sort((a, b) => a.value.localeCompare(b.value));
    this.itemIds = new Set(items.keys());

    const nonBlocks = new Set([
      ...TOOLS.map((t) => t.id),
      ...ARMOR.map((a) => a.id),
    ]);
    this.blockList = [
      { value: 'air', detail: 'Air (removes blocks)' },
      ...this.itemList.filter(
        (i) => BLOCKS_BY_ID.has(i.value) && !nonBlocks.has(i.value)
      ),
    ];
  }

  // --- Registration ----------------------------------------------------

  /**
   * register(name, description, handler, { usage, args, aliases, prepare })
   * `args` describe each argument ({ name, type, optional }) for the helper.
   */
  register(name, description, handler, options = {}) {
    const key = name.toLowerCase();
    this.commands.set(key, {
      name: key,
      description,
      handler,
      usage: options.usage ?? `/${key}`,
      args: options.args ?? [],
      aliases: options.aliases ?? [],
      prepare: options.prepare ?? null,
      hidden: Boolean(options.hidden),
    });
    for (const alias of options.aliases ?? []) this.aliases.set(alias, key);
  }

  resolve(name) {
    const key = String(name ?? '').toLowerCase();
    return this.commands.get(key) ?? this.commands.get(this.aliases.get(key));
  }

  listCommands() {
    return [...this.commands.values()]
      .filter((c) => !c.hidden)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  say(text, type = 'system') {
    this.game.chat?.addMessage('SYSTEM', text, type);
  }

  // --- Execution -------------------------------------------------------

  execute(cmdLine) {
    const tokens = String(cmdLine ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) return false;
    const typed = tokens.shift().toLowerCase();
    const command = this.resolve(typed);

    if (!command) {
      const guess = closest(typed, [
        ...this.commands.keys(),
        ...this.aliases.keys(),
      ]);
      this.say(
        `Unknown command /${typed}.` +
          (guess ? ` Did you mean /${this.resolve(guess).name}?` : '') +
          ' Type /help for a list.',
        'error'
      );
      return false;
    }

    const args = command.prepare ? command.prepare(tokens) : tokens;
    const problem = this.validateArgs(command, args, true);
    if (problem) {
      this.say(`${problem}  Usage: ${command.usage}`, 'error');
      return false;
    }

    try {
      const result = command.handler(args);
      return result !== false;
    } catch (err) {
      this.say(`/${command.name}: ${err.message}`, 'error');
      return false;
    }
  }

  /** First problem with the arguments, or null. */
  validateArgs(command, args, complete) {
    const specs = command.args;
    for (let i = 0; i < args.length && i < specs.length; i++) {
      const spec = this.argSpec(command, i, args);
      if (!spec) break;
      const problem = this.checkValue(spec, args[i], args);
      if (problem) return problem;
    }
    if (complete) {
      for (let i = args.length; i < specs.length; i++) {
        const spec = this.argSpec(command, i, args);
        if (spec && !spec.optional) return `Missing <${spec.name}>.`;
      }
    }
    return null;
  }

  argSpec(command, index, args) {
    const spec = command.args[index];
    if (!spec) return null;
    return typeof spec === 'function' ? spec(args) : spec;
  }

  checkValue(spec, value, args) {
    const v = String(value ?? '');
    const lower = v.toLowerCase();
    switch (spec.type) {
      case 'mob':
        if (this.resolveMobId(lower)) return null;
        return this.unknown('mob', lower, [...this.mobIds]);
      case 'item':
        if (this.itemIds.has(normalizeBlockVariantId(lower))) return null;
        return this.unknown('item', lower, [...this.itemIds]);
      case 'block':
        if (lower === 'air' || BLOCKS_BY_ID.has(normalizeBlockVariantId(lower)))
          return null;
        return this.unknown(
          'block',
          lower,
          this.blockList.map((b) => b.value)
        );
      case 'coord':
        return COORD_RE.test(v)
          ? null
          : `"${v}" is not a coordinate. Use a number or ~ (your position).`;
      case 'int': {
        const n = Number(v);
        if (!Number.isInteger(n) || n < (spec.min ?? 1))
          return `<${spec.name}> must be a whole number${spec.min === 0 ? '' : ' above 0'}.`;
        if (spec.max && n > spec.max)
          return `<${spec.name}> can be at most ${spec.max}.`;
        return null;
      }
      case 'time':
        if (lower in TIME_VALUES || /^\d+$/.test(lower)) return null;
        return `Unknown time "${v}". Try day, noon, night, midnight or a number of ticks (0-24000).`;
      case 'enum': {
        const values = this.enumValues(spec, args).map((e) => e.value);
        if (values.includes(lower)) return null;
        return `"${v}" is not valid for <${spec.name}>. Options: ${values.slice(0, 8).join(', ')}.`;
      }
      case 'command':
        return this.resolve(lower) || /^\d+$/.test(lower)
          ? null
          : `Unknown command "${v}".`;
      default:
        return null;
    }
  }

  unknown(kind, value, options) {
    const guess = closest(value, options);
    return `Unknown ${kind} "${value}".${guess ? ` Did you mean ${guess}?` : ''}`;
  }

  resolveMobId(id) {
    const key = String(id ?? '').toLowerCase();
    if (this.mobIds.has(key)) return key;
    if (MOB_ALIASES[key]) return MOB_ALIASES[key];
    return null;
  }

  enumValues(spec, args) {
    return typeof spec.values === 'function'
      ? spec.values(args)
      : (spec.values ?? []);
  }

  // --- Helper popup ----------------------------------------------------

  /**
   * Suggestions for the text after the leading "/". Returns
   * { kind: 'command' | 'arg', items: [{ value, label, detail }], command,
   *   argIndex, error, hint }.
   */
  getSuggestions(text) {
    const raw = String(text ?? '');
    const tokens = raw.replace(/^\s+/, '').split(/\s+/);
    if (tokens.length <= 1) {
      const partial = (tokens[0] ?? '').toLowerCase();
      const all = this.listCommands().map((c) => ({
        value: c.name,
        label: `/${c.name}`,
        detail: c.description,
        usage: c.usage,
      }));
      let items = rank(all, partial, 40);
      // Aliases (/gm, /mode …) lead to their command.
      if (partial) {
        for (const [alias, target] of this.aliases) {
          if (
            alias.startsWith(partial) &&
            !items.some((i) => i.value === target)
          ) {
            const c = this.commands.get(target);
            items.push({
              value: c.name,
              label: `/${c.name}`,
              detail: `${c.description} (alias /${alias})`,
              usage: c.usage,
            });
          }
        }
      }
      if (items.length === 0 && partial) {
        const guess = closest(partial, [...this.commands.keys()]);
        return {
          kind: 'command',
          items: guess ? all.filter((c) => c.value === guess) : [],
          error: `Unknown command "/${partial}".${guess ? ` Did you mean /${guess}?` : ''}`,
        };
      }
      return { kind: 'command', items, error: null };
    }

    const command = this.resolve(tokens[0]);
    if (!command) {
      return {
        kind: 'arg',
        items: [],
        error: `Unknown command "/${tokens[0]}". Type /help for a list.`,
      };
    }
    let rest = tokens.slice(1);
    const partial = rest[rest.length - 1] ?? '';
    // Normalise the finished arguments only; the one being typed stays raw.
    if (command.prepare)
      rest = [...command.prepare(rest.slice(0, -1)), partial];
    const argIndex = rest.length - 1;
    const done = rest.slice(0, argIndex);
    const base = { kind: 'arg', command, argIndex, error: null };

    for (let i = 0; i < done.length; i++) {
      const spec = this.argSpec(command, i, rest);
      if (!spec) return { ...base, items: [], error: `Too many arguments.` };
      const problem = this.checkValue(spec, done[i], rest);
      if (problem) return { ...base, items: [], error: problem, argIndex: i };
    }

    const spec = this.argSpec(command, argIndex, rest);
    if (!spec) {
      return {
        ...base,
        items: [],
        error: command.args.length ? 'Too many arguments.' : null,
        hint: command.args.length ? null : 'Press Enter to run.',
      };
    }
    const items = rank(this.candidates(spec, rest), partial, 40);
    let error = null;
    if (partial && items.length === 0) {
      error = this.checkValue(spec, partial, rest);
    }
    return { ...base, spec, items, error, hint: spec.hint ?? null };
  }

  candidates(spec, args) {
    const p = this.game.getPlayerPosition?.() ?? { x: 0, y: 0, z: 0 };
    switch (spec.type) {
      case 'mob':
        return this.mobList;
      case 'item':
        return this.itemList;
      case 'block':
        return this.blockList;
      case 'coord': {
        const axis = spec.axis ?? 'x';
        const here = Math.floor(p[axis] ?? 0);
        const out = [
          { value: '~', detail: `relative · your ${axis} (${here})` },
        ];
        if (axis === 'x' && !spec.single)
          out.unshift({ value: '~ ~ ~', detail: 'your position', multi: 3 });
        out.push({ value: String(here), detail: `current ${axis}` });
        return out;
      }
      case 'int':
        return (spec.examples ?? []).map((v) => ({
          value: String(v),
          detail: spec.name,
        }));
      case 'time':
        return Object.entries(TIME_VALUES).map(([value, ticks]) => ({
          value,
          detail: `${ticks} ticks`,
        }));
      case 'enum':
        return this.enumValues(spec, args);
      case 'command':
        return this.listCommands().map((c) => ({
          value: c.name,
          detail: c.description,
        }));
      default:
        return [];
    }
  }

  // --- Shared helpers for handlers --------------------------------------

  playerPos() {
    return this.game.getPlayerPosition();
  }

  /** "~", "~3", "12" → number, relative to `base`. */
  coord(token, base) {
    const t = String(token);
    if (t.startsWith('~'))
      return base + (t.length > 1 ? Number(t.slice(1)) : 0);
    return Number(t);
  }

  blockCoords(args, offset = 0) {
    const p = this.playerPos();
    return {
      x: Math.floor(this.coord(args[offset], Math.floor(p.x))),
      y: Math.floor(this.coord(args[offset + 1], Math.floor(p.y))),
      z: Math.floor(this.coord(args[offset + 2], Math.floor(p.z))),
    };
  }

  setWorldBlock(x, y, z, id) {
    const world = this.game.world;
    if (id === 'air') {
      const key = world.getKey(x, y, z);
      if (!world.state.blockMap.get(key)) return false;
      world.state.changedBlocks.set(key, null);
      world.removeBlockByKey(key, {
        skipChangeTracking: true,
        skipParticles: true,
      });
      return true;
    }
    world.setBlockAt(x, y, z, id);
    return true;
  }

  // --- Commands --------------------------------------------------------

  init() {
    const coordArgs = (optional = false) => [
      { name: 'x', type: 'coord', axis: 'x', optional },
      { name: 'y', type: 'coord', axis: 'y', optional, single: true },
      { name: 'z', type: 'coord', axis: 'z', optional, single: true },
    ];

    this.register(
      'help',
      'List commands, or explain one',
      (args) => {
        if (args[0] && !/^\d+$/.test(args[0])) {
          const c = this.resolve(args[0]);
          this.say(`${c.usage} — ${c.description}`);
          if (c.aliases.length)
            this.say(`Also: ${c.aliases.map((a) => `/${a}`).join(', ')}`);
          return;
        }
        const list = this.listCommands();
        const perPage = 8;
        const pages = Math.ceil(list.length / perPage);
        const page = Math.min(pages, Math.max(1, Number(args[0]) || 1));
        this.say(
          `Commands (page ${page}/${pages})` +
            (page < pages ? ` — /help ${page + 1} for more` : '') +
            '. Tab completes as you type.'
        );
        for (const c of list.slice((page - 1) * perPage, page * perPage)) {
          this.say(`${c.usage} — ${c.description}`);
        }
      },
      {
        usage: '/help [command|page]',
        args: [{ name: 'command', type: 'command', optional: true }],
        aliases: ['?'],
      }
    );

    this.register(
      'tp',
      'Teleport to a position (~ is relative)',
      (args) => {
        const p = this.playerPos();
        const x = this.coord(args[0], p.x);
        const y = this.coord(args[1], p.y);
        const z = this.coord(args[2], p.z);
        const physics = this.game.physics;
        const safe = physics?.resolveSafeSpawn
          ? physics.resolveSafeSpawn(x, y, z, 4, { preferGround: false })
          : { x, y, z };
        physics?.playerBody?.setTranslation(safe, true);
        physics?.playerBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
        physics?.lastSafePosition?.copy?.(physics.position);
        if (physics) physics.fallDistance = 0;
        this.say(
          `Teleported to ${safe.x.toFixed(1)}, ${safe.y.toFixed(1)}, ${safe.z.toFixed(1)}`
        );
      },
      { usage: '/tp <x> <y> <z>', args: coordArgs(), aliases: ['teleport'] }
    );

    this.register(
      'gamemode',
      'Switch between survival, creative and adventure',
      (args) => {
        const mode = GAMEMODES[args[0].toLowerCase()];
        if (this.game.setMenuMode) this.game.setMenuMode(mode);
        else this.game.gameState.setMode(mode);
        this.say(`Game mode set to ${titleCase(mode.toLowerCase())}`);
      },
      {
        usage: '/gamemode <survival|creative|adventure>',
        aliases: ['gm', 'mode'],
        args: [
          {
            name: 'mode',
            type: 'enum',
            values: [
              { value: 'survival', detail: 'Health, hunger and mining' },
              { value: 'creative', detail: 'Fly, build freely, no damage' },
              { value: 'adventure', detail: 'Survival rules for maps' },
              { value: 's', detail: 'survival' },
              { value: 'c', detail: 'creative' },
              { value: 'a', detail: 'adventure' },
              { value: '0', detail: 'survival' },
              { value: '1', detail: 'creative' },
              { value: '2', detail: 'adventure' },
            ],
          },
        ],
      }
    );

    this.register(
      'time',
      'Set, add to or show the time of day',
      (args) => {
        const dayNight = this.game.dayNight;
        if (!dayNight) throw new Error('No day/night cycle in this world.');
        const action = args[0].toLowerCase();
        // Minecraft ticks: 0 = 6:00, 24000 per day. Day fraction: 0 = midnight.
        const toFraction = (ticks) => (((ticks / 24000 + 0.25) % 1) + 1) % 1;
        const currentTicks = Math.round(
          (((((dayNight.timeOfDay ?? 0) - 0.25) % 1) + 1) % 1) * 24000
        );
        if (action === 'query') {
          this.say(
            `It is ${dayNight.getTimeString?.() ?? ''} (${currentTicks} ticks), day ${dayNight.getDayNumber?.() ?? 1}.`
          );
          return;
        }
        if (!args[1]) throw new Error(`Usage: /time ${action} <value>`);
        const v = args[1].toLowerCase();
        const ticks = v in TIME_VALUES ? TIME_VALUES[v] : parseInt(v, 10);
        if (!Number.isFinite(ticks)) throw new Error(`Unknown time "${v}".`);
        const target = action === 'add' ? currentTicks + ticks : ticks;
        dayNight.setTime(toFraction(target));
        this.say(
          `Time set to ${dayNight.getTimeString?.() ?? target} (${((target % 24000) + 24000) % 24000} ticks)`
        );
      },
      {
        usage: '/time <set|add|query> [value]',
        args: [
          {
            name: 'action',
            type: 'enum',
            values: [
              { value: 'set', detail: 'Jump to a time: day, noon, night …' },
              { value: 'add', detail: 'Skip ahead by ticks' },
              { value: 'query', detail: 'Show the current time' },
            ],
          },
          (args) =>
            args[0]?.toLowerCase() === 'add'
              ? { name: 'ticks', type: 'int', examples: [1000, 6000, 12000] }
              : args[0]?.toLowerCase() === 'query'
                ? null
                : { name: 'time', type: 'time', optional: true },
        ],
      }
    );

    // /day and /night are handy shortcuts.
    this.register(
      'day',
      'Make it morning',
      () => this.execute('time set day'),
      { usage: '/day' }
    );
    this.register(
      'night',
      'Make it night',
      () => this.execute('time set night'),
      { usage: '/night' }
    );

    this.register(
      'weather',
      'Change the weather',
      (args) => {
        const w = WEATHER_TYPES[args[0].toLowerCase()];
        const dayNight = this.game.dayNight;
        if (!dayNight?.setWeather) throw new Error('Weather is not available.');
        const seconds = Number(args[1]) || 300;
        dayNight.setWeather(w.type, dayNight.weatherIntensity ?? 0);
        dayNight.weatherTimer = seconds;
        this.say(`${w.label} for ${seconds} seconds`);
      },
      {
        usage: '/weather <clear|rain|thunder> [seconds]',
        args: [
          {
            name: 'type',
            type: 'enum',
            values: [
              { value: 'clear', detail: 'Sunny skies' },
              { value: 'rain', detail: 'Rain (snow when cold)' },
              { value: 'thunder', detail: 'Heavy storm' },
            ],
          },
          {
            name: 'seconds',
            type: 'int',
            optional: true,
            examples: [60, 300, 600],
          },
        ],
      }
    );

    this.register(
      'give',
      'Put items in your inventory',
      (args) => {
        const id = normalizeBlockVariantId(args[0].toLowerCase());
        const count = Math.min(64 * 36, parseInt(args[1], 10) || 1);
        const gs = this.game.gameState;
        const stack = gs.createItemStack(id, count);
        gs.addItemStack(stack);
        const given = count - stack.count;
        const name = BLOCKS_BY_ID.get(id)?.name ?? titleCase(id);
        if (given <= 0) throw new Error('Your inventory is full.');
        this.say(
          `Gave ${given} × ${name}` +
            (stack.count > 0 ? ` (${stack.count} did not fit)` : '')
        );
      },
      {
        usage: '/give <item> [count]',
        args: [
          { name: 'item', type: 'item' },
          { name: 'count', type: 'int', optional: true, examples: [1, 16, 64] },
        ],
        // Accept Minecraft's "/give @p <item>" and "/give <name> <item>" too.
        prepare: (args) => {
          const first = args[0]?.toLowerCase();
          if (!first) return args;
          const me = (this.game.settings?.skinUsername || 'me').toLowerCase();
          if (first.startsWith('@') || first === me) return args.slice(1);
          return args;
        },
      }
    );

    this.register(
      'summon',
      'Spawn any creature, or a Build Bot helper',
      (args) => {
        const id = this.resolveMobId(args[0]);
        const p = this.playerPos();
        const yaw = this.game.viewYaw ?? 0;
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        let count = 1;
        let origin;
        const world = this.game.world;
        const hasCoords = args.length >= 4;
        if (hasCoords) {
          origin = {
            x: this.coord(args[1], p.x),
            y: this.coord(args[2], p.y),
            z: this.coord(args[3], p.z),
          };
          count = parseInt(args[4], 10) || 1;
        } else {
          if (args.length === 2) count = parseInt(args[1], 10) || 1;
          else if (args.length === 3)
            throw new Error('Give all three coordinates (x y z), or none.');
          origin = { x: p.x + fx * 3, y: p.y, z: p.z + fz * 3 };
        }
        count = Math.max(1, Math.min(MAX_SUMMON, count));

        const entities = this.game.entities;
        if (!entities) throw new Error('Entities are not available.');
        const config = entities.getMobConfig(id);
        if (config?.companion) {
          const room = 3 - entities.getBuildBots().length;
          if (room <= 0)
            throw new Error('You already have 3 Build Bots, the most allowed.');
          count = Math.min(count, room);
        }

        let spawned = 0;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          const r = count > 1 ? 1.2 + count * 0.15 : 0;
          const x = origin.x + Math.cos(a) * r;
          const z = origin.z + Math.sin(a) * r;
          let y = origin.y;
          if (!hasCoords) y = world.getGroundYBelow(x, p.y + 3, z);
          const e = entities.spawn(id, x, y + 0.02, z);
          if (!e) break;
          spawned++;
          if (e.isCompanion) {
            e.say(
              "Beep boop! I'm here to help. Say 'hey build bot help' to see what I can do."
            );
          }
        }
        const name = config?.name ?? titleCase(id);
        if (spawned === 0)
          throw new Error(
            `Couldn't summon ${name}: too many creatures nearby (limit ${entities.maxEntities}). Try /kill mobs.`
          );
        this.say(
          spawned === 1
            ? `Summoned ${name}`
            : `Summoned ${spawned} × ${name}` +
                (spawned < count ? ' (creature limit reached)' : '')
        );
      },
      {
        usage: '/summon <mob> [x y z] [count]',
        args: [
          { name: 'mob', type: 'mob' },
          (args) =>
            args[0]?.toLowerCase() === 'build' && args.length === 2
              ? {
                  name: 'mob',
                  type: 'enum',
                  values: [
                    { value: 'bot', detail: 'Build Bot · helper robot' },
                  ],
                }
              : args.length === 2 &&
                  /^\d+$/.test(args[1]) &&
                  !args[1].startsWith('~')
                ? {
                    name: 'count',
                    type: 'int',
                    optional: true,
                    max: MAX_SUMMON,
                  }
                : { name: 'x', type: 'coord', axis: 'x', optional: true },
          { name: 'y', type: 'coord', axis: 'y', optional: true, single: true },
          { name: 'z', type: 'coord', axis: 'z', optional: true, single: true },
          {
            name: 'count',
            type: 'int',
            optional: true,
            max: MAX_SUMMON,
            examples: [1, 3, 5],
          },
        ],
        // "/summon build bot" → build_bot
        prepare: (args) => {
          if (
            args[0]?.toLowerCase() === 'build' &&
            args[1] !== undefined &&
            'bot'.startsWith(args[1].toLowerCase()) &&
            args[1] !== ''
          ) {
            return ['build_bot', ...args.slice(2)];
          }
          return args;
        },
      }
    );

    this.register(
      'kill',
      'Kill yourself, all mobs, one kind of mob, or Build Bots',
      (args) => {
        const target = (args[0] ?? '@s').toLowerCase();
        const gs = this.game.gameState;
        if (target === '@s' || target === 'me' || target === '@p') {
          gs.hp = 0;
          window.dispatchEvent(new CustomEvent('hp-changed', { detail: 0 }));
          gs.die('command');
          this.say('Ouch. You were killed.');
          return;
        }
        const entities = this.game.entities?.entities ?? [];
        let victims;
        if (target === '@e' || target === 'mobs' || target === 'all') {
          victims = entities.filter((e) => !e.isCompanion);
        } else if (
          target === 'bots' ||
          this.resolveMobId(target) === 'build_bot'
        ) {
          victims = entities.filter((e) => e.isCompanion);
        } else {
          const id = this.resolveMobId(target);
          if (!id)
            throw new Error(this.unknown('target', target, [...this.mobIds]));
          victims = entities.filter((e) => e.config?.id === id || e.id === id);
        }
        for (const e of victims) {
          e.dead = true;
          if (e.mesh?.parent) e.mesh.parent.remove(e.mesh);
        }
        this.say(
          victims.length
            ? `Removed ${victims.length} ${victims.length === 1 ? 'creature' : 'creatures'}`
            : 'Nothing to remove.'
        );
      },
      {
        usage: '/kill [@s|mobs|bots|<mob>]',
        args: [
          {
            name: 'target',
            type: 'enum',
            optional: true,
            values: () => [
              { value: '@s', detail: 'Yourself' },
              { value: 'mobs', detail: 'Every creature except Build Bots' },
              { value: 'bots', detail: 'Send your Build Bots home' },
              ...this.mobList,
            ],
          },
        ],
      }
    );

    this.register(
      'setblock',
      'Place or remove one block (~ is relative)',
      (args) => {
        const { x, y, z } = this.blockCoords(args);
        const id = normalizeBlockVariantId(args[3].toLowerCase());
        if (this.game.world.getBlockAt(x, y, z) === 'bedrock' && id === 'air')
          throw new Error("Bedrock can't be removed.");
        this.setWorldBlock(x, y, z, id);
        this.game.world.chunkManager?.flushPriorityChunkRebuilds?.(8);
        this.say(`Set ${x}, ${y}, ${z} to ${BLOCKS_BY_ID.get(id)?.name ?? id}`);
      },
      {
        usage: '/setblock <x> <y> <z> <block>',
        args: [...coordArgs(), { name: 'block', type: 'block' }],
      }
    );

    this.register(
      'fill',
      'Fill a box between two corners with a block',
      (args) => {
        const a = this.blockCoords(args, 0);
        const b = this.blockCoords(args, 3);
        const id = normalizeBlockVariantId(args[6].toLowerCase());
        const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        const [z0, z1] = [Math.min(a.z, b.z), Math.max(a.z, b.z)];
        const volume = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
        if (volume > MAX_FILL)
          throw new Error(
            `That is ${volume} blocks; the limit is ${MAX_FILL}.`
          );
        const world = this.game.world;
        let changed = 0;
        for (let x = x0; x <= x1; x++) {
          for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
              const current = world.getBlockAt(x, y, z);
              if (current === 'bedrock') continue;
              if (id === 'air' ? !current : current === id) continue;
              if (this.setWorldBlock(x, y, z, id)) changed++;
            }
          }
        }
        world.chunkManager?.flushPriorityChunkRebuilds?.(32);
        this.say(
          `Filled ${changed} blocks with ${BLOCKS_BY_ID.get(id)?.name ?? id}`
        );
      },
      {
        usage: '/fill <x1> <y1> <z1> <x2> <y2> <z2> <block>',
        args: [
          { name: 'x1', type: 'coord', axis: 'x' },
          { name: 'y1', type: 'coord', axis: 'y', single: true },
          { name: 'z1', type: 'coord', axis: 'z', single: true },
          { name: 'x2', type: 'coord', axis: 'x' },
          { name: 'y2', type: 'coord', axis: 'y', single: true },
          { name: 'z2', type: 'coord', axis: 'z', single: true },
          { name: 'block', type: 'block' },
        ],
      }
    );

    this.register(
      'clear',
      'Clear the chat window',
      () => {
        this.game.chat?.clear?.();
      },
      { usage: '/clear', aliases: ['cls'] }
    );

    this.register(
      'spawn',
      'Teleport back to your spawn point',
      () => {
        const sp = this.game.gameState.spawnPoint;
        if (sp) this.game.physics?.resetPlayer(sp.x, sp.y + 1, sp.z);
        else this.game.physics?.resetPlayer();
        this.say(sp ? 'Back to your bed.' : 'Back to the world spawn.');
      },
      { usage: '/spawn' }
    );

    this.register(
      'seed',
      'Show the world seed',
      () => {
        const world = this.game.world;
        const seed = world.seedString ?? world.config?.seed ?? 'Unknown';
        this.say(`World seed: ${seed}`);
      },
      { usage: '/seed' }
    );

    this.register(
      'effect',
      'Give yourself a status effect, or clear them',
      (args) => {
        const id = args[0].toLowerCase();
        const gs = this.game.gameState;
        if (id === 'clear') {
          gs.activeEffects.length = 0;
          window.dispatchEvent(new CustomEvent('effects-changed'));
          this.say('Cleared all effects.');
          return;
        }
        const seconds = parseInt(args[1], 10) || 30;
        const level = parseInt(args[2], 10) || 1;
        const def = POTION_EFFECTS[id];
        const potions = this.game.survival?.potionSystem;
        if (potions) potions.addEffect(id, seconds, level);
        else gs.activeEffects.push({ id, duration: seconds, level });
        const entry = gs.activeEffects.find((e) => e.id === id);
        if (entry) {
          entry.name = def.name;
          entry.icon = def.icon;
        }
        window.dispatchEvent(new CustomEvent('effects-changed'));
        this.say(`Applied ${def.name} ${level} for ${seconds}s`);
      },
      {
        usage: '/effect <effect|clear> [seconds] [level]',
        args: [
          {
            name: 'effect',
            type: 'enum',
            values: () => [
              ...Object.values(POTION_EFFECTS).map((e) => ({
                value: e.id,
                detail: e.description,
              })),
              { value: 'clear', detail: 'Remove all effects' },
            ],
          },
          {
            name: 'seconds',
            type: 'int',
            optional: true,
            examples: [30, 120, 600],
          },
          {
            name: 'level',
            type: 'int',
            optional: true,
            max: 5,
            examples: [1, 2, 3],
          },
        ],
      }
    );

    this.register(
      'morph',
      'Turn into a creature (or clear to go back)',
      (args) => {
        const raw = args[0].toLowerCase();
        const gs = this.game.gameState;
        if (raw === 'clear' || raw === 'none' || raw === 'reset') {
          gs.morphId = null;
          this.say('Back to normal.');
        } else {
          const id = this.resolveMobId(raw);
          gs.morphId = id;
          this.say(
            `Morphed into ${this.game.entities?.getMobConfig(id)?.name ?? id}`
          );
        }
        window.dispatchEvent(
          new CustomEvent('player-morph-changed', { detail: gs.morphId })
        );
      },
      {
        usage: '/morph <mob|clear>',
        args: [
          {
            name: 'mob',
            type: 'enum',
            values: () => [
              { value: 'clear', detail: 'Back to your skin' },
              ...this.mobList,
            ],
          },
        ],
      }
    );

    this.register(
      'heal',
      'Restore your health and hunger',
      () => {
        const gs = this.game.gameState;
        gs.heal(gs.maxHp ?? 20);
        gs.modifyHunger(20);
        this.say('Healed.');
      },
      { usage: '/heal' }
    );
  }
}
