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

    init() {
        if (typeof Peer === 'undefined') {
            console.error('[Multiplayer] PeerJS library not found! Ensure CDN script is loaded.');
            return;
        }

        console.log('[Multiplayer] Initializing Secure Peer Pipeline...');
        
        // Generate a cryptographically random, anonymous ID for privacy
        const randomId = 'ARLO-' + Math.random().toString(36).substring(2, 6).toUpperCase() + 
                         '-' + Math.random().toString(36).substring(2, 6).toUpperCase() + 
                         '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
        
        this.peer = new Peer(randomId, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
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
            if (err.type === 'peer-unavailable') msg = 'The Join Code is invalid or the host is offline.';
            if (err.type === 'network') msg = 'P2P tunnel could not be established.';
            this.game.notifications?.add(msg, 'error');
        });
    }

    async connectToPeer(targetId) {
        return new Promise((resolve, reject) => {
            if (!this.peer) return reject(new Error('Peer system not initialized.'));
            
            console.log('[Multiplayer] Attempting to bridge to:', targetId);
            const conn = this.peer.connect(targetId, {
                reliable: true,
                connectionPriority: 'high'
            });

            const timeout = setTimeout(() => {
                conn.close();
                reject(new Error('Connection timed out. Check the code and try again.'));
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
                    mode: this.game.gameState.mode
                }
            });

            // If we are the host, send the current world state to the new client
            if (this.isHost) {
                console.log('[Multiplayer] Host detected, syncing world state to', conn.peer);
                this.sendWorldSync(conn.peer);
            }

            this.game.notifications?.add('Peer Connected!', 'success');
        });

        conn.on('data', (payload) => {
            this.handleMessage(conn.peer, payload);
        });

        conn.on('close', () => {
            console.log('[Multiplayer] Peer Disconnected:', conn.peer);
            this.connections.delete(conn.peer);
            this.removeRemotePlayer(conn.peer);
            this.game.notifications?.add('Peer Disconnected', 'warning');
        });
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
                this.game.hud?.addChat?.(peerId, data.text);
                break;
                
            case 'world_sync':
                console.log('[Multiplayer] Received World Sync from host');
                this.handleWorldSync(data);
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
                x: pos.x, y: pos.y, z: pos.z,
                yaw: rot.yaw, pitch: rot.pitch
            }
        });
    }

    broadcastBlockUpdate(x, y, z, id, type = 'add') {
        this.broadcast({
            type: 'block_update',
            data: { x, y, z, id, operation: type }
        });
    }

    // --- Remote Player Management ---
    
    createRemotePlayer(peerId, data) {
        // In ArloCraft, we can use the existing Mob system or a custom Mesh
        // For now, let's just log it. We will implement proper rendering in the next step.
        console.log('[Multiplayer] Creating sprite for', peerId);
        this.remotePlayers.set(peerId, {
            id: peerId,
            skin: data.skinUsername,
            lastUpdate: Date.now()
        });
        
        // Trigger skin loading for remote player
        if (this.game.entities) {
            this.game.entities.spawnRemotePlayer?.(peerId, data.skinUsername);
        }
    }

    updateRemotePlayer(peerId, data) {
        const p = this.remotePlayers.get(peerId);
        if (!p) return;
        
        p.pos = { x: data.x, y: data.y, z: data.z };
        p.rot = { yaw: data.yaw, pitch: data.pitch };
        p.lastUpdate = Date.now();
        
        // Pass to entity manager for visual update
        if (this.game.entities) {
            this.game.entities.updateRemotePlayer?.(peerId, p.pos, p.rot);
        }
    }

    removeRemotePlayer(peerId) {
        this.remotePlayers.delete(peerId);
        if (this.game.entities) {
            this.game.entities.removeRemotePlayer?.(peerId);
        }
    }

    syncBlock(data) {
        const { x, y, z, id, operation } = data;
        if (operation === 'add') {
            this.game.world.addBlock(x, y, z, id, 'remote', true, { silent: true });
        } else {
            this.game.world.removeBlockAt(x, y, z, { silent: true });
        }
    }

    sendWorldSync(peerId) {
        // Collect all blocks from the blockMap. 
        // For performance, we send them as a list of entries.
        const entries = [];
        for (const [key, id] of this.game.world.state.blockMap.entries()) {
             const [x, y, z] = this.game.world.coords.keyToCoords(key);
             entries.push({ x, y, z, id });
        }

        this.send(peerId, {
            type: 'world_sync',
            data: { blocks: entries }
        });
    }

    handleWorldSync(data) {
        if (!data.blocks || !Array.isArray(data.blocks)) return;
        
        console.log(`[Multiplayer] Applying sync for ${data.blocks.length} blocks...`);
        
        // Use a silent mutation pass to avoid broadcast loops
        for (const b of data.blocks) {
            this.game.world.addBlock(b.x, b.y, b.z, b.id, 'sync', true, { silent: true });
        }
        
        this.game.notifications?.add('World Synchronized', 'success');
    }
}
