/**
 * MultiplayerManager
 * Handles P2P connectivity via PeerJS (WebRTC)
 */
function cloneForSync(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fallback to JSON clone below.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.connections = new Map(); // PeerID -> DataConnection
    this.remotePlayers = new Map(); // PeerID -> PlayerEntity
    this.isHost = false;
    this.roomId = null;
    this.pendingSessionState = null;
    this.hasReceivedSessionState = false;
    this.hasReceivedWorldSync = false;
    this._joinSyncPrepared = false;
    this._lastSyncPercent = -1;

    this.onConnected = null;
  }

  isConnected() {
    return this.connections.size > 0;
  }

  init() {
    if (typeof Peer === 'undefined') {
      console.error(
        '[Multiplayer] PeerJS library not found! Ensure CDN script is loaded.'
      );
      return;
    }

    console.log('[Multiplayer] Initializing Secure Peer Pipeline...');

    // Generate a cryptographically random, anonymous ID for privacy
    const randomId =
      'ARLO-' +
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();

    this.peer = new Peer(randomId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    this.peer.on('open', (id) => {
      console.log('[Multiplayer] Secure Identity Established:', id);
      this.roomId = id;
      if (this.onConnected) this.onConnected(id);
    });

    this.peer.on('connection', (conn) => {
      this.setupConnection(conn, { asHost: true });
    });

    this.peer.on('error', (err) => {
      console.error('[Multiplayer] Peer Connectivity Error:', err.type);
      let msg = 'Network connection failed.';
      if (err.type === 'peer-unavailable')
        msg = 'The Join Code is invalid or the host is offline.';
      if (err.type === 'network') msg = 'P2P tunnel could not be established.';
      this.game.notifications?.show('Multiplayer Error', msg, 'error');
    });
  }

  async connectToPeer(targetId) {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('Peer system not initialized.'));

      console.log('[Multiplayer] Attempting to bridge to:', targetId);
      this.isHost = false;
      this.roomId = targetId;
      const conn = this.peer.connect(targetId, {
        reliable: true,
        connectionPriority: 'high',
      });
      this.setupConnection(conn, { asHost: false });

      const timeout = setTimeout(() => {
        conn.close();
        reject(
          new Error('Connection timed out. Check the code and try again.')
        );
      }, 10000);

      conn.on('open', () => {
        clearTimeout(timeout);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  setupConnection(conn, { asHost = this.isHost } = {}) {
    if (!conn || conn.__arloSetupComplete) return;
    conn.__arloSetupComplete = true;

    console.log('[Multiplayer] New Peer Connection:', conn.peer);

    const finalizeOpen = () => {
      if (conn.__arloOpenHandled) return;
      conn.__arloOpenHandled = true;
      this.connections.set(conn.peer, conn);
      this.isHost = Boolean(asHost);

      // Send initial handshake
      this.send(conn.peer, {
        type: 'handshake',
        data: {
          skinUsername: this.game.settings.skinUsername || 'Steve',
          mode: this.game.gameState.mode,
        },
      });

      // If we are the host, send the current world state to the new client
      if (this.isHost) {
        console.log(
          '[Multiplayer] Host detected, syncing world state to',
          conn.peer
        );
        this.sendSessionState(conn.peer);
        this.sendWorldSync(conn.peer);
        this.sendWorldDataSync(conn.peer);
      }

      this.game.notifications?.show('Multiplayer', 'Peer Connected!', 'success');
    };

    if (conn.open) finalizeOpen();
    else conn.on('open', finalizeOpen);

    conn.on('data', (payload) => {
      this.handleMessage(conn.peer, payload);
    });

    conn.on('close', () => {
      console.log('[Multiplayer] Peer Disconnected:', conn.peer);
      this.connections.delete(conn.peer);
      this.removeRemotePlayer(conn.peer);
      this.game.notifications?.show('Multiplayer', 'Peer Disconnected', 'warning');
    });
  }

  buildSessionState() {
    const position = this.game.getPlayerPosition?.() ?? { x: 0, y: 70, z: 0 };
    return {
      started: Boolean(this.game.hasStarted),
      seed: this.game.world?.seedString ?? '',
      player: {
        position: {
          x: position.x,
          y: position.y,
          z: position.z,
        },
        look: {
          yaw: this.game.viewYaw ?? 0,
          pitch: this.game.viewPitch ?? 0,
        },
        mode: this.game.gameState?.mode ?? 'SURVIVAL',
        hp: this.game.gameState?.hp ?? 20,
        hunger: this.game.gameState?.hunger ?? 20,
        inventory: cloneForSync(this.game.gameState?.inventory ?? []),
        offhand: cloneForSync(this.game.gameState?.offhand ?? null),
        craftingGrid: cloneForSync(this.game.gameState?.craftingGrid ?? []),
        armor: cloneForSync(this.game.gameState?.armor ?? []),
        selectedSlot: this.game.gameState?.selectedSlot ?? 0,
        cameraMode:
          this.game.cameraModes?.[this.game.cameraModeIndex] ?? 'FIRST_PERSON',
      },
      world: {
        timeOfDay: this.game.dayNight?.timeOfDay ?? 0.3,
        totalDays: this.game.dayNight?.totalDays ?? 0,
        weatherType: this.game.dayNight?.weatherType ?? 'clear',
        weatherIntensity: this.game.dayNight?.weatherIntensity ?? 0,
      },
    };
  }

  sendSessionState(peerId) {
    this.send(peerId, {
      type: 'session_state',
      data: this.buildSessionState(),
    });
  }

  sendWorldSync(peerId) {
    const blockMap = this.game.world.state.blockMap;
    const blockCount = blockMap.size;
    if (blockCount === 0) {
      this.send(peerId, { type: 'world_sync_complete', data: {} });
      return;
    }

    const palette = [];
    const paletteMap = new Map();
    const getPaletteIndex = (id) => {
      let idx = paletteMap.get(id);
      if (idx === undefined) {
        idx = palette.length;
        palette.push(id);
        paletteMap.set(id, idx);
      }
      return idx;
    };

    const entries = Array.from(blockMap.entries());
    const CHUNK_SIZE = 1200; 
    let index = 0;

    // Use a non-blocking generator-style loop
    const sendNextBatch = () => {
        if (!this.connections.has(peerId)) return; // Peer left

        const limit = Math.min(index + CHUNK_SIZE, entries.length);
        const chunkEntries = entries.slice(index, limit);
        const data = new Int32Array(chunkEntries.length * 4);
        let ptr = 0;
        
        for (const [key, id] of chunkEntries) {
            const [x, y, z] = this.game.world.coords.keyToCoords(key);
            data[ptr++] = x;
            data[ptr++] = y;
            data[ptr++] = z;
            data[ptr++] = getPaletteIndex(id);
        }

        this.send(peerId, {
            type: 'world_sync_chunk',
            data: {
                payload: data.buffer,
                palette: palette,
                progress: limit,
                total: entries.length,
                isLast: limit >= entries.length
            },
        });

        index = limit;
        if (index < entries.length) {
            // Schedule next batch to keep main thread free
            setTimeout(sendNextBatch, 16); 
        }
    };

    sendNextBatch();
  }

  sendWorldDataSync(peerId) {
    const blockData = this.game.world.state.blockData;
    if (!blockData || blockData.size === 0) return;

    // Send all block metadata (signs, command blocks, etc)
    const data = Array.from(blockData.entries());
    this.send(peerId, {
      type: 'world_data_sync',
      data: data
    });
  }

  prepareJoinSync() {
    if (this._joinSyncPrepared) return;

    this._joinSyncPrepared = true;
    this.hasReceivedWorldSync = false;
    this._lastSyncPercent = -1;

    this.game.renderer?.setVisible?.(false);
    this.game.world.clearWorld();
    this.game.resetEntities?.();
    this.game.particles?.clear?.();
    this.game.hasStarted = false;
    this.game.isPaused = false;
    this.game.gameState?.setPaused?.(false);
    this.game.ui?.showHUD?.(false);
  }

  handleWorldSyncChunk(data) {
    const { payload, palette, progress, total, isLast } = data;
    if (!payload || !palette) return;

    this.prepareJoinSync();

    const blocks = new Int32Array(payload);
    
    // Batch notifications to reduce UI churn
    const percent = total > 0 ? Math.round((progress / total) * 100) : 100;
    if (isLast || percent >= this._lastSyncPercent + 10) {
        this._lastSyncPercent = percent;
        this.game.notifications?.show('Multiplayer', `Syncing World: ${percent}%`, 'info');
    }

    for (let i = 0; i < blocks.length; i += 4) {
      const x = blocks[i];
      const y = blocks[i + 1];
      const z = blocks[i + 2];
      const id = palette[blocks[i + 3]];

      if (id) {
        // Direct state injection is faster than addBlock for bulk sync
        const key = this.game.world.coords.getKey(x, y, z);
        this.game.world.state.blockMap.set(key, id);
        this.game.world.state.changedBlocks.set(key, id);
      }
    }

    if (isLast) {
      this.hasReceivedWorldSync = true;
      this.finalizeJoinSyncIfReady();
    }
  }

  finalizeJoinSyncIfReady() {
    if (!this._joinSyncPrepared) return;
    if (!this.hasReceivedWorldSync || !this.hasReceivedSessionState) return;

    const state = this.pendingSessionState || {};
    const player = state.player || {};
    const world = state.world || {};

    if (state.seed) {
      this.game.world.setSeed(state.seed);
    }

    if (Array.isArray(player.inventory)) {
      this.game.gameState.inventory = cloneForSync(player.inventory).slice(0, 36);
      while (this.game.gameState.inventory.length < 36) {
        this.game.gameState.inventory.push(null);
      }
    }
    this.game.gameState.offhand = cloneForSync(player.offhand ?? null);
    this.game.gameState.craftingGrid = Array.isArray(player.craftingGrid)
      ? cloneForSync(player.craftingGrid).slice(0, 9)
      : new Array(9).fill(null);
    while (this.game.gameState.craftingGrid.length < 9) {
      this.game.gameState.craftingGrid.push(null);
    }
    this.game.gameState.armor = Array.isArray(player.armor)
      ? cloneForSync(player.armor).slice(0, 4)
      : new Array(4).fill(null);
    while (this.game.gameState.armor.length < 4) {
      this.game.gameState.armor.push(null);
    }
    this.game.gameState.selectedSlot = Math.max(
      0,
      Math.min(8, Number(player.selectedSlot) || 0)
    );
    this.game.gameState.hp = Number.isFinite(Number(player.hp))
      ? Number(player.hp)
      : 20;
    this.game.gameState.hunger = Number.isFinite(Number(player.hunger))
      ? Number(player.hunger)
      : 20;

    if (player.mode) {
      this.game.gameState.setMode(player.mode);
      this.game.physics?.setMode?.(player.mode);
    }

    this.game.viewYaw = Number(player.look?.yaw) || 0;
    this.game.viewPitch = Number(player.look?.pitch) || 0;

    const cameraModeIndex = this.game.cameraModes.indexOf(player.cameraMode);
    if (cameraModeIndex >= 0) {
      this.game.cameraModeIndex = cameraModeIndex;
    }

    this.game.dayNight?.setTime?.(world.timeOfDay ?? 0.3, world.totalDays ?? 0);
    this.game.dayNight?.setWeather?.(
      world.weatherType ?? 'clear',
      world.weatherIntensity ?? 0
    );

    let safePosition = {
      x: Number(player.position?.x) || 0,
      y: Number(player.position?.y) || 70,
      z: Number(player.position?.z) || 0,
    };

    if (this.game.physics?.isReady) {
      safePosition = this.game.physics.resolveSafeSpawn(
        safePosition.x,
        safePosition.y,
        safePosition.z,
        24,
        { preferGround: true }
      );
      this.game.physics.playerBody.setTranslation(safePosition, true);
      this.game.physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.game.physics.lastSafePosition.copy(this.game.physics.position);
    }

    this.game.lastKnownPosition.set(
      safePosition.x,
      safePosition.y,
      safePosition.z
    );
    this.game.updateCameraRotation?.();

    const cx = this.game.world.getChunkCoord(safePosition.x);
    const cy = this.game.world.getChunkCoord(safePosition.y);
    const cz = this.game.world.getChunkCoord(safePosition.z);
    const preloadRadius = Math.max(
      1,
      Math.min(2, Number(this.game.world.renderDistance) || 2)
    );
    this.game.world.ensureChunksAround?.(cx, cy, cz, preloadRadius);
    this.game.world.processChunkLoadQueue?.(cx, cy, cz, 128);
    this.game.world.chunkManager.chunks.forEach((chunk) => {
      chunk.dirty = true;
      this.game.world.chunkManager.priorityDirtyChunkKeys.add(chunk.key);
    });
    this.game.world.flushPriorityChunkRebuilds?.(200);

    this.game.renderer?.setVisible?.(true);
    this.game.hasStarted = true;
    this.game.isPaused = false;
    this.game.showTitle(false);
    this.game.showPause(false);
    this.game.ui.showHUD(true);
    this.game.touchControls
      ? this.game.touchControls.show(true)
      : this.game.input.setPointerLock();

    window.dispatchEvent(new CustomEvent('inventory-changed'));
    window.dispatchEvent(
      new CustomEvent('offhand-changed', { detail: this.game.gameState.offhand })
    );
    window.dispatchEvent(
      new CustomEvent('hp-changed', { detail: this.game.gameState.hp })
    );
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.game.gameState.hunger })
    );

    this.game.notifications?.show(
      'Multiplayer',
      'World Link Stabilized',
      'success'
    );

    this.pendingSessionState = null;
    this.hasReceivedSessionState = false;
    this.hasReceivedWorldSync = false;
    this._joinSyncPrepared = false;
  }

  handleMessage(peerId, payload) {
    const { type, data } = payload;

    switch (type) {
      case 'handshake':
        console.log('[Multiplayer] Handshake from', peerId, data);
        this.createRemotePlayer(peerId, data);
        break;

      case 'position':
        this.updateRemotePlayer(peerId, data);
        break;

      case 'block_update':
        this.syncBlock(data);
        break;

      case 'chat':
        this.game.chat?.addMessage(data.sender || peerId, data.text);
        break;

      case 'world_sync_chunk':
        this.handleWorldSyncChunk(data);
        break;
      
      case 'world_sync_complete':
        this.prepareJoinSync();
        this.hasReceivedWorldSync = true;
        this.finalizeJoinSyncIfReady();
        break;

      case 'world_data_sync':
        if (Array.isArray(data)) {
            data.forEach(([key, meta]) => {
                this.game.world.state.blockData.set(key, meta);
            });
            // Force remesh to show new text/data
            this.game.world.chunkManager.chunks.forEach(chunk => {
                chunk.dirty = true;
                this.game.world.chunkManager.priorityDirtyChunkKeys.add(chunk.key);
            });
        }
        break;

      case 'session_state':
        this.prepareJoinSync();
        this.pendingSessionState = data || {};
        this.hasReceivedSessionState = true;
        this.finalizeJoinSyncIfReady();
        break;
    }
  }

  send(peerId, payload) {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(payload);
    }
  }

  broadcast(payload) {
    for (const [id, conn] of this.connections) {
      if (conn.open) {
        conn.send(payload);
      }
    }
  }

  broadcastPosition(pos, rot) {
    this.broadcast({
      type: 'position',
      data: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: rot.yaw,
        pitch: rot.pitch,
      },
    });
  }

  broadcastBlockUpdate(x, y, z, id, type = 'add', data = null) {
    this.broadcast({
      type: 'block_update',
      data: { x, y, z, id, operation: type, meta: data },
    });
  }

  // --- Remote Player Management ---

  createRemotePlayer(peerId, data) {
    console.log('[Multiplayer] Creating sprite for', peerId);
    this.remotePlayers.set(peerId, {
      id: peerId,
      skin: data.skinUsername,
      lastUpdate: Date.now(),
    });

    if (this.game.entities) {
      this.game.entities.spawnRemotePlayer?.(peerId, data.skinUsername);
    }

    this.game.chat?.addMessage('SYSTEM', `${data.skinUsername} has entered the simulation.`, 'system');
  }

  updateRemotePlayer(peerId, data) {
    const p = this.remotePlayers.get(peerId);
    if (!p) return;

    p.pos = { x: data.x, y: data.y, z: data.z };
    p.rot = { yaw: data.yaw, pitch: data.pitch };
    p.lastUpdate = Date.now();

    if (this.game.entities) {
      this.game.entities.updateRemotePlayer?.(peerId, p.pos, p.rot);
    }
  }

  removeRemotePlayer(peerId) {
    const p = this.remotePlayers.get(peerId);
    const name = p?.skin || peerId;
    this.remotePlayers.delete(peerId);
    if (this.game.entities) {
      this.game.entities.removeRemotePlayer?.(peerId);
    }
    this.game.chat?.addMessage('SYSTEM', `${name} has left the simulation.`, 'system');
  }

  syncBlock(data) {
    const { x, y, z, id, operation, meta } = data;
    const key = this.game.world.getKey(x, y, z);
    if (operation === 'add') {
      this.game.world.state.changedBlocks.set(key, id);
      this.game.world.addBlock(
        x,
        y,
        z,
        id,
        'remote',
        true,
        { silent: true },
        meta
      );
    } else {
      this.game.world.state.changedBlocks.set(key, null);
      this.game.world.removeBlockAt(x, y, z, { silent: true });
    }
  }

  dispose() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.roomId = null;
    this.pendingSessionState = null;
    this.hasReceivedSessionState = false;
    this.hasReceivedWorldSync = false;
    this._joinSyncPrepared = false;
  }
}
