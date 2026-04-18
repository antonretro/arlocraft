import * as THREE from 'three';
import LZString from 'lz-string';
import StatsPanel from 'stats.js';
import { ActionSystem } from './ActionSystem.js';
import { Camera } from './Camera.js';
import { DayNightSystem } from './DayNightSystem.js';
import { GameState } from './GameState.js';
import { Input } from './Input.js';
import { Physics } from './Physics.js';
import { Renderer } from './Renderer.js';
import { Stats } from './Stats.js';
import { SurvivalSystem } from './SurvivalSystem.js';
import { EntityManager } from '../entities/EntityManager.js';
import { HUD } from '../ui/HUD.js';
import { World } from '../world/World.js';
import { HelpPanel } from '../ui/HelpPanel.js';
import { MiniMap } from '../ui/MiniMap.js';
import { TouchControls } from '../ui/TouchControls.js';
import { FEATURES } from '../data/features.js';
import { PlayerHand } from '../entities/PlayerHand.js';
import { AudioSystem } from './AudioSystem.js';
import { migrateInventoryItem } from '../data/blockMigrations.js';
import { SkinLoader } from '../utils/SkinLoader.js';
const LOCAL_APP_VERSION = 'v0.0.0';
const GITHUB_REPO_OWNER = 'antonretro';
const GITHUB_REPO_NAME = 'arlocraft';

export class Game {
    constructor() {
        console.log("[ArloCraft] Game constructor starting...");
        this.settings = this.loadSettings();
        this.selectedStartMode = this.settings.preferredMode === 'CREATIVE' ? 'CREATIVE' : 'SURVIVAL';
        this.selectedWorldSlot = this.settings.selectedWorldSlot ?? 'slot-1';
        this.performanceSampler = { frames: 0, time: 0, lastAdjust: 0 };
        this.qualityTier = 'balanced';
        this.qualityInitialized = false;
        this.qualityOrder = ['low', 'balanced', 'high'];
        this.viewYaw = 0;
        this.viewPitch = 0;
        this.pitchLimit = Math.PI / 2 - 0.02;
        this.cameraModes = ['FIRST_PERSON', 'THIRD_PERSON_BACK', 'THIRD_PERSON_FRONT'];
        this.cameraModeIndex = 0;
        this.debugVisible = false;
        this.debugAccumulator = 0;
        this.debugFps = 0;
        this.screenShake = 0;
        this.framePanel = null;
        this.features = { ...FEATURES };
        this.features.dynamicQualityAuto = this.settings.autoQuality;
        this.profiler = { physicsMs: 0, worldMs: 0, renderMs: 0, uiMs: 0 };
        this.idleWorldTick = 0;
        this.latestReleaseInfo = null;
        this.releaseFetchPromise = null;

        this.hasStarted = false;
        this.isPaused = false;

        // Pre-allocated vectors to avoid per-frame GC pressure
        this._camHead = new THREE.Vector3();
        this._camLook = new THREE.Vector3();
        this._camDesired = new THREE.Vector3();
        this.lastKnownPosition = new THREE.Vector3(0, 70, 0);
        this.resumeGraceFrames = 0;

        this.gameState = new GameState();
        this.stats = new Stats();
        this.gameState.stats = this.stats;

        this.renderer = new Renderer();
        this.camera = new Camera(this.renderer.scene);
        this.setupPlayerVisual();

        this.world = new World(this.renderer.scene, this);
        this.entities = new EntityManager(this);
        this.world.init();

        this.physics = new Physics(this.camera, this.world);
        this.physics.autoJumpEnabled = this.settings.autoJump;
        this.hand = new PlayerHand();
        this.camera.viewmodelGroup.add(this.hand.group);
        this.actionSystem = new ActionSystem(this.gameState);
        this.input = new Input(this);
        this.hud = new HUD(this.gameState, this);
        this.survival = new SurvivalSystem(this.gameState, this.hud);
        this.dayNight = new DayNightSystem(this.renderer, this.world, this.features);
        this.helpPanel = new HelpPanel();
        this.minimap = new MiniMap(this);
        this.audio = new AudioSystem();
        this.audio.applyFromSettings(this.settings);
        this.audio.installAutoUnlock(document);
        this.skinLoader = new SkinLoader();

        this.clock = new THREE.Clock();
        this.bindEvents();
        this.setupUI();
        this.setupSkinListeners();
        this.init().catch(e => {
            console.error("[ArloCraft] Init Failure:", e);
            if (this.showOnScreenError) this.showOnScreenError(e.message);
        });
    }

    setupPlayerVisual() {
        const group = new THREE.Group();

        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x7289a2 });
        const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x425566 });

        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.9, 0.38), bodyMaterial);
        torso.position.set(0, 0.95, 0);
        group.add(torso);

        const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), darkMaterial);
        legL.position.set(-0.18, 0.36, 0);
        group.add(legL);

        const legR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.28), darkMaterial);
        legR.position.set(0.18, 0.36, 0);
        group.add(legR);

        const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), darkMaterial);
        armL.position.set(-0.52, 1.0, 0);
        group.add(armL);

        const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.22), darkMaterial);
        armR.position.set(0.52, 1.0, 0);
        group.add(armR);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), bodyMaterial);
        head.position.set(0, 1.72, 0);
        group.add(head);

        const facePath = 'arlo_real.png';
        const faceTexture = new THREE.TextureLoader().load(facePath);
        faceTexture.magFilter = THREE.NearestFilter;
        faceTexture.minFilter = THREE.NearestFilter;
        const facePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.56, 0.56),
            new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
        );
        facePlane.position.set(0, 1.72, 0.322);
        group.add(facePlane);

        group.visible = false;
        this.playerVisual = group;
        this.playerParts = { torso, head, armL, armR, legL, legR, face: facePlane };
        this.renderer.scene.add(this.playerVisual);
    }

    bindEvents() {
        window.addEventListener('player-respawn', () => {
            this.physics.resetPlayer();
            this.audio.play('respawn');
        });

        window.addEventListener('block-mined', (event) => {
            const minedId = event.detail?.id;
            if (minedId) this.gameState.addBlockToInventory(minedId, 1);
            this.stats.addXP(this.world.getBlockXP(minedId));
            this.screenShake = Math.max(this.screenShake, minedId === 'virus' ? 0.09 : 0.05);
            this.audio.play('block-mined', { id: minedId });
        });

        window.addEventListener('enemy-defeated', (event) => {
            const xp = event.detail?.xp ?? 0;
            this.stats.addXP(xp);
            this.audio.play('enemy-defeated');
        });

        window.addEventListener('mode-changed', (event) => {
            this.setMenuMode(event.detail, false);
            this.audio.play('mode-changed');
        });

        window.addEventListener('inventory-toggle', (event) => {
            if (event.detail) this.helpPanel.setState('inventory');
            else if (!this.isPaused && this.hasStarted) this.helpPanel.setState('playing');
            this.audio.play(event.detail ? 'inventory-open' : 'inventory-close');
        });

        window.addEventListener('interact-crafting-table', () => {
            if (!this.hasStarted || this.isPaused) return;
            if (!this.gameState.isInventoryOpen) this.gameState.toggleInventory();
            this.audio.play('crafting-open');
        });

        window.addEventListener('block-placed', (event) => {
            this.audio.play('block-placed', { id: event.detail?.id });
        });
        window.addEventListener('player-damaged', () => {
            this.audio.play('player-damaged');
        });
        window.addEventListener('action-success', () => {
            this.audio.play('action-success');
        });
        window.addEventListener('action-fail', () => {
            this.audio.play('action-fail');
        });
        window.addEventListener('level-up', () => {
            this.audio.play('level-up');
        });

        window.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                e.preventDefault();
                this.toggleDebugOverlay();
            }
        });
    }

    loadSettings() {
        const defaults = {
            sensitivity: 0.00145,
            invertY: false,
            fov: 75,
            qualityTierPref: 'low',
            preferredMode: 'SURVIVAL',
            autoJump: true,
            autoQuality: false,
            fpsCap: 30,
            renderDistance: 2,
            selectedWorldSlot: 'slot-1',
            shadowsEnabled: true,
            fogDensityScale: 1.0,
            perfPanelVisible: false,
            resolutionScale: 0.5,
            audioMuted: false,
            audioMaster: 0.82,
            audioSfx: 0.9,
            audioUi: 0.78,
            audioWorld: 0.85
        };

        try {
            const raw = localStorage.getItem('arlocraft-settings');
            if (!raw) return defaults;
            const parsed = JSON.parse(raw);
            const fov = Number(parsed.fov);
            return {
                sensitivity: Number.isFinite(parsed.sensitivity) ? parsed.sensitivity : defaults.sensitivity,
                invertY: Boolean(parsed.invertY),
                fov: Number.isFinite(fov) && fov >= 60 && fov <= 110 ? fov : defaults.fov,
                qualityTierPref: ['low', 'balanced', 'high'].includes(parsed.qualityTierPref) ? parsed.qualityTierPref : defaults.qualityTierPref,
                preferredMode: parsed.preferredMode === 'CREATIVE' ? 'CREATIVE' : 'SURVIVAL',
                autoJump: parsed.autoJump !== undefined ? Boolean(parsed.autoJump) : defaults.autoJump,
                autoQuality: parsed.autoQuality !== undefined ? Boolean(parsed.autoQuality) : defaults.autoQuality,
                fpsCap: [30, 60, 90, 120, 144, 999].includes(Number(parsed.fpsCap)) ? Number(parsed.fpsCap) : defaults.fpsCap,
                renderDistance: Number.isFinite(parsed.renderDistance)
                    ? Math.max(2, Math.min(6, Math.round(parsed.renderDistance)))
                    : defaults.renderDistance,
                selectedWorldSlot: typeof parsed.selectedWorldSlot === 'string' ? parsed.selectedWorldSlot : defaults.selectedWorldSlot,
                shadowsEnabled: parsed.shadowsEnabled !== undefined ? Boolean(parsed.shadowsEnabled) : defaults.shadowsEnabled,
                fogDensityScale: Number.isFinite(parsed.fogDensityScale) ? parsed.fogDensityScale : defaults.fogDensityScale,
                perfPanelVisible: parsed.perfPanelVisible !== undefined ? Boolean(parsed.perfPanelVisible) : defaults.perfPanelVisible,
                resolutionScale: Number.isFinite(parsed.resolutionScale) ? parsed.resolutionScale : defaults.resolutionScale,
                audioMuted: parsed.audioMuted !== undefined ? Boolean(parsed.audioMuted) : defaults.audioMuted,
                audioMaster: Number.isFinite(parsed.audioMaster) ? Math.max(0, Math.min(1, parsed.audioMaster)) : defaults.audioMaster,
                audioSfx: Number.isFinite(parsed.audioSfx) ? Math.max(0, Math.min(1, parsed.audioSfx)) : defaults.audioSfx,
                audioUi: Number.isFinite(parsed.audioUi) ? Math.max(0, Math.min(1, parsed.audioUi)) : defaults.audioUi,
                audioWorld: Number.isFinite(parsed.audioWorld) ? Math.max(0, Math.min(1, parsed.audioWorld)) : defaults.audioWorld
            };
        } catch {
            return defaults;
        }
    }

    saveSettings() {
        localStorage.setItem('arlocraft-settings', JSON.stringify(this.settings));
    }

    getWorldSlotIds() {
        return ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'];
    }

    getWorldSlotStorageKey(slotId = this.selectedWorldSlot) {
        return `arlocraft-world-save-${slotId}`;
    }

    readWorldSlotSummary(slotId) {
        try {
            const raw = localStorage.getItem(this.getWorldSlotStorageKey(slotId));
            if (!raw) return null;
            const data = this.decodeSavePayload(raw);
            return {
                exists: true,
                seed: String(data?.world?.seed ?? 'unknown'),
                savedAt: String(data?.savedAt ?? ''),
                mode: String(data?.player?.mode ?? 'SURVIVAL')
            };
        } catch {
            return null;
        }
    }

    selectWorldSlot(slotId) {
        if (!this.getWorldSlotIds().includes(slotId)) return;
        this.selectedWorldSlot = slotId;
        this.settings.selectedWorldSlot = slotId;
        this.saveSettings();
        this.renderWorldList();
    }

    renderWorldList() {
        const list = document.getElementById('world-list-container');
        if (!list) return;
        list.innerHTML = '';

        const slotLabel = document.getElementById('create-slot-label');
        if (slotLabel) slotLabel.textContent = this.selectedWorldSlot.toUpperCase();

        const icons = ['???', '??', '???', '???', '??'];
        for (const [idx, slotId] of this.getWorldSlotIds().entries()) {
            const card = document.createElement('div');
            card.className = 'ni-world-card';
            if (slotId === this.selectedWorldSlot) card.classList.add('active');
            const summary = this.readWorldSlotSummary(slotId);
            const icon = icons[idx % icons.length];
            if (summary?.exists) {
                const when = summary.savedAt ? new Date(summary.savedAt).toLocaleDateString() : 'N/A';
                card.innerHTML = `
                    <div class="ni-world-card-icon">${icon}</div>
                    <div class="ni-world-name">${slotId.toUpperCase()}</div>
                    <div class="ni-world-meta">${summary.mode} · Seed: ${summary.seed}</div>
                    <div class="ni-world-meta">${when}</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="ni-world-card-icon" style="opacity: 0.3;">🌑</div>
                    <div class="ni-world-name" style="opacity: 0.5;">${slotId.toUpperCase()}</div>
                    <div class="ni-world-meta">Empty Space</div>
                    <div class="ni-world-meta">Unexplored</div>
                `;
            }

            card.addEventListener('click', () => this.selectWorldSlot(slotId));
            list.appendChild(card);
        }
        this.refreshTitleMenuState();
    }

    refreshTitleMenuState() {
        const summary = this.readWorldSlotSummary(this.selectedWorldSlot);
        const hasSave = Boolean(summary?.exists);
        const playBtn = document.getElementById('btn-play-world');
        const deleteBtn = document.getElementById('btn-delete-world');
        const createBtn = document.getElementById('btn-start');
        if (playBtn) {
            playBtn.disabled = !hasSave;
            playBtn.style.opacity = hasSave ? '1' : '0.55';
            playBtn.title = hasSave ? 'Play the selected saved world' : 'Select a slot with a saved world';
        }
        if (deleteBtn) {
            deleteBtn.disabled = !hasSave;
            deleteBtn.style.opacity = hasSave ? '1' : '0.55';
        }
        if (createBtn) {
            createBtn.textContent = hasSave ? 'Overwrite & Create' : 'Create World!';
        }
    }

    deleteWorldSlot(slotId = this.selectedWorldSlot) {
        const summary = this.readWorldSlotSummary(slotId);
        if (!summary?.exists) {
            this.setStatus(`No save in ${slotId.toUpperCase()} to delete.`, true);
            return false;
        }

        const ok = window.confirm(`Delete ${slotId.toUpperCase()}? This cannot be undone.`);
        if (!ok) return false;

        localStorage.removeItem(this.getWorldSlotStorageKey(slotId));
        if (slotId === this.selectedWorldSlot) {
            this.selectedWorldSlot = slotId;
            this.settings.selectedWorldSlot = slotId;
            this.saveSettings();
        }
        this.renderWorldList();
        this.setStatus(`Deleted ${slotId.toUpperCase()}.`);
        return true;
    }

    setStatus(message, isError = false) {
        const status = document.getElementById('settings-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ff7979' : '#d2ffd6';
    }

    getRepositoryUrl() {
        return `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}`;
    }

    getLatestReleaseApiUrl() {
        return `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
    }

    openRepositoryPage() {
        const url = this.getRepositoryUrl();
        window.open(url, '_blank', 'noopener');
    }

    extractReleaseNotes(body) {
        const lines = String(body ?? '')
            .split(/\r?\n/g)
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .filter((line) => !line.startsWith('#'));

        const cleaned = [];
        for (const raw of lines) {
            const text = raw.replace(/^[-*]\s+/, '').trim();
            if (!text) continue;
            cleaned.push(text);
            if (cleaned.length >= 4) break;
        }

        if (cleaned.length > 0) return cleaned;
        return ['No release notes published yet.'];
    }

    setTitleReleaseInfo(info = {}) {
        const versionEl = document.getElementById('ni-release-version');
        const dateEl = document.getElementById('ni-release-date');
        const notesEl = document.getElementById('ni-release-notes');
        if (!versionEl || !dateEl || !notesEl) return;

        const version = String(info.version ?? LOCAL_APP_VERSION);
        const dateLabel = String(info.dateLabel ?? 'Local build');
        const notes = Array.isArray(info.notes) && info.notes.length > 0
            ? info.notes
            : ['No changelog entries available.'];
        const releaseUrl = typeof info.releaseUrl === 'string' && info.releaseUrl
            ? info.releaseUrl
            : this.getRepositoryUrl();

        versionEl.textContent = `Version: ${version}`;
        dateEl.textContent = dateLabel;
        notesEl.innerHTML = '';
        for (const note of notes) {
            const item = document.createElement('li');
            item.textContent = note;
            notesEl.appendChild(item);
        }

        this.latestReleaseInfo = {
            version,
            dateLabel,
            notes,
            releaseUrl
        };
    }

    async refreshTitleReleaseInfo(force = false) {
        if (!force && this.releaseFetchPromise) return this.releaseFetchPromise;
        if (!force && this.latestReleaseInfo) {
            this.setTitleReleaseInfo(this.latestReleaseInfo);
            return Promise.resolve(this.latestReleaseInfo);
        }

        this.setTitleReleaseInfo({
            version: LOCAL_APP_VERSION,
            dateLabel: 'Checking latest GitHub release...',
            notes: ['Loading changelog...'],
            releaseUrl: this.getRepositoryUrl()
        });

        const fallback = {
            version: LOCAL_APP_VERSION,
            dateLabel: 'Latest release unavailable (offline or rate-limited).',
            notes: ['Showing local build info.'],
            releaseUrl: this.getRepositoryUrl()
        };

        const task = (async () => {
            try {
                const response = await fetch(this.getLatestReleaseApiUrl(), {
                    headers: { Accept: 'application/vnd.github+json' }
                });
                if (!response.ok) throw new Error(`GitHub API error ${response.status}`);

                const data = await response.json();
                const tag = String(data?.tag_name || '').trim() || LOCAL_APP_VERSION;
                const publishedAt = data?.published_at ? new Date(data.published_at) : null;
                const publishedLabel = publishedAt && !Number.isNaN(publishedAt.getTime())
                    ? publishedAt.toLocaleDateString()
                    : 'Unknown date';
                const notes = this.extractReleaseNotes(data?.body);
                const releaseUrl = typeof data?.html_url === 'string' && data.html_url
                    ? data.html_url
                    : this.getRepositoryUrl();

                this.setTitleReleaseInfo({
                    version: tag,
                    dateLabel: `Latest GitHub release · ${publishedLabel}`,
                    notes,
                    releaseUrl
                });
            } catch (error) {
                console.warn('[ArloCraft] Failed to load GitHub release info:', error);
                this.setTitleReleaseInfo(fallback);
            } finally {
                this.releaseFetchPromise = null;
            }
        })();

        this.releaseFetchPromise = task;
        return task;
    }

    handleTitleQuit() {
        const isElectron = /\belectron\//i.test(navigator.userAgent);
        if (isElectron) {
            window.close();
            return;
        }

        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        this.openRepositoryPage();
    }

    grantStarterChestLoot() {
        const loot = [
            { id: 'wood', count: 64, kind: 'block' },
            { id: 'stone', count: 64, kind: 'block' },
            { id: 'dirt', count: 48, kind: 'block' },
            { id: 'sand', count: 32, kind: 'block' },
            { id: 'crafting_table', count: 1, kind: 'block' },
            { id: 'pick_wood', count: 1, kind: 'tool' },
            { id: 'sledge_iron', count: 1, kind: 'tool' },
            { id: 'byte_axe', count: 1, kind: 'tool' },
            { id: 'pulse_pistol', count: 1, kind: 'tool' }
        ];

        const granted = [];
        const overflow = [];
        for (const entry of loot) {
            const ok = this.gameState.addItemToInventory(entry.id, entry.count, entry.kind);
            if (ok) granted.push(entry);
            else overflow.push(entry);
        }

        const summary = granted
            .map((item) => `${item.id} x${item.count}`)
            .join(', ');

        if (summary) this.setStatus(`Starter chest claimed: ${summary}`);
        if (overflow.length > 0) this.setStatus('Starter chest: inventory full for some items.', true);

        window.dispatchEvent(new CustomEvent('inventory-changed'));
        return { granted, overflow };
    }

    setMenuMode(mode, persist = true) {
        const nextMode = mode === 'CREATIVE' ? 'CREATIVE' : 'SURVIVAL';
        this.selectedStartMode = nextMode;

        const indicator = document.getElementById('gamemode-indicator');
        if (indicator) indicator.textContent = `${nextMode} MODE`;

        const btnSurvival = document.getElementById('btn-mode-survival');
        const btnCreative = document.getElementById('btn-mode-creative');
        if (btnSurvival) btnSurvival.classList.toggle('ni-mode-tab-active', nextMode === 'SURVIVAL');
        if (btnCreative) btnCreative.classList.toggle('ni-mode-tab-active', nextMode === 'CREATIVE');

        if (!persist) return;
        this.settings.preferredMode = nextMode;
        this.saveSettings();
    }

    encodeSavePayload(data) {
        const json = JSON.stringify(data);
        return {
            format: 'arlocraft-lz-v1',
            data: LZString.compressToBase64(json)
        };
    }

    decodeSavePayload(rawText) {
        const text = String(rawText ?? '').trim();
        if (!text) throw new Error('Empty save payload');

        const parsed = JSON.parse(text);
        if (parsed?.format === 'arlocraft-lz-v1' && typeof parsed.data === 'string') {
            const decompressed = LZString.decompressFromBase64(parsed.data);
            if (!decompressed) throw new Error('Compressed save could not be decompressed');
            return JSON.parse(decompressed);
        }
        return parsed;
    }

    initPerfPanel() {
        if (!this.features.perfPanel || this.framePanel) return;
        try {
            this.framePanel = new StatsPanel();
            this.framePanel.showPanel(0);
            this.framePanel.dom.style.position = 'absolute';
            this.framePanel.dom.style.top = '12px';
            this.framePanel.dom.style.right = '12px';
            this.framePanel.dom.style.left = 'auto';
            this.framePanel.dom.style.zIndex = '145';
            this.framePanel.dom.style.display = this.debugVisible ? 'block' : 'none';
            document.body.appendChild(this.framePanel.dom);
        } catch {
            this.framePanel = null;
        }
    }

    getSaveData() {
        const playerPos = this.getPlayerPosition();
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            world: this.world.serialize(),
            player: {
                position: { x: playerPos.x, y: playerPos.y, z: playerPos.z },
                look: { yaw: this.viewYaw, pitch: this.viewPitch },
                cameraMode: this.cameraModes[this.cameraModeIndex],
                mode: this.gameState.mode,
                hp: this.gameState.hp,
                hunger: this.gameState.hunger
            },
            stats: {
                level: this.stats.level,
                xp: this.stats.xp,
                xpToNextLevel: this.stats.xpToNextLevel,
                attributes: this.stats.attributes
            },
            inventory: this.gameState.inventory,
            offhand: this.gameState.offhand,
            craftingGrid: this.gameState.craftingGrid
        };
    }

    applySaveData(data) {
        if (!data || !data.world) throw new Error('Invalid save file');

        this.world.loadFromData(data.world);
        this.resetEntities();

        const seedInput = document.getElementById('seed-input');
        if (seedInput) seedInput.value = this.world.seedString;

        if (Array.isArray(data.inventory)) {
            this.gameState.inventory = data.inventory.slice(0, 36).map((item) => migrateInventoryItem(item));
            while (this.gameState.inventory.length < 36) this.gameState.inventory.push(null);
        }

        this.gameState.offhand = migrateInventoryItem(data?.offhand ?? null);

        if (Array.isArray(data.craftingGrid)) {
            this.gameState.craftingGrid = data.craftingGrid.slice(0, 9).map((item) => migrateInventoryItem(item));
            while (this.gameState.craftingGrid.length < 9) this.gameState.craftingGrid.push(null);
        }

        if (data.player) {
            if (data.player.mode) this.gameState.setMode(data.player.mode);
            if (Number.isFinite(data.player.hp)) this.gameState.hp = data.player.hp;
            if (Number.isFinite(data.player.hunger)) this.gameState.hunger = data.player.hunger;

            if (data.player.look) {
                this.viewYaw = Number(data.player.look.yaw) || 0;
                this.viewPitch = Number(data.player.look.pitch) || 0;
            }

            if (typeof data.player.cameraMode === 'string') {
                const idx = this.cameraModes.indexOf(data.player.cameraMode);
                if (idx >= 0) this.cameraModeIndex = idx;
            }
        }

        if (data.stats) {
            this.stats.level = Number.isFinite(data.stats.level) ? data.stats.level : this.stats.level;
            this.stats.xp = Number.isFinite(data.stats.xp) ? data.stats.xp : this.stats.xp;
            this.stats.xpToNextLevel = Number.isFinite(data.stats.xpToNextLevel) ? data.stats.xpToNextLevel : this.stats.xpToNextLevel;
            if (data.stats.attributes && typeof data.stats.attributes === 'object') {
                this.stats.attributes = {
                    strength: data.stats.attributes.strength ?? this.stats.attributes.strength,
                    agility: data.stats.attributes.agility ?? this.stats.attributes.agility,
                    spirit: data.stats.attributes.spirit ?? this.stats.attributes.spirit
                };
            }
        }

        const px = data.player?.position?.x ?? 0;
        const py = data.player?.position?.y ?? 2.5;
        const pz = data.player?.position?.z ?? 0;
        if (this.physics.isReady) {
            const savedChunkX = this.world.getChunkCoord(px);
            const savedChunkZ = this.world.getChunkCoord(pz);
            this.world.ensureChunksAround(savedChunkX, savedChunkZ);
            this.world.processChunkLoadQueue(savedChunkX, savedChunkZ, 20);

            let spawnX = px;
            let spawnY = py;
            let spawnZ = pz;
            if (this.world.isPositionInWater(spawnX, spawnY, spawnZ)) {
                const safe = this.world.getSafeSpawnPoint(px, pz, 40);
                spawnX = safe.x;
                spawnY = safe.y;
                spawnZ = safe.z;
            }

            this.physics.playerBody.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true);
            this.physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            this.physics.setMode(this.gameState.mode);
            this.updateCameraFromPlayer();
        }

        window.dispatchEvent(new CustomEvent('inventory-changed'));
        window.dispatchEvent(new CustomEvent('offhand-changed', { detail: this.gameState.offhand }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.gameState.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.gameState.hunger }));
        window.dispatchEvent(new CustomEvent('xp-changed', { detail: { xp: this.stats.xp, max: this.stats.xpToNextLevel } }));
    }

    toggleOffhandFromSelected() {
        if (!this.hasStarted || this.isPaused) return;
        this.gameState.equipOffhandFromSlot(this.gameState.selectedSlot);
        const offhand = this.gameState.getOffhandItem();
        const label = offhand ? `${offhand.id} x${offhand.count ?? 1}` : 'empty';
        this.setStatus(`Offhand: ${label}`);
    }

    saveWorldLocal(slotId = this.selectedWorldSlot) {
        const data = this.getSaveData();
        const packed = this.encodeSavePayload(data);
        localStorage.setItem(this.getWorldSlotStorageKey(slotId), JSON.stringify(packed));
        this.renderWorldList();
        this.setStatus(`World saved to ${slotId.toUpperCase()}.`);
    }

    loadWorldLocal(slotId = this.selectedWorldSlot, options = {}) {
        try {
            const raw = localStorage.getItem(this.getWorldSlotStorageKey(slotId));
            if (!raw) {
                if (!options.silent) this.setStatus(`No save in ${slotId.toUpperCase()}.`, true);
                return false;
            }
            const data = this.decodeSavePayload(raw);
            this.applySaveData(data);
            this.renderWorldList();
            if (!options.silent) this.setStatus(`Loaded ${slotId.toUpperCase()}.`);
            return true;
        } catch {
            if (!options.silent) this.setStatus(`Failed to load ${slotId.toUpperCase()}.`, true);
            return false;
        }
    }

    exportWorldFile() {
        const data = this.getSaveData();
        const payload = JSON.stringify(this.encodeSavePayload(data));
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const seedName = (this.world.seedString || 'world').replace(/[^a-zA-Z0-9-_]/g, '_');
        a.href = url;
        a.download = `arlocraft_${seedName}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        this.setStatus('World exported.');
    }

    importWorldFile(file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = this.decodeSavePayload(String(reader.result ?? '{}'));
                this.applySaveData(data);
                this.setStatus('World imported successfully.');
            } catch {
                this.setStatus('Invalid world file.', true);
            }
        };
        reader.readAsText(file);
    }

    randomizeSeed() {
        const input = document.getElementById('seed-input');
        if (!input) return;
        const random = `${Math.floor(Math.random() * 999999999)}`;
        input.value = random;
        this.setStatus(`Generated seed: ${random}`);
    }

    applySeedFromInput() {
        const seedInput = document.getElementById('seed-input');
        if (!seedInput) return;
        const seedValue = String(seedInput.value ?? '').trim();
        if (!seedValue) return;

        if (seedValue !== this.world.seedString) {
            this.world.loadFromData({ seed: seedValue, changedBlocks: [] });
            this.resetEntities();
            this.physics.resetPlayer();
            this.gameState.craftingGrid = new Array(9).fill(null);
            this.gameState.craftingResult = null;
            this.setStatus(`Loaded seed: ${seedValue}`);
        }
    }

    startGame(options = {}) {
        if (!options.skipSeedApply) this.applySeedFromInput();

        const mode = options.preserveCurrentMode
            ? this.gameState.mode
            : (options.mode ?? this.selectedStartMode ?? 'SURVIVAL');
        this.gameState.setMode(mode);
        this.physics.setMode(mode);

        this.hasStarted = true;
        this.isPaused = false;
        this.gameState.setPaused(false);
        this.idleWorldTick = 0;

        this.showLoadingScreen('Generating World...', 'Building terrain and structures...');
        this.showPause(false);
        this.showSettings(false);
        this.helpPanel.setState('playing');

        setTimeout(() => {
            const overlay = document.getElementById('overlay');
            if (overlay) overlay.style.display = 'none';
            if (this._loadingInterval) { clearInterval(this._loadingInterval); this._loadingInterval = null; }
            const bar = document.getElementById('loading-progress');
            if (bar) bar.style.width = '100%';

            if (this.touchControls) {
                this.touchControls.show(true);
            } else {
                this.input.setPointerLock();
            }

            document.getElementById('crosshair')?.classList.add('active');
            const hud = document.getElementById('hud');
            if (hud) hud.style.display = 'flex';
        }, 1800);
    }

    returnToTitle() {
        this.cancelMining();
        this.isPaused = false;
        this.hasStarted = false;
        this.gameState.setPaused(false);
        this.idleWorldTick = 0;

        if (this.gameState.isInventoryOpen) this.gameState.toggleInventory();
        if (document.pointerLockElement) document.exitPointerLock();

        this.touchControls?.show(false);
        document.getElementById('crosshair')?.classList.remove('active');
        const hud = document.getElementById('hud');
        if (hud) hud.style.display = 'none';
        this.showPause(false);
        this.showSettings(false);
        this.showTitle(true);
        this.renderWorldList();
        this.helpPanel.setState('title');
    }

    showTitle(visible) {
        const overlay = document.getElementById('overlay');
        if (!overlay) return;
        overlay.style.display = visible ? 'flex' : 'none';
        if (visible) {
            this.renderWorldList();
            this.setMenuScreen('title');
            this.refreshTitleReleaseInfo(false);

            if (!this._niClockTick) {
                this._niClockTick = setInterval(() => {
                    const el = document.querySelector('.ni-time');
                    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }, 1000);
            }
        }
    }

    showPause(visible) {
        const pause = document.getElementById('pause-overlay');
        if (!pause) return;
        pause.style.display = visible ? 'flex' : 'none';

        if (visible) {
            // Update the premium Pause Menu details
            const clockEl = document.getElementById('ni-pause-clock');
            if (clockEl && this.dayNight) {
                // Convert 0-1 timeOfDay to 24h, then 12h format
                // 0.3 is dawn, let's assume 0.0 is midnight.
                const hoursTotal = (this.dayNight.timeOfDay * 24);
                const hours = Math.floor(hoursTotal);
                const minutes = Math.floor((hoursTotal % 1) * 60);
                const ampm = hours >= 12 ? 'PM' : 'AM';
                const displayHours = hours % 12 || 12;
                const displayMinutes = minutes.toString().padStart(2, '0');
                clockEl.textContent = `${displayHours}:${displayMinutes} ${ampm}`;
            }

            const statusEl = document.querySelector('.ni-pause-status');
            if (statusEl) {
                const biomes = ['Plains', 'Forest', 'Desert', 'Mountains', 'Meadow'];
                const biome = biomes[Math.floor(this.dayNight.timeOfDay * biomes.length)] || 'Exploring';
                statusEl.textContent = `Surviving in ${biome}`;
            }
        }
    }

    setMenuScreen(screen) {
        const screenIds = ['screen-booting', 'screen-title', 'screen-world-select', 'screen-world-create', 'screen-loading'];
        const nextId = screen === 'booting' ? 'screen-booting'
            : screen === 'world-select' ? 'screen-world-select'
            : screen === 'world-create' ? 'screen-world-create'
            : screen === 'loading' ? 'screen-loading'
            : 'screen-title';
        for (const id of screenIds) {
            const node = document.getElementById(id);
            if (!node) continue;
            node.classList.toggle('ni-screen-active', id === nextId);
        }
    }

    showLoadingScreen(statusText = 'Generating World...', subText = 'Building terrain and structures...') {
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'flex';
        const status = document.getElementById('loading-status');
        const sub = document.getElementById('loading-subtext');
        const bar = document.getElementById('loading-progress');
        if (status) status.textContent = statusText;
        if (sub) sub.textContent = subText;
        if (bar) bar.style.width = '0%';
        this.setMenuScreen('loading');
        // Animate progress bar
        if (this._loadingInterval) clearInterval(this._loadingInterval);
        let pct = 0;
        this._loadingInterval = setInterval(() => {
            pct = Math.min(pct + Math.random() * 8, 90);
            if (bar) bar.style.width = pct + '%';
        }, 120);
    }

    hideLoadingScreen() {
        if (this._loadingInterval) { clearInterval(this._loadingInterval); this._loadingInterval = null; }
        const bar = document.getElementById('loading-progress');
        if (bar) bar.style.width = '100%';
        setTimeout(() => this.setMenuScreen('title'), 350);
    }

    isSettingsOpen() {
        const panel = document.getElementById('settings-panel');
        return Boolean(panel && panel.style.display !== 'none');
    }

    showSettings(visible) {
        const panel = document.getElementById('settings-panel');
        if (!panel) return;
        panel.style.display = visible ? 'flex' : 'none';
        if (visible && this.isPaused) this.showPause(false);
    }

    togglePause() {
        if (!this.hasStarted) return;

        if (this.isSettingsOpen()) {
            this.showSettings(false);
            if (this.isPaused) this.showPause(true);
            return;
        }

        if (this.gameState.isInventoryOpen) {
            this.gameState.toggleInventory();
            return;
        }

        if (this.isPaused) this.resumeGame();
        else this.pauseGame();
    }

    pauseGame() {
        if (!this.hasStarted || this.isPaused) return;
        this.isPaused = true;
        this.gameState.setPaused(true);
        this.cancelMining();
        this.showSettings(false);
        this.showPause(true);
        this.helpPanel.setState('paused');
        this.touchControls?.show(false);

        if (document.pointerLockElement) document.exitPointerLock();
    }

    resumeGame() {
        if (!this.hasStarted) return;
        this.isPaused = false;
        this.gameState.setPaused(false);
        this.showPause(false);
        this.showSettings(false);

        if (this.touchControls) {
            this.touchControls.show(true);
            this.helpPanel.setState('playing');
        } else if (!this.gameState.isInventoryOpen) {
            this.helpPanel.setState('playing');
            this.input.setPointerLock();
        }
    }

    toggleInventory() {
        if (!this.hasStarted || this.isPaused) return;
        this.gameState.toggleInventory();
    }

    onPointerLockChange(locked) {
        if (!this.hasStarted) {
            this.showTitle(true);
            this.showPause(false);
            this.helpPanel.setState('title');
            return;
        }

        if (locked) {
            this.showTitle(false);
            this.showPause(false);
            if (!this.isPaused && !this.gameState.isInventoryOpen) this.helpPanel.setState('playing');
            return;
        }

        if (this.gameState.isInventoryOpen) {
            this.helpPanel.setState('inventory');
            return;
        }

        if (this.isPaused) {
            this.showPause(true);
            this.helpPanel.setState('paused');
            return;
        }
        // Do not auto-pause when pointer lock is lost/blocked on startup.
        // Player can click canvas again to re-lock mouse.
        this.showPause(false);
        this.helpPanel.setState('playing');
    }

    setupUI() {
        const seedInput = document.getElementById('seed-input');
        const btnStart = document.getElementById('btn-start');
        const btnModeSurvival = document.getElementById('btn-mode-survival');
        const btnModeCreative = document.getElementById('btn-mode-creative');
        const btnRandomSeed = document.getElementById('btn-title-random-seed');
        const btnToWorlds = document.getElementById('btn-to-worlds');
        const btnToSettings = document.getElementById('btn-to-settings');
        const btnTitleQuit = document.getElementById('btn-title-quit');
        const btnReleaseRefresh = document.getElementById('btn-release-refresh');
        const btnOpenRelease = document.getElementById('btn-open-release');
        const btnOpenRepo = document.getElementById('btn-open-repo');
        const btnPlayWorld = document.getElementById('btn-play-world');
        const btnNewWorld = document.getElementById('btn-new-world');
        const btnDeleteWorld = document.getElementById('btn-delete-world');
        const btnWorldsBack = document.getElementById('btn-worlds-back');
        const btnCreateBack = document.getElementById('btn-create-back');

        // Backward-compatible IDs kept for legacy templates.
        const btnOptions = document.getElementById('btn-options');
        const btnTitleLoad = document.getElementById('btn-title-load');

        const btnClose = document.getElementById('btn-settings-close');
        const sensitivityInput = document.getElementById('setting-sensitivity');
        const sensitivityLabel = document.getElementById('setting-sensitivity-value');
        const invertYInput = document.getElementById('setting-invert-y');
        const autoJumpInput = document.getElementById('setting-auto-jump');
        const fovInput = document.getElementById('setting-fov');
        const fovLabel = document.getElementById('setting-fov-value');
        const renderDistanceInput = document.getElementById('setting-render-distance');
        const renderDistanceLabel = document.getElementById('setting-render-distance-value');
        const autoQualityInput = document.getElementById('setting-auto-quality');
        const qualityBtns = document.querySelectorAll('.btn-quality');
        const btnSave = document.getElementById('btn-save-world');
        const btnLoad = document.getElementById('btn-load-world');
        const btnExport = document.getElementById('btn-export-world');
        const btnImport = document.getElementById('btn-import-world');
        const fileInput = document.getElementById('import-world-input');

        const btnResume = document.getElementById('btn-resume');
        const btnPauseSettings = document.getElementById('btn-pause-settings');
        const btnPauseSave = document.getElementById('btn-pause-save');
        const btnPauseLoad = document.getElementById('btn-pause-load');
        const btnBackTitle = document.getElementById('btn-back-title');

        const shadowsInput = document.getElementById('setting-shadows');
        const fogInput = document.getElementById('setting-fog');
        const fogLabel = document.getElementById('setting-fog-value');
        const perfPanelInput = document.getElementById('setting-perf-panel');
        const btnExportSave = document.getElementById('btn-export-save');
        const btnResetSettings = document.getElementById('btn-reset-settings');
        const resolutionInput = document.getElementById('setting-resolution');
        const resolutionLabel = document.getElementById('setting-resolution-value');
        const audioMuteInput = document.getElementById('setting-audio-muted');
        const audioMasterInput = document.getElementById('setting-audio-master');
        const audioMasterLabel = document.getElementById('setting-audio-master-value');
        const audioSfxInput = document.getElementById('setting-audio-sfx');
        const audioSfxLabel = document.getElementById('setting-audio-sfx-value');
        const audioUiInput = document.getElementById('setting-audio-ui');
        const audioUiLabel = document.getElementById('setting-audio-ui-value');
        const audioWorldInput = document.getElementById('setting-audio-world');
        const audioWorldLabel = document.getElementById('setting-audio-world-value');

        if (seedInput) seedInput.value = this.world.seedString;

        const openWorldSelect = () => {
            this.renderWorldList();
            this.setMenuScreen('world-select');
        };
        const openWorldCreate = () => {
            this.renderWorldList();
            this.setMenuScreen('world-create');
        };
        const playSelectedWorld = () => {
            const loaded = this.loadWorldLocal(this.selectedWorldSlot);
            if (loaded) {
                this.startGame({ skipSeedApply: true, preserveCurrentMode: true });
                return;
            }
            this.setStatus(`No save in ${this.selectedWorldSlot.toUpperCase()}.`, true);
            this.setMenuScreen('world-create');
        };

        if (btnStart) {
            btnStart.addEventListener('click', () => {
                const summary = this.readWorldSlotSummary(this.selectedWorldSlot);
                if (summary?.exists) {
                    const confirmed = window.confirm(
                        `${this.selectedWorldSlot.toUpperCase()} already has a world. Create a new one with this seed and overwrite it on next save?`
                    );
                    if (!confirmed) return;
                }
                this.startGame({ skipSeedApply: false, preserveCurrentMode: false });
            });
        }

        if (btnModeSurvival) {
            btnModeSurvival.addEventListener('click', () => this.setMenuMode('SURVIVAL'));
        }
        if (btnModeCreative) {
            btnModeCreative.addEventListener('click', () => this.setMenuMode('CREATIVE'));
        }

        if (btnRandomSeed) {
            btnRandomSeed.addEventListener('click', () => this.randomizeSeed());
        }

        if (btnToWorlds) btnToWorlds.addEventListener('click', openWorldSelect);
        if (btnWorldsBack) btnWorldsBack.addEventListener('click', () => this.setMenuScreen('title'));
        if (btnNewWorld) btnNewWorld.addEventListener('click', openWorldCreate);
        if (btnCreateBack) btnCreateBack.addEventListener('click', openWorldSelect);
        if (btnPlayWorld) btnPlayWorld.addEventListener('click', playSelectedWorld);
        if (btnDeleteWorld) btnDeleteWorld.addEventListener('click', () => this.deleteWorldSlot(this.selectedWorldSlot));

        if (btnToSettings) {
            btnToSettings.addEventListener('click', () => {
                this.showSettings(true);
                this.setStatus('Settings opened.');
            });
        }
        if (btnTitleQuit) btnTitleQuit.addEventListener('click', () => this.handleTitleQuit());
        if (btnReleaseRefresh) btnReleaseRefresh.addEventListener('click', () => this.refreshTitleReleaseInfo(true));
        if (btnOpenRepo) btnOpenRepo.addEventListener('click', () => this.openRepositoryPage());
        if (btnOpenRelease) {
            btnOpenRelease.addEventListener('click', () => {
                const target = this.latestReleaseInfo?.releaseUrl || this.getRepositoryUrl();
                window.open(target, '_blank', 'noopener');
            });
        }

        if (btnTitleLoad) {
            btnTitleLoad.addEventListener('click', playSelectedWorld);
        }

        if (sensitivityInput) {
            sensitivityInput.value = String(this.settings.sensitivity);
            if (sensitivityLabel) sensitivityLabel.textContent = Number(this.settings.sensitivity).toFixed(4);
            sensitivityInput.addEventListener('input', () => {
                const value = Number(sensitivityInput.value);
                this.settings.sensitivity = value;
                this.saveSettings();
                if (sensitivityLabel) sensitivityLabel.textContent = value.toFixed(4);
                this.setStatus(`Sensitivity: ${value.toFixed(4)}`);
            });
        }

        if (invertYInput) {
            invertYInput.checked = this.settings.invertY;
            invertYInput.addEventListener('change', () => {
                this.settings.invertY = invertYInput.checked;
                this.saveSettings();
                this.setStatus(`Invert Y: ${invertYInput.checked ? 'ON' : 'OFF'}`);
            });
        }

        if (autoJumpInput) {
            autoJumpInput.checked = this.settings.autoJump;
            autoJumpInput.addEventListener('change', () => {
                this.settings.autoJump = autoJumpInput.checked;
                this.physics.autoJumpEnabled = autoJumpInput.checked;
                this.saveSettings();
                this.setStatus(`Auto Jump: ${autoJumpInput.checked ? 'ON' : 'OFF'}`);
            });
        }

        if (fovInput) {
            fovInput.value = String(this.settings.fov);
            if (fovLabel) fovLabel.textContent = `${this.settings.fov} deg`;
            fovInput.addEventListener('input', () => {
                const value = Number(fovInput.value);
                this.settings.fov = value;
                this.saveSettings();
                if (fovLabel) fovLabel.textContent = `${value} deg`;
                this.camera.instance.fov = value;
                this.camera.instance.updateProjectionMatrix();
                this.setStatus(`FOV: ${value} deg`);
            });
        }

        if (renderDistanceInput) {
            renderDistanceInput.value = String(this.settings.renderDistance);
            if (renderDistanceLabel) renderDistanceLabel.textContent = String(this.settings.renderDistance);
            renderDistanceInput.addEventListener('input', () => {
                const value = Math.max(2, Math.min(6, Math.round(Number(renderDistanceInput.value))));
                this.settings.renderDistance = value;
                const effective = this.getEffectiveRenderDistanceForTier(this.qualityTier);
                this.world.setRenderDistance(effective);
                this.saveSettings();
                if (renderDistanceLabel) renderDistanceLabel.textContent = String(value);
                this.setStatus(`Render Distance: ${value} (effective ${effective})`);
            });
        }

        const syncQualityBtns = () => {
            qualityBtns.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.tier === this.qualityTier);
            });
        };
        qualityBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tier = btn.dataset.tier;
                this.settings.qualityTierPref = tier;
                this.saveSettings();
                this.applyQualityTier(tier);
                syncQualityBtns();
                const effective = this.getEffectiveRenderDistanceForTier(tier);
                this.setStatus(`Quality: ${tier.charAt(0).toUpperCase() + tier.slice(1)} (render ${effective})`);
            });
        });
        syncQualityBtns();

        if (autoQualityInput) {
            autoQualityInput.checked = this.settings.autoQuality;
            autoQualityInput.addEventListener('change', () => {
                this.settings.autoQuality = autoQualityInput.checked;
                this.features.dynamicQualityAuto = autoQualityInput.checked;
                this.saveSettings();
                this.setStatus(`Auto Quality: ${autoQualityInput.checked ? 'ON' : 'OFF'}`);
            });
        }

        const fpsCapSelect = document.getElementById('setting-fps-cap');
        if (fpsCapSelect) {
            fpsCapSelect.value = String(this.settings.fpsCap ?? 60);
            fpsCapSelect.addEventListener('change', () => {
                this.settings.fpsCap = Number(fpsCapSelect.value);
                this.saveSettings();
                this.setStatus(`FPS Cap: ${this.settings.fpsCap === 999 ? 'Uncapped' : this.settings.fpsCap + ' FPS'}`);
            });
        }

        if (btnOptions) {
            btnOptions.addEventListener('click', () => {
                this.showSettings(true);
                this.setStatus('Settings opened.');
            });
        }

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.showSettings(false);
                if (this.isPaused) this.showPause(true);
            });
        }

        if (btnResume) btnResume.addEventListener('click', () => this.resumeGame());
        if (btnPauseSettings) btnPauseSettings.addEventListener('click', () => {
            this.showPause(false);
            this.showSettings(true);
        });
        if (btnPauseSave) btnPauseSave.addEventListener('click', () => this.saveWorldLocal(this.selectedWorldSlot));
        if (btnPauseLoad) btnPauseLoad.addEventListener('click', () => this.loadWorldLocal(this.selectedWorldSlot));
        if (btnBackTitle) btnBackTitle.addEventListener('click', () => this.returnToTitle());

        if (btnSave) btnSave.addEventListener('click', () => this.saveWorldLocal(this.selectedWorldSlot));
        if (btnLoad) btnLoad.addEventListener('click', () => this.loadWorldLocal(this.selectedWorldSlot));
        if (btnExport) btnExport.addEventListener('click', () => this.exportWorldFile());
        if (btnImport && fileInput) {
            btnImport.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', () => {
                const file = fileInput.files?.[0];
                if (!file) return;
                this.importWorldFile(file);
                fileInput.value = '';
            });
        }

        // NI Settings Tab Switching
        const tabLinks = document.querySelectorAll('.ni-tab-link');
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                const target = link.dataset.tab;
                tabLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                document.querySelectorAll('.ni-tab-pane').forEach(pane => {
                    pane.classList.toggle('active', pane.id === target);
                });
            });
        });

        // --- Shadows ---
        if (shadowsInput) {
            shadowsInput.checked = this.settings.shadowsEnabled;
            shadowsInput.addEventListener('change', () => {
                this.settings.shadowsEnabled = shadowsInput.checked;
                this.renderer.toggleShadows(shadowsInput.checked);
                this.saveSettings();
                this.setStatus(`Shadows: ${shadowsInput.checked ? 'ON' : 'OFF'}`);
            });
        }

        // --- Fog ---
        if (fogInput) {
            fogInput.value = String(this.settings.fogDensityScale);
            if (fogLabel) fogLabel.textContent = Number(this.settings.fogDensityScale).toFixed(1);
            fogInput.addEventListener('input', () => {
                const val = Number(fogInput.value);
                this.settings.fogDensityScale = val;
                this.renderer.setFogDensityScale(val);
                this.saveSettings();
                if (fogLabel) fogLabel.textContent = val.toFixed(1);
            });
        }

        // --- Perf Panel ---
        if (perfPanelInput) {
            perfPanelInput.checked = this.settings.perfPanelVisible;
            perfPanelInput.addEventListener('change', () => {
                this.settings.perfPanelVisible = perfPanelInput.checked;
                this.debugVisible = perfPanelInput.checked;
                if (this.framePanel) this.framePanel.dom.style.display = this.debugVisible ? 'block' : 'none';
                this.saveSettings();
            });
        }

        // --- System Buttons ---
        if (btnExportSave) {
            btnExportSave.addEventListener('click', () => this.exportWorldFile());
        }
        if (btnResetSettings) {
            btnResetSettings.addEventListener('click', () => {
                if (window.confirm('Reset all settings to default?')) {
                    localStorage.removeItem('arlocraft-settings');
                    window.location.reload();
                }
            });
        }

        // --- Resolution ---
        if (resolutionInput) {
            resolutionInput.value = String(this.settings.resolutionScale);
            this.renderer.setResolutionScale(this.settings.resolutionScale);
            if (resolutionLabel) resolutionLabel.textContent = `${Number(this.settings.resolutionScale).toFixed(1)}x`;
            resolutionInput.addEventListener('input', () => {
                const val = Number(resolutionInput.value);
                this.settings.resolutionScale = val;
                this.renderer.setResolutionScale(val);
                this.saveSettings();
                if (resolutionLabel) resolutionLabel.textContent = `${val.toFixed(1)}x`;
                this.setStatus(`Resolution Scale: ${val.toFixed(1)}x`);
            });
        }

        const syncAudioLabel = (el, value) => {
            if (!el) return;
            el.textContent = `${Math.round(value * 100)}%`;
        };
        const applyAudioSettings = (statusText = null) => {
            this.audio.applyFromSettings(this.settings);
            this.saveSettings();
            if (statusText) this.setStatus(statusText);
        };

        if (audioMuteInput) {
            audioMuteInput.checked = this.settings.audioMuted;
            audioMuteInput.addEventListener('change', () => {
                this.settings.audioMuted = audioMuteInput.checked;
                applyAudioSettings(`Audio: ${audioMuteInput.checked ? 'MUTED' : 'ON'}`);
            });
        }
        if (audioMasterInput) {
            audioMasterInput.value = String(this.settings.audioMaster);
            syncAudioLabel(audioMasterLabel, this.settings.audioMaster);
            audioMasterInput.addEventListener('input', () => {
                const val = Math.max(0, Math.min(1, Number(audioMasterInput.value)));
                this.settings.audioMaster = val;
                syncAudioLabel(audioMasterLabel, val);
                applyAudioSettings(`Master Volume: ${Math.round(val * 100)}%`);
            });
        }
        if (audioSfxInput) {
            audioSfxInput.value = String(this.settings.audioSfx);
            syncAudioLabel(audioSfxLabel, this.settings.audioSfx);
            audioSfxInput.addEventListener('input', () => {
                const val = Math.max(0, Math.min(1, Number(audioSfxInput.value)));
                this.settings.audioSfx = val;
                syncAudioLabel(audioSfxLabel, val);
                applyAudioSettings(`SFX Volume: ${Math.round(val * 100)}%`);
            });
        }
        if (audioUiInput) {
            audioUiInput.value = String(this.settings.audioUi);
            syncAudioLabel(audioUiLabel, this.settings.audioUi);
            audioUiInput.addEventListener('input', () => {
                const val = Math.max(0, Math.min(1, Number(audioUiInput.value)));
                this.settings.audioUi = val;
                syncAudioLabel(audioUiLabel, val);
                applyAudioSettings(`UI Volume: ${Math.round(val * 100)}%`);
            });
        }
        if (audioWorldInput) {
            audioWorldInput.value = String(this.settings.audioWorld);
            syncAudioLabel(audioWorldLabel, this.settings.audioWorld);
            audioWorldInput.addEventListener('input', () => {
                const val = Math.max(0, Math.min(1, Number(audioWorldInput.value)));
                this.settings.audioWorld = val;
                syncAudioLabel(audioWorldLabel, val);
                applyAudioSettings(`World Volume: ${Math.round(val * 100)}%`);
            });
        }

        const canvas = this.renderer.instance.domElement;
        canvas.addEventListener('click', () => {
            if (!this.hasStarted || this.isPaused || this.gameState.isInventoryOpen || this.input.isLocked) return;
            this.input.setPointerLock();
        });

        this.setMenuMode(this.selectedStartMode, false);
        this.world.setRenderDistance(this.getEffectiveRenderDistanceForTier(this.settings.qualityTierPref ?? this.qualityTier));
        this.setTitleReleaseInfo({
            version: LOCAL_APP_VERSION,
            dateLabel: 'Checking latest GitHub release...',
            notes: ['Loading changelog...'],
            releaseUrl: this.getRepositoryUrl()
        });
        this.renderWorldList();
        this.setMenuScreen('title');
    }
    async init() {
        console.log("[ArloCraft] Starting engine init...");
        await this.physics.init();
        console.log("[ArloCraft] Physics initialized.");
        this.applyQualityTier(this.settings.qualityTierPref ?? 'low');
        this.camera.instance.fov = this.settings.fov ?? 75;
        this.camera.instance.updateProjectionMatrix();
        this.renderer.toggleShadows(this.settings.shadowsEnabled);
        this.renderer.setFogDensityScale(this.settings.fogDensityScale);
        this.renderer.setResolutionScale(this.settings.resolutionScale);
        this.audio.applyFromSettings(this.settings);
        if (this.settings.perfPanelVisible) {
            this.debugVisible = true;
            if (this.framePanel) this.framePanel.dom.style.display = 'block';
        }
        this.hud.init();
        this.updatePlayerSkin(); // Final Premium Polish: Initialize textured arms immediately
        this.initPerfPanel();

        if (TouchControls.isTouchDevice()) {
            this.touchControls = new TouchControls(this);
        }

        console.log("[ArloCraft] Initializing UI elements...");
        this.onResize();
        this.animate();
        window.addEventListener('resize', () => this.onResize());

        console.log("[ArloCraft] Transitioning to Title Screen...");
        this.showTitle(true);
        this.showPause(false);
        this.showSettings(false);
        this.helpPanel.setState('title');
    }

    resetEntities() {
        for (const entity of this.entities.entities) {
            this.renderer.scene.remove(entity.mesh);
        }
        this.entities.entities = [];
    }

    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.camera.instance.aspect = window.innerWidth / window.innerHeight;
        this.camera.instance.updateProjectionMatrix();
    }

    getPlayerPosition() {
        if (!this.physics?.playerBody) return this.lastKnownPosition.clone();
        
        const pos = this.physics.playerBody.translation();
        
        // Safety: If physics returns exactly (0,0,0) after game start, 
        // it's likely a stale/uninitialized state on resume. 
        // We use our last known good position instead.
        if (this.hasStarted && pos.x === 0 && pos.y === 0 && pos.z === 0) {
            return this.lastKnownPosition.clone();
        }

        this.lastKnownPosition.set(pos.x, pos.y, pos.z);
        return this.lastKnownPosition.clone();
    }

    adjustLook(deltaYaw, deltaPitch) {
        this.viewYaw += deltaYaw;
        this.viewPitch = THREE.MathUtils.clamp(this.viewPitch + deltaPitch, -this.pitchLimit, this.pitchLimit);
    }

    cycleCameraMode() {
        this.cameraModeIndex = (this.cameraModeIndex + 1) % this.cameraModes.length;
    }

    toggleDebugOverlay() {
        this.debugVisible = !this.debugVisible;
        const overlay = document.getElementById('debug-overlay');
        if (!overlay) return;
        overlay.style.display = this.debugVisible ? 'block' : 'none';
        if (this.framePanel?.dom) {
            this.framePanel.dom.style.display = this.debugVisible ? 'block' : 'none';
        }
        this.audio?.play('ui-click');
    }

    toggleHelpPanel() {
        this.helpPanel?.toggleCollapsed?.();
    }

    toggleMinimap() {
        if (!this.features.minimap) return;
        this.minimap.toggle();
    }

    updateCameraFromPlayer(positionOverride = null) {
        if (!this.physics?.playerBody) return;
        const pos = positionOverride ?? this.physics.playerBody.translation();
        const eyeHeight = this.physics?.eyeHeight ?? this.camera?.eyeHeight ?? 1.32;
        const feetOffset = this.physics?.feetOffset ?? 0.3;

        const cy = Math.cos(this.viewPitch);
        this._camHead.set(pos.x, pos.y + eyeHeight, pos.z);
        this._camLook.set(
            -Math.sin(this.viewYaw) * cy,
            Math.sin(this.viewPitch),
            -Math.cos(this.viewYaw) * cy
        );

        const shakeAmount = this.screenShake;
        const shakeX = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;
        const shakeY = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;
        const shakeZ = shakeAmount > 0 ? (Math.random() - 0.5) * shakeAmount : 0;

        const cameraMode = this.cameraModes[this.cameraModeIndex];

        if (cameraMode === 'FIRST_PERSON') {
            this.playerVisual.visible = false;
            this.camera.instance.position.set(
                this._camHead.x + shakeX,
                this._camHead.y + shakeY,
                this._camHead.z + shakeZ
            );
            this._camDesired.copy(this._camHead).add(this._camLook);
            this.camera.instance.lookAt(this._camDesired);
        } else {
            this.playerVisual.visible = true;
            this.playerVisual.position.set(pos.x, pos.y - feetOffset, pos.z);
            const isFront = cameraMode === 'THIRD_PERSON_FRONT';
            this.playerVisual.rotation.y = isFront ? this.viewYaw : (this.viewYaw + Math.PI);

            const distance = isFront ? 3.8 : -4.2;
            const yOff = isFront ? 0.3 : 1.1;
            this._camDesired.copy(this._camHead)
                .addScaledVector(this._camLook, distance);
            this._camDesired.x += shakeX;
            this._camDesired.y += yOff + shakeY;
            this._camDesired.z += shakeZ;
            this.camera.instance.position.lerp(this._camDesired, 0.4);
            this.camera.instance.lookAt(this._camHead);
        }
    }

    updateZoneMeter(influence) {
        const v = influence?.virus ?? 0;
        const a = influence?.arlo ?? 0;

        // Cache DOM refs once
        if (!this._zoneDom) {
            this._zoneDom = {
                meter: document.getElementById('zone-meter'),
                fillV: document.getElementById('zone-fill-virus'),
                fillA: document.getElementById('zone-fill-arlo'),
                status: document.getElementById('zone-status')
            };
            this._zoneLastV = -1;
            this._zoneLastA = -1;
            this._zoneLastCls = '';
        }
        const dom = this._zoneDom;
        if (!dom.meter) return;

        // Only update DOM when values change meaningfully (>0.5%)
        const vRound = Math.round(v * 200);
        const aRound = Math.round(a * 200);
        if (vRound !== this._zoneLastV || aRound !== this._zoneLastA) {
            this._zoneLastV = vRound;
            this._zoneLastA = aRound;
            if (dom.fillV) dom.fillV.style.width = `${(v * 100).toFixed(0)}%`;
            if (dom.fillA) dom.fillA.style.width = `${(a * 100).toFixed(0)}%`;
        }

        let label = 'NEUTRAL';
        let cls = '';
        if (v > 0.5) { label = 'CORRUPTED'; cls = 'zone-corrupted'; }
        else if (v > 0.15) { label = 'TAINTED'; cls = 'zone-tainted'; }
        else if (a > 0.4) { label = 'RESTORED'; cls = 'zone-restored'; }
        else if (a > 0.1) { label = 'CLEANSING'; cls = 'zone-cleansing'; }

        if (cls !== this._zoneLastCls) {
            this._zoneLastCls = cls;
            dom.meter.className = cls;
            if (dom.status) dom.status.textContent = label;
        }
    }

    updateDebugOverlay(delta) {
        this.debugAccumulator += delta;
        if (this.debugAccumulator < 0.2) return;
        this.debugAccumulator = 0;
        this.debugFps = Math.round(1 / Math.max(delta, 0.001));
        if (!this.debugVisible) return;

        const el = document.getElementById('debug-overlay');
        if (!el) return;
        const playerPos = this.getPlayerPosition();
        const chunkX = this.world.getChunkCoord(playerPos.x);
        const chunkZ = this.world.getChunkCoord(playerPos.z);
        const biomeId = this.world.getBiomeIdAt(playerPos.x, playerPos.z);
        const cameraMode = this.cameraModes[this.cameraModeIndex];
        const renderInfo = this.renderer.instance.info.render;
        el.textContent = [
            `ArloCraft ${this.debugFps} fps`,
            `XYZ: ${playerPos.x.toFixed(2)} / ${playerPos.y.toFixed(2)} / ${playerPos.z.toFixed(2)}`,
            `Chunk: ${chunkX}, ${chunkZ} | Loaded chunks: ${this.world.chunks.size}`,
            `Biome: ${biomeId}`,
            `Blocks: ${this.world.objects.length} | Entities: ${this.entities.entities.length}`,
            `Draw: ${renderInfo.calls} | Triangles: ${renderInfo.triangles}`,
            `Timings ms | Phys ${this.profiler.physicsMs.toFixed(2)} | World ${this.profiler.worldMs.toFixed(2)} | UI ${this.profiler.uiMs.toFixed(2)} | Render ${this.profiler.renderMs.toFixed(2)}`,
            `Seed: ${this.world.seedString}`,
            `Mode: ${this.gameState.mode} | Camera: ${cameraMode} | Quality: ${this.qualityTier}`,
            `Paused: ${this.isPaused} | Started: ${this.hasStarted}`
        ].join('\n');
    }

    getRenderDistanceCapForTier(tier) {
        if (tier === 'low') return 2;
        if (tier === 'high') return 6;
        return 4;
    }

    getEffectiveRenderDistanceForTier(tier = this.qualityTier) {
        const requested = Math.max(2, Math.min(6, Number(this.settings?.renderDistance) || 2));
        const cap = this.getRenderDistanceCapForTier(tier);
        return Math.max(2, Math.min(cap, requested));
    }

    applyQualityTier(tier) {
        if (tier === this.qualityTier && this.qualityInitialized) return;
        this.qualityTier = tier;
        this.qualityInitialized = true;


        // Quality tier only controls render distance / camera far.
        // Pixel ratio is owned exclusively by the resolution slider so it
        // never gets overwritten by the auto-quality system.
        if (tier === 'low') {
            this.camera.instance.far = 72;
        } else if (tier === 'balanced') {
            this.camera.instance.far = 108;
        } else {
            this.camera.instance.far = 140;
        }
        this.world.setRenderDistance(this.getEffectiveRenderDistanceForTier(tier));
        this.camera.instance.updateProjectionMatrix();
        this.onResize();
    }

    updateDynamicQuality(delta) {
        if (!this.features.dynamicQualityAuto || !this.hasStarted) return;

        this.performanceSampler.frames += 1;
        this.performanceSampler.time += Math.max(0, delta);
        if (this.performanceSampler.time < 1.2) return;

        const fps = this.performanceSampler.frames / Math.max(0.001, this.performanceSampler.time);
        this.performanceSampler.frames = 0;
        this.performanceSampler.time = 0;

        const now = performance.now();
        if ((now - this.performanceSampler.lastAdjust) < 2600) return;

        const cap = this.settings.fpsCap === 999 ? 144 : (this.settings.fpsCap || 60);
        const lowThreshold = cap * 0.62;   // e.g. <37 for 60fps cap
        const highThreshold = cap * 0.92;  // e.g. >55 for 60fps cap

        // Quality tiers also drive resolution scale and render distance
        const AUTO_PROFILE = {
            low:      { resolution: 0.6, renderDist: 2 },
            balanced: { resolution: 0.85, renderDist: 3 },
            high:     { resolution: 1.0, renderDist: 4 }
        };

        let target = this.qualityTier;
        const idx = this.qualityOrder.indexOf(this.qualityTier);
        if (fps < lowThreshold && idx > 0) {
            target = this.qualityOrder[idx - 1];
        } else if (fps > highThreshold && idx < (this.qualityOrder.length - 1)) {
            target = this.qualityOrder[idx + 1];
        }

        if (target === this.qualityTier) return;
        this.applyQualityTier(target);

        const profile = AUTO_PROFILE[target];
        if (profile) {
            this.renderer.setResolutionScale(profile.resolution);
            this.settings.resolutionScale = profile.resolution;
            const resInput = document.getElementById('setting-resolution');
            const resLabel = document.getElementById('setting-resolution-value');
            if (resInput) resInput.value = profile.resolution;
            if (resLabel) resLabel.textContent = profile.resolution.toFixed(1) + 'x';
        }

        this.performanceSampler.lastAdjust = now;
        this.setStatus(`Auto: ${target.toUpperCase()} | ${Math.round(fps)} FPS | res ${((profile?.resolution || 1) * 100).toFixed(0)}% | rd ${this.getEffectiveRenderDistanceForTier(target)}`);
    }

    handlePrimaryAction(delta) {
        if (this.hand) this.hand.swing();
        const selectedItem = this.gameState.getSelectedItem();
        const attackProfile = this.entities.getAttackProfile(selectedItem);
        const hasEnemyTarget = this.entities.hasHostileTarget(this.camera.instance, attackProfile.range);
        if (hasEnemyTarget) {
            this.entities.attackFromCamera(this.camera.instance, selectedItem);
            this.world.resetMiningProgress();
            return;
        }

        const mined = this.world.mineBlockProgress(this.camera.instance, delta, selectedItem, this.gameState.mode);
        if (mined) {
            // Optional: Extra impact effect or sound
        }
    }

    cancelMining() {
        this.world.resetMiningProgress();
    }

    handleDigDown() {
        if (!this.hasStarted || this.isPaused) return;
        const pos = this.physics.playerBody.translation();
        this.world.digDownFrom(pos, this.gameState.mode);
    }

    pickBlock() {
        if (!this.hasStarted || this.isPaused) return;
        const hit = this.world.raycastBlocks?.(this.camera.instance, 6, false);
        if (!hit?.id) return;
        const id = this.world.getBlockPickId(hit.id);
        const blockName = this.world.getBlockData(id)?.name ?? id;
        const inv = this.gameState.inventory;
        // First check hotbar slots 0-8
        for (let i = 0; i < 9; i++) {
            if (inv[i]?.id === id) {
                this.gameState.setSlot(i);
                this.hud?.flashPrompt?.(`Selected: ${blockName}`, '#aaddff');
                return;
            }
        }
        // Creative: add block to selected slot
        if (this.gameState.mode === 'CREATIVE') {
            const slot = this.gameState.selectedSlot;
            inv[slot] = { id, count: 64, kind: 'block' };
            window.dispatchEvent(new CustomEvent('inventory-changed'));
            this.hud?.flashPrompt?.(`Picked: ${blockName}`, '#aaddff');
        }
    }

    tryEatFood() {
        return this.survival.tryEatFood(this.gameState.selectedSlot);
    }

    handleSecondaryAction() {
        const selected = this.gameState.getSelectedItem();
        if (selected && this.survival.isFoodItem(selected.id)) {
            this.tryEatFood();
            return;
        }

        if (this.world.interactBlock(this.camera.instance)) return;

        const selectedSlot = this.gameState.selectedSlot;
        const placed = this.world.placeBlock(this.camera.instance, selectedSlot);
        if (!placed) return;
        if (this.gameState.mode === 'CREATIVE') return;
        if (!selected || selected.kind !== 'block') return;

        selected.count = Math.max(0, selected.count - 1);
        if (selected.count === 0) this.gameState.inventory[selectedSlot] = null;
        window.dispatchEvent(new CustomEvent('inventory-changed'));
    }

    toggleGameMode() {
        const mode = this.gameState.mode === 'SURVIVAL' ? 'CREATIVE' : 'SURVIVAL';
        this.gameState.setMode(mode);
        this.physics.setMode(mode);
    }

    updateDayNight(delta) {
        this.dayNight.update(delta, () => this.getPlayerPosition());
    }

    updateSurvivalSystems(delta) {
        this.survival.update(delta);
    }

    animate(timestamp = 0) {
        requestAnimationFrame((ts) => this.animate(ts));

        // FPS cap
        const targetMs = 1000 / (this.settings.fpsCap || 60);
        const elapsed = timestamp - (this._lastFrameTs || 0);
        if (elapsed < targetMs - 1) return;
        this._lastFrameTs = timestamp - (elapsed % targetMs);

        if (this.framePanel) this.framePanel.begin();
        const delta = Math.min(this.clock.getDelta(), 0.1);
        const frameStart = performance.now();

        // Resume Safety: If we just came back from a long pause, 
        // skip world/chunk logic for 3 frames to let physics and positions settle.
        if (delta > 0.08) this.resumeGraceFrames = 3;
        if (this.resumeGraceFrames > 0) {
            this.resumeGraceFrames--;
            this.renderer.render(this.camera.instance);
            if (this.framePanel) this.framePanel.end();
            return;
        }

        let playerPos = this.getPlayerPosition();
        const canSimulate = this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen;
        const shouldRunPassiveWorld = !canSimulate;
        let worldDelta = delta;
        let runWorldThisFrame = canSimulate;

        if (canSimulate) {
            this.touchControls?.tick();
            const physicsStart = performance.now();
            this.physics.update(delta, this.input, this.viewYaw);
            this.profiler.physicsMs = performance.now() - physicsStart;
            playerPos = this.getPlayerPosition();
            this.entities.update(delta);
            const worldStart = performance.now();
            this.world.update(playerPos, delta);
            this.profiler.worldMs = performance.now() - worldStart;
            runWorldThisFrame = false;
            this.updateSurvivalSystems(delta);
            this.animatePlayer(delta);
            this.updateDebugHUD(delta);

            if (this.input.mouseButtons.left) {
                this.handlePrimaryAction(delta);
            } else {
                this.cancelMining();
            }

            if (this.input.consumeRightClick()) {
                this.handleSecondaryAction();
            }
        } else {
            this.profiler.physicsMs = 0;
            this.idleWorldTick = (this.idleWorldTick + 1) % 120;
            if (!this.hasStarted) {
                runWorldThisFrame = (this.idleWorldTick % 24) === 0;
                worldDelta = 1 / 30;
            } else if (this.isPaused) {
                runWorldThisFrame = (this.idleWorldTick % 10) === 0;
                worldDelta = Math.min(1 / 20, delta * 3);
            } else {
                runWorldThisFrame = (this.idleWorldTick % 3) === 0;
                worldDelta = Math.min(1 / 24, delta * 2);
            }
            if (this.hasStarted) this.cancelMining();
        }

        if (runWorldThisFrame || (shouldRunPassiveWorld && this.world.pendingChunkLoads.length > 0)) {
            const worldStart = performance.now();
            this.world.update(playerPos, worldDelta);
            this.profiler.worldMs = performance.now() - worldStart;
        } else if (!canSimulate) {
            this.profiler.worldMs = 0;
        }

        const uiStart = performance.now();
        const playerVel = this.physics.velocity;
        const speed = Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z);
        const inWater = this.world.isPositionInWater(playerPos.x, playerPos.y, playerPos.z);
        const isGrounded = this.physics.isGrounded() && !inWater;
        
        if (isGrounded && speed > 0.1) {
            this.bobCycle = (this.bobCycle || 0) + delta * 8.5;
        } else if (inWater) {
            this.bobCycle = (this.bobCycle || 0) + delta * 4;
        } else {
            this.bobCycle = THREE.MathUtils.lerp(this.bobCycle || 0, 0, delta * 3);
        }

        this.camera.instance.rotation.order = 'YXZ';
        this.camera.instance.rotation.set(this.viewPitch, this.viewYaw, 0);

        // FOV Effect — Minecraft-style zoom when sprinting
        const baseFov = this.settings?.fov ?? 75;
        const targetFov = this.physics.isSprinting ? baseFov + 13 : baseFov;
        if (Math.abs(this.camera.instance.fov - targetFov) > 0.1) {
            this.camera.instance.fov = THREE.MathUtils.lerp(this.camera.instance.fov, targetFov, delta * 8);
            this.camera.instance.updateProjectionMatrix();
        }

        const cameraMode = this.cameraModes[this.cameraModeIndex];
        if (cameraMode === 'FIRST_PERSON') {
            this.playerVisual.visible = false;
            this.camera.viewmodelGroup.visible = true;
            this.camera.update(
                playerPos,
                this.camera.instance.rotation,
                this.bobCycle,
                speed,
                this.physics?.eyeHeight ?? this.camera.eyeHeight
            );
        } else {
            this.camera.viewmodelGroup.visible = false;
            this.updateCameraFromPlayer(playerPos);
        }
        this.updateUnderwaterState();
        this.hand.update(delta, this.bobCycle, speed > 0.1);
        
        // Sync hand item
        const selected = this.gameState.getSelectedItem();
        const selectedId = selected?.id;
        if (this.hand.lastHeldId !== selectedId) {
            try {
                this.hand.setHeldItem(selectedId, this.world.blockRegistry, selected);
            } catch (error) {
                console.warn('[ArloCraft] Failed to update held item viewmodel:', error);
            }
            this.hand.lastHeldId = selectedId;
        }

        const areaInfluence = this.world.getAreaInfluence(playerPos);
        this.renderer.setAreaInfluence(areaInfluence);
        this.updateZoneMeter(areaInfluence);

        this.updateDayNight(delta);
        this.updateDebugOverlay(delta);
        this.hud.updateCoordinates(playerPos, this.viewYaw, this.world);
        
        // Smelting Logic
        this.smeltTimer = (this.smeltTimer || 0) + delta;
        if (this.smeltTimer > 3.0) {
            this.processSmelting();
            this.smeltTimer = 0;
        }

        this.minimap.update(delta, playerPos, this.viewYaw);
        this.screenShake = Math.max(0, this.screenShake - (delta * 0.22));
        this.profiler.uiMs = performance.now() - uiStart;

        const renderStart = performance.now();
        this.renderer.render(this.camera.instance);
        this.profiler.renderMs = performance.now() - renderStart;
        this.updateDynamicQuality(delta);
        this.input.clearTransientInputs();

        const total = performance.now() - frameStart;
        if (total < 0) {
            this.profiler.physicsMs = 0;
            this.profiler.worldMs = 0;
            this.profiler.uiMs = 0;
            this.profiler.renderMs = 0;
        }
        if (this.framePanel) this.framePanel.end();
    }

    updateUnderwaterState() {
        const camPos = this.camera.instance.position;
        const submerged = this.world.isPositionInWater(camPos.x, camPos.y, camPos.z);
        
        const overlay = document.getElementById('underwater-light');
        if (overlay) {
            if (submerged) overlay.classList.add('submerged');
            else overlay.classList.remove('submerged');
        }
        this.renderer.setUnderwaterState(submerged);
    }

    processSmelting() {
        if (!this.gameState?.inventory) return;
        const inv = this.gameState.inventory;
        const coalIdx = inv.findIndex(item => item?.id === 'coal');
        if (coalIdx === -1) return;

        const recipes = {
            'iron_ore': 'iron_ingot',
            'gold_ore': 'gold_ingot',
            'mythril_ore': 'mythril_ingot'
        };

        for (let i = 0; i < inv.length; i++) {
            const item = inv[i];
            if (item && recipes[item.id]) {
                const result = recipes[item.id];
                console.log(`Smelted ${item.id} into ${result}!`);
                inv[i].count--;
                if (inv[i].count <= 0) inv[i] = null;
                
                inv[coalIdx].count--;
                if (inv[coalIdx].count <= 0) inv[coalIdx] = null;
                
                this.gameState.addBlockToInventory(result, 1);
                break;
            }
        }
    }

    interactWithNPC() {
        if (!this.entities) return;
        const pos = this.physics?.position ?? this.getPlayerPosition();
        const talked = this.entities.interactNearbyEntity?.(pos, 4);
        if (talked) {
            this.screenShake = Math.max(this.screenShake, 0.02);
        }
    }

    setupSkinListeners() {
        const btn = document.getElementById('btn-update-skin');
        const input = document.getElementById('setting-player-skin');
        if (!btn || !input) return;
        btn.onclick = () => {
            const user = input.value.trim();
            if (!user) return;
            btn.textContent = '...';
            this.updatePlayerSkin(user).finally(() => btn.textContent = 'Apply');
        };
        if (this.settings.skinUsername) {
            input.value = this.settings.skinUsername;
            this.updatePlayerSkin(this.settings.skinUsername);
        }
    }

    async updatePlayerSkin(username) {
        try {
            if (!this.skinLoader) throw new Error('skinLoader not initialized');
            const { materials } = await this.skinLoader.loadSkin(username);
            if (this.playerParts) {
                this.playerParts.head.material = materials.head;
                materials.head.forEach(m => { m.needsUpdate = true; });
                this.playerParts.torso.material = materials.torso;
                materials.torso.forEach(m => { m.needsUpdate = true; });
                this.playerParts.armL.material = materials.armL;
                materials.armL.forEach(m => { m.needsUpdate = true; });
                this.playerParts.armR.material = materials.armR;
                materials.armR.forEach(m => { m.needsUpdate = true; });
                this.playerParts.legL.material = materials.legL;
                materials.legL.forEach(m => { m.needsUpdate = true; });
                this.playerParts.legR.material = materials.legR;
                materials.legR.forEach(m => { m.needsUpdate = true; });
                if (this.playerParts.face) this.playerParts.face.visible = false;
            }
            if (this.hand) this.hand.updateArmSkin(materials.armR);
            const h = document.getElementById('arlo-face-image');
            if (h) {
                // If we have local materials (offline or custom), use the head front face
                if (materials.head && materials.head[4]?.map?.image) {
                    h.src = materials.head[4].map.image.toDataURL();
                } else if (username) {
                    h.src = `https://crafatar.com/avatars/${username}?size=64&overlay`;
                }
            }
            this.settings.skinUsername = username;
            this.saveSettings();
        } catch (e) { console.error('[ArloCraft] Skin Error:', e); }
    }

    animatePlayer(delta) {
        if (!this.playerParts) return;
        const speed = Math.sqrt(this.physics.velocity.x ** 2 + this.physics.velocity.z ** 2);
        if (speed > 0.05) {
            const a = Math.sin(this.bobCycle || 0) * 0.45;
            this.playerParts.legR.rotation.x = a;
            this.playerParts.legL.rotation.x = -a;
            this.playerParts.armR.rotation.x = -a * 1.1;
            this.playerParts.armL.rotation.x = a * 1.1;
            this.bobCycle = (this.bobCycle || 0) + delta * 15;
        } else {
            this.bobCycle = THREE.MathUtils.lerp(this.bobCycle || 0, 0, delta * 3);
        }
    }

    initDebugOverlay() {
        let overlay = document.getElementById('debug-overlay');
        if (!overlay) {
            overlay = document.createElement('pre');
            overlay.id = 'debug-overlay';
            document.body.appendChild(overlay);
        }
        overlay.style.cssText = 'position:fixed;top:96px;left:24px;z-index:100000;background:rgba(0,0,0,0.6);color:#0f0;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);pointer-events:none;font-family:monospace;font-size:12px;display:none;';
        this.debugOverlay = overlay;
    }

    updateDebugHUD(delta) {
        if (!this.debugVisible) return;
        const overlay = this.debugOverlay || document.getElementById('debug-overlay');
        if (overlay) {
            const fps = Math.round(1 / Math.max(0.001, delta));
            const pos = this.physics.position;
            overlay.textContent = `FPS: ${fps} | POS: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`;
        }
    }
}
