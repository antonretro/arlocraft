import * as THREE from 'three';
import StatsPanel from 'stats.js';
import { migrateInventoryItem } from '../data/blockMigrations.js';
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
import { SkinLoader } from '../utils/SkinLoader.js';
import { NotificationSystem } from './NotificationSystem.js';
import { VERSIONS } from '../data/versions.js';
import { SettingsManager } from './SettingsManager.js';
import { SaveSystem } from './SaveSystem.js';
import { WorldSlotManager } from './WorldSlotManager.js';
import { UpdateChecker } from './UpdateChecker.js';
import { GameUI } from './GameUI.js';
import { SkinSystem } from './SkinSystem.js';

const LOCAL_APP_VERSION = 'v1.0';
const GITHUB_REPO_OWNER = 'antonretro';
const GITHUB_REPO_NAME = 'antoncraft';

export class Game {
    constructor() {
        console.log('[AntonCraft] Game constructor starting...');

        this.settingsManager = new SettingsManager();
        this.settings = this.settingsManager.getAll();

        this.saveSystem = new SaveSystem(this);
        this.worldSlots = new WorldSlotManager(this.saveSystem);
        this.skinSystem = new SkinSystem();
        this.ui = new GameUI(this);
        this.updateChecker = new UpdateChecker('antonretro', 'antoncraft');

        this.selectedStartMode = this.settings.preferredMode === 'CREATIVE' ? 'CREATIVE' : 'SURVIVAL';
        this.selectedWorldSlot = this.settings.selectedWorldSlot ?? 'slot-1';

        this.performanceSampler = { frames: 0, time: 0, lastAdjust: 0 };
        this.qualityTier = 'balanced';
        this.qualityInitialized = false;
        this.qualityOrder = ['low', 'balanced', 'high'];

        this.viewYaw = 0;
        this.viewPitch = 0;
        this.pitchLimit = Math.PI / 2 - 0.0001;
        this.cameraModes = ['FIRST_PERSON', 'THIRD_PERSON_BACK', 'THIRD_PERSON_FRONT'];
        this.cameraModeIndex = 0;

        this.debugVisible = false;
        this.debugAccumulator = 0;
        this.debugFps = 0;
        this.screenShake = 0;
        this.shakeFrequency = 12;
        this.shakeDecay = 4.2;
        this.framePanel = null;

        this.hasStarted = false;
        this.isPaused = false;

        this._camHead = new THREE.Vector3();
        this._camLook = new THREE.Vector3();
        this._camDesired = new THREE.Vector3();
        this.lastKnownPosition = new THREE.Vector3(0, 70, 0);

        this.gameState = new GameState();
        this.stats = new Stats();
        this.gameState.stats = this.stats;

        this.renderer = new Renderer(this.settings.graphicsAPI);
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
        this.dayNight = new DayNightSystem(this.renderer, this.world, this.features ?? {});
        this.helpPanel = new HelpPanel();
        this.minimap = new MiniMap(this);
        this.audio = new AudioSystem();
        this.audio.applyFromSettings(this.settings);
        this.audio.installAutoUnlock(document);
        this.skinLoader = new SkinLoader();

        this.currentVersionId = 'v1.1';
        this.features = { ...FEATURES };
        this.notifications = new NotificationSystem();

        this.profiler = { physicsMs: 0, worldMs: 0, uiMs: 0, renderMs: 0 };
        this.clock = new THREE.Timer();
        this.bindEvents();
        this.setupUI();
        this.setupSkinListeners();

        this.init().catch(e => {
            console.error('[AntonCraft] Init Failure:', e);
        });
    }

    setupUI() {
        const seedInput = document.getElementById('seed-input');
        if (seedInput) seedInput.value = this.world.seedString;

        this.ui.bindAll();

        this.setMenuMode(this.selectedStartMode, false);
        this.world.setRenderDistance(
            this.getEffectiveRenderDistanceForTier(this.settings.qualityTierPref ?? this.qualityTier)
        );

        this.ui.renderWorldList();
        this.ui.setMenuScreen('title');
        
        // Final polish for startup presentation
        if (this.hud && this.hud.core) {
            this.hud.core.loadFaceData(); 
        }
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

        const headGroup = new THREE.Group();
        headGroup.position.set(0, 1.72, 0);
        
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), bodyMaterial);
        head.position.set(0, 0, 0); // Local to headGroup
        headGroup.add(head);

        const facePath = 'anton_real.png';
        const faceTexture = new THREE.TextureLoader().load(facePath);
        faceTexture.magFilter = THREE.NearestFilter;
        faceTexture.minFilter = THREE.NearestFilter;
        const facePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.56, 0.56),
            new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
        );
        facePlane.position.set(0, 0, 0.322); // Local to headGroup
        headGroup.add(facePlane);
        
        group.add(headGroup);

        group.visible = false;
        this.playerVisual = group;
        this.playerParts = { torso, head, headGroup, armL, armR, legL, legR, face: facePlane };
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

    saveSettings() {
        this.settingsManager.save();
    }

    selectWorldSlot(slotId) {
        if (!this.worldSlots.getAll().includes(slotId)) return;

        this.selectedWorldSlot = slotId;
        this.settings.selectedWorldSlot = slotId;
        this.settingsManager.save();
        this.ui.renderWorldList();
    }

    deleteWorldSlot(slotId = this.selectedWorldSlot) {
        const summary = this.worldSlots.getSummary(slotId);

        if (!summary?.exists) {
            this.ui.setStatus(`No save in ${slotId.toUpperCase()} to delete.`, true);
            return false;
        }

        const ok = window.confirm(`Delete ${slotId.toUpperCase()}? This cannot be undone.`);
        if (!ok) return false;

        this.worldSlots.delete(slotId);
        this.ui.renderWorldList();
        this.ui.setStatus(`Deleted ${slotId.toUpperCase()}.`);
        return true;
    }

    saveWorldLocal(slotId = this.selectedWorldSlot) {
        this.saveSystem.saveToSlot(slotId);
        this.ui.renderWorldList();
        this.ui.setStatus(`World saved to ${slotId.toUpperCase()}.`);
    }

    loadWorldLocal(slotId = this.selectedWorldSlot, options = {}) {
        try {
            const loaded = this.saveSystem.loadFromSlot(slotId);
            if (!loaded) {
                if (!options.silent) {
                    this.ui.setStatus(`No save in ${slotId.toUpperCase()}.`, true);
                }
                return false;
            }

            this.ui.renderWorldList();

            if (!options.silent) {
                this.ui.setStatus(`Loaded ${slotId.toUpperCase()}.`);
            }

            return true;
        } catch {
            if (!options.silent) {
                this.ui.setStatus(`Failed to load ${slotId.toUpperCase()}.`, true);
            }
            return false;
        }
    }

    startGame({ skipSeedApply = false, preserveCurrentMode = false } = {}) {
        this.renderer.setVisible(true); // Show 3D world as we start generating/loading
        if (!skipSeedApply) {
            const seedInput = document.getElementById('seed-input');
            if (seedInput?.value.trim()) this.world.setSeed(seedInput.value.trim());
        }

        if (!preserveCurrentMode) {
            this.physics.setMode(this.selectedStartMode);
            this.gameState.setMode(this.selectedStartMode);
        }

        this.world.clearWorld();
        this.resetEntities();
        this.gameState.hp = 20;
        this.gameState.hunger = 20;
        this.gameState.inventory = Array(36).fill(null);
        this.gameState.offhand = null;
        this.gameState.craftingGrid = Array(9).fill(null);

        const spawn = this.world.getSafeSpawnPoint(0, 0, 40);
        if (this.physics.isReady) {
            this.physics.playerBody.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
            this.physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }

        this.hasStarted = true;
        this.isPaused = false;
        this.showTitle(false);
        this.showPause(false);
        this.ui.showHUD(true);
        this.touchControls ? this.touchControls.show(true) : this.input.setPointerLock();
        this.helpPanel.setState('playing');

        window.dispatchEvent(new CustomEvent('inventory-changed'));
        window.dispatchEvent(new CustomEvent('offhand-changed', { detail: null }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.gameState.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.gameState.hunger }));
        this.audio.play('ui-click');
    }

    getSaveData() {
        const pos = this.getPlayerPosition();
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            world: this.world.serialize(),
            player: {
                position: { x: pos.x, y: pos.y, z: pos.z },
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
        if (!data?.world) throw new Error('Invalid save');
        this.world.loadFromData(data.world);
        this.resetEntities();

        const seedInput = document.getElementById('seed-input');
        if (seedInput) seedInput.value = this.world.seedString;

        if (Array.isArray(data.inventory)) {
            this.gameState.inventory = data.inventory.slice(0, 36).map(migrateInventoryItem);
            while (this.gameState.inventory.length < 36) this.gameState.inventory.push(null);
        }
        this.gameState.offhand = migrateInventoryItem(data?.offhand ?? null);
        if (Array.isArray(data.craftingGrid)) {
            this.gameState.craftingGrid = data.craftingGrid.slice(0, 9).map(migrateInventoryItem);
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
            if (Number.isFinite(data.stats.level)) this.stats.level = data.stats.level;
            if (Number.isFinite(data.stats.xp)) this.stats.xp = data.stats.xp;
            if (Number.isFinite(data.stats.xpToNextLevel)) this.stats.xpToNextLevel = data.stats.xpToNextLevel;
            if (data.stats.attributes) this.stats.attributes = { ...this.stats.attributes, ...data.stats.attributes };
        }

        const px = data.player?.position?.x ?? 0;
        const py = data.player?.position?.y ?? 70;
        const pz = data.player?.position?.z ?? 0;
        if (this.physics.isReady) {
            this.physics.playerBody.setTranslation({ x: px, y: py, z: pz }, true);
            this.physics.playerBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            this.physics.setMode(this.gameState.mode);
            this.updateCameraFromPlayer();
        }

        this.hasStarted = true;
        this.isPaused = false;
        this.showTitle(false);
        this.showPause(false);
        this.ui.showHUD(true);
        this.touchControls ? this.touchControls.show(true) : this.input.setPointerLock();
        this.helpPanel.setState('playing');

        window.dispatchEvent(new CustomEvent('inventory-changed'));
        window.dispatchEvent(new CustomEvent('offhand-changed', { detail: this.gameState.offhand }));
        window.dispatchEvent(new CustomEvent('hp-changed', { detail: this.gameState.hp }));
        window.dispatchEvent(new CustomEvent('hunger-changed', { detail: this.gameState.hunger }));
        window.dispatchEvent(new CustomEvent('xp-changed', { detail: { xp: this.stats.xp, max: this.stats.xpToNextLevel } }));
    }

    initPerfPanel() {
        if (this.framePanel) return;
        try {
            const panel = new StatsPanel();
            panel.showPanel(0);
            panel.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;';
            document.body.appendChild(panel.dom);
            this.framePanel = panel;
            if (!this.settings.perfPanelVisible) panel.dom.style.display = 'none';
        } catch {
            this.framePanel = null;
        }
    }

    showTitle(visible) {
        this.ui.showTitle(visible);
    }

    showPause(visible) {
        this.ui.showPause(visible);
    }

    showSettings(visible) {
        this.ui.showSettings(visible);
    }

    isSettingsOpen() {
        return this.ui.isSettingsOpen();
    }

    setStatus(message, isError = false) {
        this.ui.setStatus(message, isError);
    }

    setMenuScreen(screen) {
        this.ui.setMenuScreen(screen);
    }

    renderWorldList() {
        this.ui.renderWorldList();
    }

    refreshTitleMenuState() {
        this.ui.refreshTitleMenuState();
    }

    showLoadingScreen(statusText, subText) {
        this.ui.showLoadingScreen(statusText, subText);
    }

    hideLoadingScreen() {
        this.ui.hideLoadingScreen();
    }

    pauseGame() {
        if (!this.hasStarted || this.isPaused) return;
        this.isPaused = true;
        this.gameState.setPaused(true);
        this.cancelMining();
        this.showPause(true);
        this.helpPanel.setState('paused');
        this.touchControls?.show(false);
        if (document.pointerLockElement) document.exitPointerLock();
    }

    resumeGame() {
        if (!this.hasStarted || !this.isPaused) return;
        this.isPaused = false;
        this.gameState.setPaused(false);
        this.showPause(false);
        this.showSettings(false);
        if (this.touchControls) {
            this.touchControls.show(true);
        } else if (!this.gameState.isInventoryOpen) {
            this.input.setPointerLock();
        }
        this.helpPanel.setState(this.gameState.isInventoryOpen ? 'inventory' : 'playing');
    }

    togglePause() {
        if (!this.hasStarted) return;
        if (this.ui.isSettingsOpen()) {
            this.ui.showSettings(false);
            this.showPause(true);
            return;
        }
        if (this.isPaused) this.resumeGame();
        else this.pauseGame();
    }

    toggleInventory() {
        if (!this.hasStarted || this.isPaused) return;
        this.gameState.toggleInventory();
        this.updateCrosshairVisibility();
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
        
        this.showPause(false);
        this.helpPanel.setState('playing');
    }

    setMenuMode(mode, playSound = true) {
        if (this._settingMode) return;
        this._settingMode = true;
        this.gameState.setMode(mode);
        this._settingMode = false;
        this.selectedStartMode = mode;
        this.settings.preferredMode = mode;
        this.saveSettings();
        if (playSound) this.audio.play('ui-click');
    }

    returnToTitle() {
        this.renderer.setVisible(false); // Hide 3D world again
        this.hasStarted = false;
        this.isPaused = false;
        this.gameState.setPaused(false);
        this.showPause(false);
        this.showSettings(false);
        this.showTitle(true);
        this.ui.showHUD(false);
        this.helpPanel.setState('title');
        this.audio.play('ui-back');
    }

    handleTitleQuit() {
        if (window.confirm('Quit to your browser? Unsaved progress in active sessions may be lost.')) {
            window.close();
            window.location.href = 'about:blank';
        }
    }

    randomizeSeed() {
        const seed = Math.random().toString(36).substring(2, 10);
        this.world.seedString = seed;
        const input = document.getElementById('seed-input');
        if (input) input.value = seed;
        this.audio.play('ui-click');
    }

    async init() {
        console.log("[AntonCraft] Starting engine init...");
        await this.physics.init();
        
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
        this.updatePlayerSkin();
        this.initPerfPanel();

        if (TouchControls.isTouchDevice()) {
            this.touchControls = new TouchControls(this);
        }

        this.onResize();
        this.animate();
        window.addEventListener('resize', () => this.onResize());

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
        this.updateCrosshairVisibility();
        this.audio.play('camera-toggle');
    }

    updateCrosshairVisibility() {
        const crosshair = document.getElementById('crosshair');
        if (!crosshair) return;
        
        // Hide crosshair in THIRD_PERSON_FRONT (facing player)
        const isFacingPlayer = this.cameraModeIndex === 2;
        const shouldBeVisible = this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen && !isFacingPlayer;
        
        if (shouldBeVisible) {
            crosshair.classList.add('active');
        } else {
            crosshair.classList.remove('active');
        }
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
            this.playerVisual.rotation.y = this.viewYaw + Math.PI;

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
        const a = influence?.anton ?? 0;

        // Cache DOM refs once
        if (!this._zoneDom) {
            this._zoneDom = {
                meter: document.getElementById('zone-meter'),
                fillV: document.getElementById('zone-fill-virus'),
                fillA: document.getElementById('zone-fill-anton'),
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
            `AntonCraft ${this.debugFps} fps`,
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

        // Bucket Pickup Logic
        if (selectedItem?.id === 'bucket') {
            if (this.input.consumeLeftClick()) {
                this.world.handleBucketAction(this.camera.instance, 'pickup');
            }
            return;
        }

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

    handleSecondaryAction() {
        const selected = this.gameState.getSelectedItem();
        if (!selected) return;

        // Bucket Place Logic
        if (selected.id === 'bucket' || selected.id === 'water_bucket' || selected.id === 'lava_bucket') {
            this.world.handleBucketAction(this.camera.instance, 'place', this.gameState.selectedSlot);
            return;
        }

        if (this.survival.isFoodItem(selected.id)) {
            this.tryEatFood();
            return;
        }

        if (this.world.interactBlock(this.camera.instance)) return;

        const selectedSlot = this.gameState.selectedSlot;
        const placed = this.world.placeBlock(this.camera.instance, selectedSlot);
        if (!placed) return;
        if (this.gameState.mode === 'CREATIVE') return;

        selected.count--;
        if (selected.count <= 0) {
            this.gameState.inventory[selectedSlot] = null;
        }
        window.dispatchEvent(new CustomEvent('inventory-changed'));
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

    updateSelection() {
        const hit = this.world.raycastBlocks?.(this.camera.instance, 6, false);
        if (hit) {
            this.world.visuals.updateHover(hit.cell.x, hit.cell.y, hit.cell.z, true);
            
            // Placement Ghost Logic
            const item = this.gameState.inventory[this.gameState.selectedSlot];
            if (item && item.kind === 'block') {
                const px = hit.previous?.x ?? hit.x;
                const py = hit.previous?.y ?? hit.y;
                const pz = hit.previous?.z ?? hit.z;
                this.world.visuals.updatePlacement(px, py, pz, true);
            } else {
                this.world.visuals.updatePlacement(0, 0, 0, false);
            }
        } else {
            this.world.visuals.updateHover(0, 0, 0, false);
            this.world.visuals.updatePlacement(0, 0, 0, false);
        }
    }

    tryEatFood() {
        return this.survival.tryEatFood(this.gameState.selectedSlot);
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
        this.clock.update(timestamp);
        const delta = Math.min(this.clock.getDelta(), 0.1);
        const frameStart = performance.now();

        // Resume Safety: If we just came back from a long pause, 
        // skip world/chunk logic for 3 frames to let physics and positions settle.
        if (delta > 0.08) this.resumeGraceFrames = 3;
        if (this.resumeGraceFrames > 0) {
            this.resumeGraceFrames--;
            this.world.blockRegistry.updateShaderMaterials(this.clock.getElapsed());
            this.renderer.render(this.camera.instance);
            if (this.framePanel) this.framePanel.end();
            return;
        }

        this.world.blockRegistry.updateShaderMaterials(this.clock.getElapsed());

        let playerPos = this.getPlayerPosition();
        const canSimulate = this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen;
        const shouldRunPassiveWorld = !canSimulate;
        let worldDelta = delta;
        let runWorldThisFrame = canSimulate;
        this.input.update();

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
            this.updateSelection();
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
                console.warn('[AntonCraft] Failed to update held item viewmodel:', error);
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
            const h = document.getElementById('anton-face-image');
            if (h) {
                // If we have local materials (offline or custom), use the head front face
                if (materials.head && materials.head[4]?.map?.image) {
                    h.src = materials.head[4].map.image.toDataURL();
                } else if (username) {
                    h.src = `https://crafatar.com/avatars/${username}?size=64&overlay`;
                } else {
                    h.src = 'faces/anton_happy.png';
                }
            }
            this.settings.skinUsername = username;
            this.saveSettings();
        } catch (e) { console.error('[AntonCraft] Skin Error:', e); }
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

        // Sync head tilt to view pitch
        if (this.playerParts.headGroup) {
            this.playerParts.headGroup.rotation.x = -this.viewPitch;
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
            const meshMs = (this._lastMeshMs || 0).toFixed(2);
            overlay.textContent = `FPS: ${fps} | POS: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} | MESH: ${meshMs}ms`;
        }
    }

    shakeCamera(intensity, duration = 0.5, frequency = 12) {
        this.screenShake = Math.max(this.screenShake, intensity);
        this.shakeDecay = intensity / duration;
        this.shakeFrequency = frequency;
    }
}
