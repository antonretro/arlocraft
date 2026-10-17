import * as THREE from 'three';
import { MobEntity } from '../MobEntity.js';
import { MOB_MODEL_SPECS } from '../models/mobModelSpecs.js';
import { BLOCKS_BY_ID } from '../../data/blocks.js';
import { BOT_HELP_LINES } from './BuildBotBrain.js';
import {
  ORE_FAMILIES,
  WORK_RADIUS,
  MAX_PLACE_BLOCKS,
  baseId,
  isDiggable,
  isLeaves,
  isOre,
  isProtected,
  isStone,
  isTreeLog,
  planBuild,
  planHole,
  planMining,
  planStaircase,
  planTorches,
  planTrees,
} from './BuildBotTasks.js';

const BOT_TOOL = { id: 'diamond_pickaxe', kind: 'tool' };
const WORK_INTERVAL = 0.38; // seconds per block
const FAST_INTERVAL = 0.12; // leaves and plants
const FOLLOW_DISTANCE = 2.6;
const TELEPORT_DISTANCE = 20;
const GIVE_UP_DISTANCE = 56;
const REACH_H = 3.4;
const REACH_UP = 9;
const REACH_DOWN = 5;

let robotTexture = null;

/** Paints the flat colours named in the build_bot model spec onto a sheet. */
function getRobotTexture() {
  if (robotTexture) return robotTexture;
  const spec = MOB_MODEL_SPECS.build_bot;
  const canvas = document.createElement('canvas');
  canvas.width = spec.texWidth;
  canvas.height = spec.texHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    for (const part of spec.parts) {
      const [, , , w, h, d] = part.box;
      const [u, v] = part.uv;
      const netW = Math.ceil(2 * (w + d));
      const netH = Math.ceil(h + d);
      ctx.fillStyle = part.color ?? '#9aa1ab';
      ctx.fillRect(u, v, netW, netH);
      // Lighter top face, darker bottom edge: reads as bevelled metal.
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(u + Math.floor(d), v, Math.ceil(w), Math.ceil(d));
      if (h >= 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(u, v + netH - 1, netW, 1);
      }
      if (part.name === 'body' || part.name === 'head') {
        // A few rivets on the front.
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        const fx = u + Math.floor(d);
        const fy = v + Math.floor(d);
        ctx.fillRect(fx + 1, fy + 1, 1, 1);
        ctx.fillRect(fx + Math.ceil(w) - 2, fy + 1, 1, 1);
      }
    }
  }
  robotTexture = new THREE.CanvasTexture(canvas);
  robotTexture.magFilter = THREE.NearestFilter;
  robotTexture.minFilter = THREE.NearestFilter;
  robotTexture.colorSpace = THREE.SRGBColorSpace;
  return robotTexture;
}

function prettyName(id) {
  const data = BLOCKS_BY_ID.get(id);
  if (data?.name) return data.name;
  return String(id)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeItems(map, max = 6) {
  const entries = [...map.entries()].filter(([, n]) => n > 0);
  entries.sort((a, b) => b[1] - a[1]);
  const parts = entries
    .slice(0, max)
    .map(([id, n]) => `${n} ${prettyName(id)}`);
  if (entries.length > max) parts.push(`${entries.length - max} more kinds`);
  return parts.join(', ');
}

/**
 * The Build Bot: a friendly robot that follows the player and does chores
 * when asked in chat. Work goes through the same world edit calls as the
 * player's own mining and placing, so it is saved and synced.
 */
export class BuildBot extends MobEntity {
  constructor(game, config, x, y, z, saved = null) {
    super(game, config, x, y, z);
    this.isCompanion = true;
    this.persistent = true;
    this.isAlly = true;
    this.botNumber = saved?.number ?? 1;
    this.displayName =
      this.botNumber > 1 ? `Build Bot ${this.botNumber}` : 'Build Bot';
    this.mode = saved?.mode === 'STAY' ? 'STAY' : 'FOLLOW';
    this.stayPos = this.mesh.position.clone();
    this.stash = new Map(Array.isArray(saved?.stash) ? saved.stash : []);
    this.task = null;
    this.workTimer = 0;
    this.swingTimer = 0;
    this.workTarget = null;
    this.stuckClock = 0;
    this.stuckTime = 0;
    this.stuckDist = Infinity;
    this.deliverPending = false;
    this.status = this.mode === 'STAY' ? 'waiting' : 'following';
    this.tmpTarget = new THREE.Vector3();
    this.tmpVec = new THREE.Vector3();

    this.applyTexture(getRobotTexture());
    this.buildNameplate();
    this.findArmPivots();
  }

  // --- Looks -----------------------------------------------------------

  findArmPivots() {
    const parts = this.model?.parts ?? {};
    this.armPivots = ['armR', 'clawR']
      .map((name) => parts[name]?.parent)
      .filter(Boolean);
  }

  buildNameplate() {
    this.plateCanvas = document.createElement('canvas');
    this.plateCanvas.width = 256;
    this.plateCanvas.height = 72;
    this.plateTexture = new THREE.CanvasTexture(this.plateCanvas);
    this.plateTexture.colorSpace = THREE.SRGBColorSpace;
    this.plateTexture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: this.plateTexture,
      transparent: true,
      depthWrite: false,
    });
    this.nameplate = new THREE.Sprite(material);
    this.nameplate.scale.set(1.5, 0.42, 1);
    this.nameplate.position.set(0, this.height / 2 + 0.38, 0);
    this.nameplate.renderOrder = 10;
    this.mesh.add(this.nameplate);
    this.drawnStatus = null;
    this.drawNameplate();
  }

  drawNameplate() {
    if (this.drawnStatus === this.status) return;
    this.drawnStatus = this.status;
    const ctx = this.plateCanvas.getContext('2d');
    if (!ctx) return;
    const w = this.plateCanvas.width;
    const h = this.plateCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(22, 24, 28, 0.78)';
    const r = 14;
    ctx.beginPath();
    ctx.moveTo(r, 2);
    ctx.lineTo(w - r, 2);
    ctx.quadraticCurveTo(w - 2, 2, w - 2, r);
    ctx.lineTo(w - 2, h - r);
    ctx.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
    ctx.lineTo(r, h - 2);
    ctx.quadraticCurveTo(2, h - 2, 2, h - r);
    ctx.lineTo(2, r);
    ctx.quadraticCurveTo(2, 2, r, 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 28px Outfit, system-ui, sans-serif';
    ctx.fillText(this.displayName, w / 2, 26);
    ctx.fillStyle = '#8fd46a';
    ctx.font = '600 18px Outfit, system-ui, sans-serif';
    ctx.fillText(this.status, w / 2, 54);
    this.plateTexture.needsUpdate = true;
  }

  setStatus(text) {
    this.status = text;
  }

  // --- Interaction -----------------------------------------------------

  say(text) {
    this.game.chat?.addMessage(this.displayName, text, 'bot');
  }

  /** Right-click: a hint instead of the villager-style prompt. */
  showChat() {
    this.say("Beep boop! Say 'hey build bot help' to see what I can do.");
    this.game.audio?.play('action-success', { position: this.mesh.position });
  }

  pet() {
    this.say('Beep! Thanks!');
  }

  feed() {
    this.say('I run on sunshine, but thank you!');
  }

  /** Build Bots cannot be hurt (no accidental punches, no creepers). */
  takeDamage() {}

  die() {
    if (this.dead) return;
    this.cancelTask(false);
    this.dead = true;
    this.game.renderer.scene.remove(this.mesh);
  }

  dispose() {
    this.releaseClaims();
    this.nameplate?.material?.dispose();
    this.plateTexture?.dispose();
    super.dispose();
  }

  serialize() {
    const p = this.mesh.position;
    return {
      type: 'build_bot',
      number: this.botNumber,
      mode: this.mode === 'STAY' ? 'STAY' : 'FOLLOW',
      x: p.x,
      y: p.y - this.halfHeight,
      z: p.z,
      stash: [...this.stash.entries()].filter(([, n]) => n > 0),
    };
  }

  // --- Chat commands ---------------------------------------------------

  /** Runs one parsed intent. `quiet` skips the acknowledgement line. */
  handleIntent(intent) {
    switch (intent.type) {
      case 'greet':
        this.say("Hi! What should I do? Say 'help' to see my skills.");
        return;
      case 'thanks':
        this.say('You are welcome! Beep boop.');
        return;
      case 'help':
        for (const line of BOT_HELP_LINES) this.say(line);
        return;
      case 'inventory':
        if (this.totalStash() === 0) this.say("I'm not carrying anything yet.");
        else this.say(`I have ${describeItems(this.stash)}.`);
        return;
      case 'give':
        if (this.totalStash() === 0) {
          this.say('My pockets are empty. Ask me to chop wood or dig first!');
          return;
        }
        this.cancelTask(false);
        this.mode = 'COME';
        this.deliverPending = true;
        this.setStatus('bringing items');
        this.say('Coming over with everything I have!');
        return;
      case 'stop':
        if (this.task) {
          this.cancelTask(false);
          this.mode = 'FOLLOW';
          this.setStatus('following');
          this.say('Okay, I stopped. I will follow you.');
        } else {
          this.mode = 'STAY';
          this.stayPos.copy(this.mesh.position);
          this.setStatus('waiting');
          this.say('Okay, standing still.');
        }
        return;
      case 'follow':
        this.cancelTask(false);
        this.mode = 'FOLLOW';
        this.setStatus('following');
        this.say('Right behind you!');
        return;
      case 'stay':
        this.cancelTask(false);
        this.mode = 'STAY';
        this.stayPos.copy(this.mesh.position);
        this.setStatus('waiting');
        this.say("I'll wait right here.");
        return;
      case 'come':
        this.cancelTask(false);
        this.mode = 'COME';
        this.setStatus('coming');
        this.say('On my way!');
        return;
      case 'trees':
        this.startTrees();
        return;
      case 'dig':
        this.startDig(intent.shape);
        return;
      case 'stone':
        this.startMining('stone');
        return;
      case 'ore':
        this.startMining(intent.ore);
        return;
      case 'build':
        this.startBuild(intent.shape, intent.material);
        return;
      case 'torches':
        this.startTorches();
        return;
      default:
        this.say("I don't know how to do that yet. Try 'help'.");
    }
  }

  playerFeet() {
    return this.game.getPlayerPosition();
  }

  claims() {
    return this.game.entities?.botClaims ?? new Set();
  }

  releaseClaims() {
    if (!this.task?.claimKeys) return;
    const claims = this.claims();
    for (const k of this.task.claimKeys) claims.delete(k);
    this.task.claimKeys = null;
  }

  startTask(task) {
    this.cancelTask(false);
    task.i = 0;
    task.gained = new Map();
    task.placed = 0;
    task.broken = 0;
    task.startedNear = this.playerFeet().clone();
    if (task.claimKeys) for (const k of task.claimKeys) this.claims().add(k);
    this.task = task;
    this.workTimer = 0;
    this.stuckTime = 0;
    this.setStatus(task.status);
  }

  cancelTask(announce = true) {
    if (!this.task) return;
    this.releaseClaims();
    const task = this.task;
    this.task = null;
    this.workTarget = null;
    if (announce) this.say(`I stopped ${task.label}.`);
  }

  startTrees() {
    const plan = planTrees(this.game.world, this.playerFeet(), this.claims());
    if (!plan) {
      this.say(
        `I can't see any trees within ${WORK_RADIUS} blocks. Lead me to a forest!`
      );
      return;
    }
    this.say('Sure! Heading to the nearest trees.');
    this.startTask({
      kind: 'trees',
      label: 'chopping trees',
      status: 'chopping trees',
      steps: plan.steps,
      claimKeys: plan.keys,
      done: (t) => {
        const logs = [...t.gained.entries()]
          .filter(([id]) => isTreeLog(id))
          .reduce((n, [, c]) => n + c, 0);
        return logs > 0
          ? `Timber! I chopped ${logs} logs. Here you go!`
          : 'Those trees were already gone.';
      },
      deliver: true,
    });
  }

  startDig(shape = 'hole') {
    const world = this.game.world;
    const feet = this.playerFeet();
    const plan =
      shape === 'staircase'
        ? planStaircase(world, feet, this.game.viewYaw)
        : planHole(world, feet, this.game.viewYaw);
    if (!plan) {
      this.say("I can't find solid ground to dig here.");
      return;
    }
    this.say(
      shape === 'staircase'
        ? 'Sure! Digging a staircase down in front of you.'
        : 'Sure! Digging a hole right in front of you.'
    );
    this.startTask({
      kind: 'dig',
      label: shape === 'staircase' ? 'digging stairs' : 'digging',
      status: shape === 'staircase' ? 'digging stairs' : 'digging a hole',
      steps: plan.steps,
      center: plan.center,
      done: (t) =>
        t.broken > 0
          ? `All dug out! I collected ${describeItems(t.gained, 4) || 'nothing useful'}.`
          : 'There was nothing I could dig there.',
      deliver: true,
    });
  }

  startMining(kind) {
    const world = this.game.world;
    let match;
    let label;
    let options;
    if (kind === 'stone') {
      match = (id) => isStone(id);
      label = 'stone';
      options = { limit: 20, maxCover: 4, depth: 10 };
    } else {
      const ids = kind === 'any' ? null : ORE_FAMILIES[kind];
      match = ids ? (id) => ids.includes(baseId(id)) : (id) => isOre(id);
      label =
        kind === 'any'
          ? 'ore'
          : kind === 'diamond'
            ? 'diamonds'
            : `${kind} ore`;
      options = { limit: 16, maxCover: 8, depth: 40 };
    }
    const plan = planMining(world, this.playerFeet(), match, {
      ...options,
      claims: this.claims(),
    });
    if (!plan) {
      this.say(
        `I couldn't find any ${label} close to the surface within ${WORK_RADIUS} blocks. Try a cave or a cliff!`
      );
      return;
    }
    const dist = Math.round(
      Math.hypot(
        plan.target.x - this.playerFeet().x,
        plan.target.z - this.playerFeet().z
      )
    );
    this.say(
      kind === 'stone'
        ? `Sure! There's stone ${dist} blocks away. Mining it now.`
        : `Found ${label} ${dist} blocks away! Going to mine it.`
    );
    this.startTask({
      kind: 'mine',
      label: `mining ${label}`,
      status: `mining ${label}`,
      steps: plan.steps,
      claimKeys: plan.keys,
      done: (t) =>
        t.broken > 0
          ? `Done mining! I got ${describeItems(t.gained, 4)}.`
          : `The ${label} was gone when I got there.`,
      deliver: true,
    });
  }

  startBuild(shape, material) {
    if (!shape) {
      this.say('What should I build? A house, a wall, a tower or a bridge?');
      return;
    }
    const plan = planBuild(
      this.game.world,
      this.playerFeet(),
      this.game.viewYaw,
      shape
    );
    if (!plan || plan.steps.length === 0) {
      this.say("There's no room to build that here.");
      return;
    }
    const steps = plan.steps.slice(0, MAX_PLACE_BLOCKS);
    const preferred =
      material ??
      (shape === 'house' || shape === 'bridge' ? 'planks' : 'cobblestone');
    const creative = this.game.gameState.mode === 'CREATIVE';
    let mat = preferred;
    if (!creative) {
      const have = this.countMaterial(preferred);
      const other = preferred === 'planks' ? 'cobblestone' : 'planks';
      if (have === 0 && !material && this.countMaterial(other) > 0) mat = other;
      if (this.countMaterial(mat) === 0) {
        this.say(
          `I need ${preferred === 'planks' ? 'planks or logs' : 'cobblestone'} to build ${plan.label}. Put some in your inventory, or ask me to 'chop wood' first.`
        );
        return;
      }
      const have2 = this.countMaterial(mat);
      if (have2 < steps.length) {
        this.say(
          `Sure! I'll build ${plan.label}, but I only have enough ${mat} for ${have2} of ${steps.length} blocks.`
        );
      } else {
        this.say(`Sure! Building ${plan.label} out of ${mat}.`);
      }
    } else {
      this.say(`Sure! Building ${plan.label} out of ${mat}.`);
    }
    this.startTask({
      kind: 'build',
      label: `building ${plan.label}`,
      status: `building ${plan.label.replace(/^an? /, '')}`,
      steps,
      material: mat,
      done: (t) =>
        t.outOfMaterial
          ? `I ran out of ${mat} after ${t.placed} blocks. Bring me more and ask again!`
          : `Finished ${plan.label}! (${t.placed} blocks)`,
    });
  }

  startTorches() {
    const spots = planTorches(this.game.world, this.playerFeet(), 8);
    if (spots.length === 0) {
      this.say("I can't find good spots for torches around here.");
      return;
    }
    const creative = this.game.gameState.mode === 'CREATIVE';
    if (!creative && this.countTorchSupply() === 0) {
      this.say('I need torches, or coal and sticks (or planks) to make some.');
      return;
    }
    this.say('Sure! Lighting up the area.');
    this.startTask({
      kind: 'torches',
      label: 'placing torches',
      status: 'placing torches',
      steps: spots,
      material: 'torch',
      done: (t) =>
        t.outOfMaterial
          ? `I placed ${t.placed} torches and ran out.`
          : `Lit it up with ${t.placed} torches!`,
    });
  }

  // --- Materials -------------------------------------------------------

  totalStash() {
    let n = 0;
    for (const c of this.stash.values()) n += c;
    return n;
  }

  addToStash(id, count) {
    this.stash.set(id, (this.stash.get(id) ?? 0) + count);
  }

  takeFromStash(id, count = 1) {
    const have = this.stash.get(id) ?? 0;
    if (have < count) return false;
    if (have === count) this.stash.delete(id);
    else this.stash.set(id, have - count);
    return true;
  }

  playerCount(test) {
    let n = 0;
    for (const slot of this.game.gameState.inventory) {
      if (slot && test(slot.id)) n += slot.count ?? 0;
    }
    return n;
  }

  /** Removes one matching item from the player; returns its id or null. */
  takeFromPlayer(test) {
    const inv = this.game.gameState.inventory;
    for (let i = inv.length - 1; i >= 0; i--) {
      const slot = inv[i];
      if (!slot || !test(slot.id) || !(slot.count > 0)) continue;
      const id = slot.id;
      slot.count -= 1;
      if (slot.count <= 0) inv[i] = null;
      window.dispatchEvent(new CustomEvent('inventory-changed'));
      return id;
    }
    return null;
  }

  takeAny(test) {
    for (const [id, n] of this.stash) {
      if (n > 0 && test(id)) {
        this.takeFromStash(id, 1);
        return id;
      }
    }
    return this.takeFromPlayer(test);
  }

  stashCount(test) {
    let n = 0;
    for (const [id, c] of this.stash) if (test(id)) n += c;
    return n;
  }

  countMaterial(material) {
    if (material === 'planks') {
      const planks = (id) => baseId(id).endsWith('_planks');
      const logs = (id) => isTreeLog(id);
      return (
        this.stashCount(planks) +
        this.playerCount(planks) +
        4 * (this.stashCount(logs) + this.playerCount(logs))
      );
    }
    const cobble = (id) => baseId(id) === 'cobblestone';
    return this.stashCount(cobble) + this.playerCount(cobble);
  }

  /** One block of building material, crafting planks from logs if needed. */
  takeBuildBlock(material) {
    if (this.game.gameState.mode === 'CREATIVE')
      return material === 'planks' ? 'oak_planks' : material;
    if (material === 'cobblestone')
      return this.takeAny((id) => baseId(id) === 'cobblestone');
    const plank = this.takeAny((id) => baseId(id).endsWith('_planks'));
    if (plank) return plank;
    const log = this.takeAny((id) => isTreeLog(id));
    if (!log) return null;
    const planks = baseId(log).replace(/_log$/, '_planks');
    const plankId = BLOCKS_BY_ID.has(planks) ? planks : 'oak_planks';
    this.addToStash(plankId, 3);
    return plankId;
  }

  countTorchSupply() {
    const torches =
      this.stashCount((id) => id === 'torch') +
      this.playerCount((id) => id === 'torch');
    if (torches > 0) return torches;
    const coal = (id) => id === 'coal' || id === 'charcoal';
    const fuel = this.stashCount(coal) + this.playerCount(coal);
    const wood = (id) =>
      id === 'stick' || baseId(id).endsWith('_planks') || isTreeLog(id);
    const sticks = this.stashCount(wood) + this.playerCount(wood);
    return Math.min(fuel, sticks) * 4;
  }

  takeTorch() {
    const torch = this.takeAny((id) => id === 'torch');
    if (torch) return torch;
    // Craft four torches from one coal and one stick.
    const coal = (id) => id === 'coal' || id === 'charcoal';
    if (this.stashCount(coal) + this.playerCount(coal) === 0) return null;
    let stick = this.takeAny((id) => id === 'stick');
    if (!stick) {
      const plank = this.takeAny((id) => baseId(id).endsWith('_planks'));
      if (plank) {
        this.addToStash('stick', 1); // 2 planks would make 4; keep it simple
        stick = 'stick';
      }
    }
    if (!stick) {
      const log = this.takeAny((id) => isTreeLog(id));
      if (log) {
        this.addToStash('oak_planks', 3);
        stick = 'stick';
      }
    }
    if (!stick) return null;
    this.takeAny(coal);
    this.addToStash('torch', 3);
    return 'torch';
  }

  /** Hands everything collected to the player. */
  deliverToPlayer() {
    const gs = this.game.gameState;
    const given = new Map();
    for (const [id, count] of [...this.stash.entries()]) {
      const stack = gs.createItemStack(id, count);
      gs.addItemStack(stack);
      const moved = count - stack.count;
      if (moved > 0) given.set(id, moved);
      if (stack.count > 0) this.stash.set(id, stack.count);
      else this.stash.delete(id);
    }
    this.deliverPending = false;
    if (given.size === 0) {
      if (this.totalStash() > 0)
        this.say("Your inventory is full, I'll hold on to the rest.");
      return;
    }
    this.game.audio?.play('action-success', { position: this.mesh.position });
    this.say(
      `Here you go: ${describeItems(given)}.` +
        (this.totalStash() > 0
          ? " Your inventory is full, I'll keep the rest."
          : '')
    );
  }

  // --- World edits -----------------------------------------------------

  canBreakNow(step, id) {
    const world = this.game.world;
    if (!id) return false;
    if (isProtected(world, id, step.x, step.y, step.z)) return false;
    switch (step.want) {
      case 'log':
        return isTreeLog(id);
      case 'leaf':
        return isLeaves(id);
      case 'target':
        return isDiggable(world, id);
      case 'dig':
      default:
        return isDiggable(world, id);
    }
  }

  breakBlock(x, y, z, id) {
    const world = this.game.world;
    const key = world.getKey(x, y, z);
    const drops = world.blocks.getBlockDrops(id, BOT_TOOL);
    const pair = world.getBlockPairState?.(id, x, y, z);
    if (pair) {
      const pairKey = world.getKey(x, pair.pairY, z);
      world.state.changedBlocks.set(pairKey, null);
      world.removeBlockByKey(pairKey, { skipChangeTracking: true });
    }
    world.state.changedBlocks.set(key, null);
    world.removeBlockByKey(key, { skipChangeTracking: true });
    world.chunkManager?.flushPriorityChunkRebuilds?.(8);
    for (const drop of drops) {
      const n = drop.count ?? 1;
      this.addToStash(drop.id, n);
      this.task?.gained.set(drop.id, (this.task.gained.get(drop.id) ?? 0) + n);
    }
    if (this.isNearPlayer(18))
      this.game.audio?.play('block-mined', { id: baseId(id) });
  }

  placeBlock(x, y, z, id) {
    const world = this.game.world;
    const key = world.getKey(x, y, z);
    const existing = world.state.blockMap.get(key);
    const ownerKey = world.getChunkKey(
      world.getChunkCoord(x),
      world.getChunkCoord(y),
      world.getChunkCoord(z)
    );
    world.state.changedBlocks.set(key, id);
    world.addBlock(x, y, z, id, ownerKey, Boolean(existing));
    world.chunkManager?.flushPriorityChunkRebuilds?.(8);
    if (this.isNearPlayer(18)) this.game.audio?.play('block-placed', { id });
    // If the bot built itself in, pop up on top.
    if (
      !this.canOccupyAt(
        this.mesh.position.x,
        this.mesh.position.y,
        this.mesh.position.z
      )
    )
      this.liftOutOfBlocks();
  }

  overlapsPlayer(x, y, z) {
    const p = this.playerFeet();
    const hw = 0.35;
    return (
      x + 1 > p.x - hw &&
      x < p.x + hw &&
      z + 1 > p.z - hw &&
      z < p.z + hw &&
      y + 1 > p.y &&
      y < p.y + 1.85
    );
  }

  isNearPlayer(dist) {
    const p = this.playerFeet();
    return this.mesh.position.distanceToSquared(p) < dist * dist;
  }

  // --- Movement helpers ------------------------------------------------

  feetY() {
    return this.mesh.position.y - this.halfHeight;
  }

  /** A spot with solid ground and two free blocks above, near (x, y, z). */
  findStandSpot(x, y, z, radius = 3) {
    const world = this.game.world;
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    for (let r = 0; r <= radius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          for (const dy of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]) {
            const cx = bx + dx;
            const cy = by + dy;
            const cz = bz + dz;
            if (
              world.isSolidAt(cx, cy - 1, cz) &&
              !world.isSolidAt(cx, cy, cz) &&
              !world.isSolidAt(cx, cy + 1, cz)
            ) {
              return { x: cx + 0.5, y: cy, z: cz + 0.5 };
            }
          }
        }
      }
    }
    return null;
  }

  teleportTo(spot) {
    if (!spot) return false;
    this.game.particles?.spawnBurst?.(
      this.mesh.position.clone(),
      'CRIT',
      8,
      0.25
    );
    this.mesh.position.set(spot.x, spot.y + this.halfHeight + 0.01, spot.z);
    this.velocity.set(0, 0, 0);
    this.moveVelocity.set(0, 0, 0);
    this.stuckTime = 0;
    this.stuckDist = Infinity;
    this.game.particles?.spawnBurst?.(
      this.mesh.position.clone(),
      'CRIT',
      8,
      0.25
    );
    return true;
  }

  /** The spot a few blocks behind the player that this bot keeps to. */
  followSpot() {
    const p = this.playerFeet();
    const yaw = this.game.viewYaw ?? 0;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const side = (this.botNumber - 2) * 1.3; // spread several bots out
    return this.tmpTarget.set(
      p.x - fx * FOLLOW_DISTANCE + -fz * side,
      p.y,
      p.z - fz * FOLLOW_DISTANCE + fx * side
    );
  }

  teleportNearPlayer() {
    const spot = this.followSpot();
    const p = this.playerFeet();
    return (
      this.teleportTo(this.findStandSpot(spot.x, p.y, spot.z, 3)) ||
      this.teleportTo(this.findStandSpot(p.x, p.y, p.z, 3))
    );
  }

  /** Teleports when the bot has been trying to move but going nowhere. */
  trackStuck(delta, target, onStuck) {
    this.stuckClock += delta;
    if (this.stuckClock < 1) return;
    this.stuckClock = 0;
    // Progress is measured towards the target on the ground plane, so
    // hopping in place against a tree trunk still counts as stuck.
    const dx = target.x - this.mesh.position.x;
    const dz = target.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const progress = (this.stuckDist ?? Infinity) - dist;
    this.stuckDist = dist;
    if (progress > 0.5 || dist < 1) {
      this.stuckTime = 0;
      return;
    }
    this.stuckTime += 1;
    if (this.stuckTime >= 3) {
      this.stuckTime = 0;
      this.stuckDist = Infinity;
      onStuck();
    }
  }

  // --- Update ----------------------------------------------------------

  update(delta) {
    if (this.dead) return;
    const p = this.playerFeet();
    const pos = this.mesh.position;
    const dxp = p.x - pos.x;
    const dzp = p.z - pos.z;
    const playerDist = Math.sqrt(dxp * dxp + dzp * dzp);
    const playerDy = p.y - this.feetY();

    let target = null;
    let speed = 0;
    let onStuck = null;
    this.workTarget = null;

    if (this.task) {
      if (playerDist > GIVE_UP_DISTANCE) {
        this.cancelTask(false);
        this.mode = 'FOLLOW';
        this.say('You went too far away, so I stopped working.');
      } else {
        const res = this.updateTask(delta);
        if (res) ({ target, speed, onStuck } = res);
      }
    }

    if (!this.task && !target) {
      if (this.mode === 'STAY') {
        const d = pos.distanceTo(this.stayPos);
        if (d > 1.5) {
          target = this.stayPos;
          speed = 3.5;
          onStuck = () =>
            this.teleportTo(
              this.findStandSpot(
                this.stayPos.x,
                this.stayPos.y - this.halfHeight,
                this.stayPos.z,
                2
              )
            );
        }
      } else {
        if (playerDist > TELEPORT_DISTANCE || Math.abs(playerDy) > 10) {
          this.teleportNearPlayer();
        } else if (this.mode === 'COME') {
          if (playerDist > 1.8) {
            target = p;
            speed = playerDist > 6 ? 6.5 : 4.5;
            onStuck = () => this.teleportNearPlayer();
          } else {
            this.mode = 'FOLLOW';
            this.setStatus('following');
          }
        } else {
          const spot = this.followSpot();
          const sx = spot.x - pos.x;
          const sz = spot.z - pos.z;
          const spotDist = Math.sqrt(sx * sx + sz * sz);
          if (spotDist > 1.1 && playerDist > 1.8) {
            target = spot;
            speed = playerDist > 7 ? 6.5 : 4.2;
            onStuck = () => this.teleportNearPlayer();
          }
        }
        if (this.deliverPending && playerDist < 3.2 && Math.abs(playerDy) < 3) {
          this.deliverToPlayer();
          if (this.mode === 'COME') this.mode = 'FOLLOW';
          this.setStatus('following');
        }
      }
    }

    if (target) {
      this.executeMovement(delta, target, speed);
      if (onStuck) this.trackStuck(delta, target, onStuck);
    } else {
      this.moveVelocity.multiplyScalar(Math.max(0, 1 - delta * 8));
      this.stuckTime = 0;
    }

    // Face what it is doing: the block it works on, where it walks, or you.
    if (this.workTarget) {
      this.faceAngle(
        Math.atan2(this.workTarget.x - pos.x, this.workTarget.z - pos.z),
        delta
      );
    } else if (this.moveVelocity.lengthSq() > 0.05) {
      this.faceAngle(
        Math.atan2(this.moveVelocity.x, this.moveVelocity.z),
        delta
      );
    } else if (playerDist < 8) {
      this.faceAngle(Math.atan2(dxp, dzp), delta * 0.5);
    }

    this.model.update(delta, this.moveVelocity, false);
    this.updateArmSwing(delta);
    this.updateSurfaceY(delta, true);

    // Fell out of the world or got buried: hop back to the player.
    const world = this.game.world;
    if (this.feetY() < (world.minTerrainY ?? -64) - 8)
      this.teleportNearPlayer();
    this.drawNameplate();
  }

  updateArmSwing(delta) {
    if (this.swingTimer <= 0 || !this.armPivots?.length) return;
    this.swingTimer = Math.max(0, this.swingTimer - delta);
    const t = 1 - this.swingTimer / 0.3;
    const lift = Math.sin(t * Math.PI) * 1.7;
    for (const pivot of this.armPivots) pivot.rotation.x -= lift;
  }

  /** Works the current step; returns a movement request or null. */
  updateTask(delta) {
    const task = this.task;
    const world = this.game.world;
    // Skip steps that are no longer valid without spending time on them.
    for (let guard = 0; guard < 64; guard++) {
      const step = task.steps[task.i];
      if (!step) {
        this.finishTask();
        return null;
      }
      if (step.op === 'break') {
        const id = world.getBlockAt(step.x, step.y, step.z);
        if (!this.canBreakNow(step, id)) {
          task.i++;
          continue;
        }
      } else {
        const id = world.getBlockAt(step.x, step.y, step.z);
        if (id && !world.isReplaceableForPlacement(id)) {
          task.i++;
          continue;
        }
        if (this.overlapsPlayer(step.x, step.y, step.z)) {
          // Try again at the end, once the player has moved.
          if (!step.retried) {
            step.retried = true;
            task.steps.push(step);
          }
          task.i++;
          continue;
        }
      }
      break;
    }
    const step = task.steps[task.i];
    if (!step) return null;

    const cx = step.x + 0.5;
    const cy = step.y + 0.5;
    const cz = step.z + 0.5;
    const pos = this.mesh.position;
    const h = Math.hypot(cx - pos.x, cz - pos.z);
    const dy = cy - this.feetY();
    const reachable = h <= REACH_H && dy <= REACH_UP && dy >= -REACH_DOWN;

    if (!reachable) {
      this.workTimer = 0;
      const target = this.tmpVec.set(cx, pos.y, cz);
      return {
        target,
        speed: h > 8 ? 6 : 4.2,
        onStuck: () =>
          this.teleportTo(
            this.findStandSpot(
              cx,
              step.op === 'place' ? step.y : step.y + 1,
              cz,
              3
            )
          ),
      };
    }

    this.workTarget = this.tmpVec.set(cx, cy, cz);
    this.workTimer += delta;
    const interval = step.fast ? FAST_INTERVAL : WORK_INTERVAL;
    if (this.workTimer < interval) return null;
    this.workTimer = 0;
    this.swingTimer = 0.3;

    if (step.op === 'break') {
      const id = world.getBlockAt(step.x, step.y, step.z);
      this.breakBlock(step.x, step.y, step.z, id);
      task.broken++;
    } else {
      const creative = this.game.gameState.mode === 'CREATIVE';
      let blockId;
      if (step.block === 'torch')
        blockId = creative ? 'torch' : this.takeTorch();
      else blockId = this.takeBuildBlock(task.material);
      if (!blockId) {
        task.outOfMaterial = true;
        this.finishTask();
        return null;
      }
      this.placeBlock(step.x, step.y, step.z, blockId);
      task.placed++;
    }
    task.i++;
    return null;
  }

  finishTask() {
    const task = this.task;
    if (!task) return;
    this.releaseClaims();
    this.task = null;
    this.workTarget = null;
    this.say(task.done(task));
    if (task.deliver && this.totalStash() > 0) {
      this.deliverPending = true;
      this.mode = 'COME';
      this.setStatus('bringing items');
    } else {
      if (this.mode !== 'STAY') this.mode = 'FOLLOW';
      this.setStatus(this.mode === 'STAY' ? 'waiting' : 'following');
    }
  }
}
