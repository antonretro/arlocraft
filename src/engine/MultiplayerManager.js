/**
 * MultiplayerManager
 * Handles P2P connectivity via PeerJS (WebRTC)
 */
export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.connections = new Map(); // PeerID -> DataConnection
    this.remotePlayers = new Map(); // PeerID -> PlayerEntity
    this.isHost = false;
    this.roomId = null;

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
      this.setupConnection(conn);
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
      const conn = this.peer.connect(targetId, {
        reliable: true,
        connectionPriority: 'high',
      });

      const timeout = setTimeout(() => {
        conn.close();
        reject(
          new Error('Connection timed out. Check the code and try again.')
        );
      }, 10000);

      conn.on('open', () => {
        clearTimeout(timeout);
        this.setupConnection(conn);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  setupConnection(conn) {
    console.log('[Multiplayer] New Peer Connection:', conn.peer);

    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.isHost = this.peer.id === this.roomId; // Simple host logic

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
        this.sendWorldSync(conn.peer);
        this.sendWorldDataSync(conn.peer);
      }

      this.game.notifications?.show('Multiplayer', 'Peer Connected!', 'success');
    });

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

  handleWorldSyncChunk(data) {
    const { payload, palette, progress, total, isLast } = data;
    if (!payload || !palette) return;

    const blocks = new Int32Array(payload);
    
    // Batch notifications to reduce UI churn
    if (progress % 5 === 0 || isLast) {
        this.game.notifications?.show('Multiplayer', `Syncing World: ${Math.round((progress/total)*100)}%`, 'info');
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
      }
    }

    if (isLast) {
      console.log('[Multiplayer] World sync complete. Rebuilding geometry...');
      // Mark all chunks for rebuild once
      this.game.world.chunkManager.chunks.forEach(chunk => {
        chunk.dirty = true;
      });
      this.game.world.chunkManager.flushPriorityChunkRebuilds(100);
      this.game.notifications?.show('Multiplayer', 'World Link Stabilized', 'success');
      
      // Force a UI refresh
      window.dispatchEvent(new CustomEvent('ui-set-hud', { detail: true }));
    }
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
        this.game.notifications?.show('Multiplayer', 'World Sync Complete', 'success');
        break;

      case 'world_data_sync':
        if (Array.isArray(data)) {
            data.forEach(([key, meta]) => {
                this.game.world.state.blockData.set(key, meta);
            });
            // Force remesh to show new text/data
            this.game.world.chunkManager.chunks.forEach(chunk => {
                chunk.dirty = true;
            });
        }
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
    if (operation === 'add') {
      this.game.world.addBlock(x, y, z, id, 'remote', true, { silent: true, data: meta });
    } else {
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
  }
}
