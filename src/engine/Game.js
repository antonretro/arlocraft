import * as THREE from 'three';
import { EngineBootstrap } from './EngineBootstrap.js';
import { SimulationManager } from './SimulationManager.js';

export class Game {
  constructor() {
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.pitchLimit = Math.PI / 2 - 0.0001;
    this.cameraModes = ['FIRST_PERSON', 'THIRD_PERSON_BACK', 'THIRD_PERSON_FRONT'];
    this.cameraModeIndex = 0;

    this.debugVisible = false;
    this.hasStarted = false;
    this.isPaused = false;

    this.performanceSampler = { frames: 0, time: 0, lastAdjust: 0 };
    this.qualityTier = 'balanced';
    this.qualityOrder = ['low', 'balanced', 'high'];
    this._lastMultiplayerPositionSyncAt = 0;

    this._camHead = new THREE.Vector3();
    this._camLook = new THREE.Vector3();
    this.lastKnownPosition = new THREE.Vector3(0, 70, 0);

    this.handlers = {};

    // Initial Legacy Bridge
    this._currentScreen = 'loading';
    this.ui = {
      setMenuScreen: (s) => {
        this._currentScreen = s;
        window.dispatchEvent(new CustomEvent('ui-set-screen', { detail: s }));
      },
      getCurrentScreen: () => this._currentScreen,
      setStatus: (m) => console.log(`[UI] ${m}`),
      showHUD: (v) => window.dispatchEvent(new CustomEvent('ui-set-hud', { detail: v })),
      renderWorldList: () => {},
      showTitle: (v) => this.ui.setMenuScreen(v ? 'title' : 'ingame'),
      showSettings: (v) => this.ui.setMenuScreen(v ? 'settings' : (this.hasStarted ? 'pause' : 'title')),
    };

    // Bootstrap initialized in init()
    this.simulation = new SimulationManager(this);

    this.init().catch(e => console.error('[ArloCraft] Init Failure:', e));
  }

  saveSettings() {
    this.settingsManager.save();
  }

  isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  applyMobilePresetIfNeeded() {
    if (!this.isTouchDevice() || this.settings.mobilePresetApplied) return;

    this.settings.qualityTierPref = 'low';
    this.settings.renderDistance = Math.min(
      2,
      Number(this.settings.renderDistance) || 2
    );
    this.settings.resolutionScale = Math.min(
      0.65,
      Number(this.settings.resolutionScale) || 0.65
    );
    this.settings.fpsCap = 60;
    this.settings.shadowsEnabled = false;
    this.settings.autoQuality = true;
    this.settings.chunkRebuildBudget = Math.min(
      3,
      Number(this.settings.chunkRebuildBudget) || 3
    );
    this.settings.mobilePresetApplied = true;
    this.saveSettings();
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

    const ok = window.confirm(
      `Delete ${slotId.toUpperCase()}? This cannot be undone.`
    );
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
    this.renderer.setVisible(true);
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
    this.particles?.clear();
    this.gameState.hp = 20;
    this.gameState.hunger = 20;
    this.gameState.inventory = Array(36).fill(null);
    this.gameState.offhand = null;
    this.gameState.craftingGrid = Array(9).fill(null);

    if (this.physics.isReady) {
      this.physics.resetPlayer(0, 160, 0);
    }

    this.hasStarted = true;
    this.isPaused = false;
    this.showTitle(false);
    this.showPause(false);
    this.ui.showHUD(true);
    this.touchControls
      ? this.touchControls.show(true)
      : this.input.setPointerLock();
    this.helpPanel.setState('playing');

    if (this.multiplayer && !this.multiplayer.peer) {
      this.multiplayer.init();
    }

    window.dispatchEvent(new CustomEvent('inventory-changed'));
    window.dispatchEvent(new CustomEvent('offhand-changed', { detail: null }));
    window.dispatchEvent(
      new CustomEvent('hp-changed', { detail: this.gameState.hp })
    );
    window.dispatchEvent(
      new CustomEvent('hunger-changed', { detail: this.gameState.hunger })
    );
    this.audio.play('ui-click');
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
    this.ui.setMenuScreen(visible ? 'title' : 'ingame');
  }

  showPause(visible) {
    this.isPaused = visible;
    this.ui.setMenuScreen(visible ? 'pause' : 'ingame');
    window.dispatchEvent(new CustomEvent('ui-set-pause', { detail: visible }));
  }

  showSettings(visible) {
    this.ui.setMenuScreen(visible ? 'settings' : (this.hasStarted ? 'pause' : 'title'));
  }

  isSettingsOpen() {
    return this.ui.getCurrentScreen() === 'settings';
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
    this.ui.refreshTitleMenuState?.();
  }

  showLoadingScreen(statusText, subText) {
    this.ui.showLoadingScreen?.(statusText, subText);
  }

  hideLoadingScreen() {
    this.ui.hideLoadingScreen?.();
  }

  pauseGame() {
    if (!this.hasStarted || this.isPaused) return;
    this.isPaused = true;
    this.gameState.setPaused(true);
    this.cancelMining();
    this.showPause(true);
    this.ui.showHUD(false);
    
    if (this.world?.visuals) {
      this.world.visuals.updateHover?.(0, 0, 0, false);
      this.world.visuals.updatePlacement?.(0, 0, 0, false);
    }
    
    this.helpPanel?.setState?.('paused');
    this.touchControls?.show?.(false);
    
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }
  }

  resumeGame() {
    if (!this.hasStarted || !this.isPaused) return;
    this.isPaused = false;
    this.gameState.setPaused(false);
    this.showPause(false);
    this.showSettings(false);
    this.ui.showHUD(true);

    if (this.touchControls) {
      this.touchControls.show(true);
    } else if (!this.gameState.isInventoryOpen) {
      this.input.setPointerLock();
    }
    this.helpPanel.setState(
      this.gameState.isInventoryOpen ? 'inventory' : 'playing'
    );
  }

  togglePause() {
    if (!this.hasStarted) return;
    if (this.isSettingsOpen()) {
      this.showSettings(false);
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
      if (!this.isPaused && !this.gameState.isInventoryOpen)
        this.helpPanel.setState('playing');
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

    if (this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen) {
       this.pauseGame();
    }
  }

  setMenuMode(mode, playSound = true) {
    if (this._settingMode || this.gameState.mode === mode) return;
    this._settingMode = true;
    try {
      this.gameState.setMode(mode);
      this.physics.setMode(mode);
      this.selectedStartMode = mode;
      this.settings.preferredMode = mode;
      this.saveSettings();
      if (playSound) this.audio.play('ui-click');
    } finally {
      this._settingMode = false;
    }
  }

  returnToTitle() {
    this.renderer.setVisible(false);
    this.hasStarted = false;
    this.isPaused = false;
    this.gameState.setPaused(false);
    this.showPause(false);
    this.showSettings(false);
    this.showTitle(true);
    this.ui.showHUD(false);
    
    if (this.world?.visuals) {
      this.world.visuals.updateHover(0, 0, 0, false);
      this.world.visuals.updatePlacement(0, 0, 0, false);
    }
    this.cancelMining();
    
    this.helpPanel.setState('title');
    this.audio.play('ui-back');
  }

  handleTitleQuit() {
    if (
      window.confirm(
        'Quit to your browser? Unsaved progress in active sessions may be lost.'
      )
    ) {
      window.close();
      window.location.href = 'about:blank';
    }
  }

  randomizeSeed() {
    const seed = Math.floor(Math.random() * 90000000) + 10000000;
    this.world.setSeed(seed);
    const input = document.getElementById('seed-input');
    if (input) input.value = String(seed);
    this.audio.play('ui-click');
  }

  async init() {
    console.log('[ArloCraft] Engine Init...');
    await EngineBootstrap.init(this);
    this.applyMobilePresetIfNeeded();

    // Startup Configuration (now safe to access this.settings)
    this.selectedStartMode = this.settings.preferredMode === 'CREATIVE' ? 'CREATIVE' : 'SURVIVAL';
    this.selectedWorldSlot = this.settings.selectedWorldSlot ?? 'slot-1';

    this.setMenuMode(this.selectedStartMode, false);
    this.ui.setMenuScreen('title');

    await this.resourceManager.ready();
    await this.world.blockRegistry.preloadEssentialBlocks();
    await this.world.init();
    await this.physics.init();

    this.world.setRenderDistance(this.getEffectiveRenderDistanceForTier());
    this.applyQualityTier(this.settings.qualityTierPref ?? 'balanced');
    
    this.renderer.toggleShadows(this.settings.shadowsEnabled);
    this.renderer.setFogDensityScale(this.settings.fogDensityScale);
    this.renderer.setResolutionScale(this.settings.resolutionScale);
    
    this.hud.init();
    this.updatePlayerSkin(this.settings.skinUsername ?? '', { persist: false });
    
    if (this.features.touchControls && this.isTouchDevice()) {
      this.touchControls = new (await import('../ui/TouchControls.js')).TouchControls(this);
    }

    this.onResize();
    this.animate();
    
    this.handlers.onVisibilityChange = () => {
      if (document.hidden && this.hasStarted && !this.isPaused && !this.multiplayer?.isConnected()) {
        this.pauseGame();
      }
    };
    this.handlers.onBlur = () => {
      if (this.hasStarted && !this.isPaused && !this.multiplayer?.isConnected()) {
        this.pauseGame();
      }
    };
    this.handlers.onResize = () => this.onResize();

    document.addEventListener('visibilitychange', this.handlers.onVisibilityChange);
    window.addEventListener('blur', this.handlers.onBlur);
    window.addEventListener('resize', this.handlers.onResize);
    
    this.ui.setMenuScreen('title');
    this.helpPanel.setState('title');
  }

  animate(timestamp = 0) {
    if (this._destroyed) return;
    this._animationId = requestAnimationFrame((ts) => this.animate(ts));

    const targetMs = 1000 / (this.settings.fpsCap || 60);
    const elapsed = timestamp - (this._lastFrameTs || 0);
    if (elapsed < targetMs - 1) return;
    this._lastFrameTs = timestamp - (elapsed % targetMs);

    this.clock.update(timestamp);
    const delta = Math.min(this.clock.getDelta(), 0.1);
    
    this.profiler.update(this.renderer.instance);
    this.world.blockRegistry.updateShaderMaterials(this.clock.getElapsed());

    const canSimulate = this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen;
    this.input.update();

    if (canSimulate) {
      if (this.touchControls) this.touchControls.tick();
      this.physics.update(delta, this.input, this.viewYaw);
      this.actionSystem.update(delta);
    }

    this.simulation.update(delta);

    const playerPos = this.getPlayerPosition();
    const playerVel = this.physics.velocity;
    const speed = Math.sqrt(playerVel.x * playerVel.x + playerVel.z * playerVel.z);
    const inWater = this.world.isPositionInWater(
      playerPos.x,
      playerPos.y + this.physics.eyeHeight * 0.45,
      playerPos.z
    );
    const grounded = this.physics.isGrounded?.() ?? false;

    this.player.mesh.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.player.mesh.rotation.y = this.viewYaw + Math.PI;
    this.player.update(
      delta,
      playerVel,
      grounded,
      this.physics.isSprinting,
      inWater,
      this.viewPitch
    );

    if (
      canSimulate &&
      this.multiplayer?.isConnected?.() &&
      timestamp - this._lastMultiplayerPositionSyncAt >= 75
    ) {
      this.multiplayer.broadcastPosition(playerPos, {
        yaw: this.viewYaw,
        pitch: this.viewPitch,
      });
      this._lastMultiplayerPositionSyncAt = timestamp;
    }
    
    this.updateCameraRotation();

    const cameraMode = this.cameraModes[this.cameraModeIndex];
    if (cameraMode === 'FIRST_PERSON') {
      this.player.setVisible(false);
      this.camera.update(delta, playerPos, this.camera.instance.rotation, this.player.bobCycle, speed, this.physics.isSprinting, this.settings?.fov ?? 75, this.physics.eyeHeight);
    } else {
      this.player.setVisible(true);
      this.camera.updateThirdPerson(delta, playerPos, this.viewYaw, this.viewPitch, cameraMode === 'THIRD_PERSON_FRONT' ? -4 : 4);
    }

    this.hand.update(delta, this.player.bobCycle, speed > 0.1);

    const selected = this.gameState.getSelectedItem();
    if (this.hand.lastHeldId !== selected?.id) {
      this.hand.setHeldItem(selected?.id, this.world.blockRegistry, selected);
      this.hand.lastHeldId = selected?.id;
    }

    this.profiler.begin('render');
    this.renderer.render(this.camera.instance);
    this.profiler.end('render');
    this.input.clearTransientInputs();
  }

  updateCameraRotation() {
    this.camera.instance.rotation.set(this.viewPitch, this.viewYaw, 0);
  }

  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.instance.aspect = window.innerWidth / window.innerHeight;
    this.camera.instance.updateProjectionMatrix();
  }

  getPlayerPosition() {
    if (!this.physics?.playerBody) return this.lastKnownPosition;
    const pos = this.physics.playerBody.translation();
    if (this.hasStarted && pos.x === 0 && pos.y === 0 && pos.z === 0) return this.lastKnownPosition;
    this.lastKnownPosition.set(pos.x, pos.y, pos.z);
    return this.lastKnownPosition;
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
    const shouldBeVisible = this.hasStarted && !this.isPaused && !this.gameState.isInventoryOpen && this.cameraModeIndex !== 2;
    crosshair.classList.toggle('active', shouldBeVisible);
  }

  toggleDebugOverlay() {
    this.profiler.toggle();
    this.debugVisible = this.profiler.visible;
    this.audio?.play('ui-click');
  }

  applyQualityTier(tier) {
    this.qualityTier = tier;
    this.camera.instance.far = tier === 'low' ? 72 : (tier === 'balanced' ? 108 : 140);
    this.world.setRenderDistance(this.getEffectiveRenderDistanceForTier(tier));
    this.renderer.setQualityTier?.(tier);
    if (this.world?.config) {
      this.world.config.qualityTier = tier;
    }
    this.camera.instance.updateProjectionMatrix();
  }

  getEffectiveRenderDistanceForTier(tier = this.qualityTier) {
    const requested = Math.max(2, Math.min(6, Number(this.settings?.renderDistance) || 3));
    const cap = tier === 'low' ? 2 : (tier === 'high' ? 6 : 4);
    return Math.max(2, Math.min(cap, requested));
  }

  cancelMining() { 
    if (this.world?.resetMiningProgress) this.world.resetMiningProgress(); 
  }
  
  resetEntities() { 
    this.entities?.reset(); 
  }

  updateZoneMeter(influence) {
    window.dispatchEvent(new CustomEvent('ui-zone-update', { detail: influence }));
  }

  updateDebugOverlay(delta) {
    if (this.debugVisible && this.profiler) {
      this.profiler.update(this.renderer?.instance);
    }
  }

  toggleGameMode() {
    const nextMode = this.gameState.mode === 'SURVIVAL' ? 'CREATIVE' : 'SURVIVAL';
    this.setMenuMode(nextMode);
  }

  toggleMinimap() {
    this.settings.minimapEnabled = !this.settings.minimapEnabled;
    this.saveSettings();
    window.dispatchEvent(new CustomEvent('ui-set-minimap', { detail: this.settings.minimapEnabled }));
    this.audio.play('ui-click');
  }

  pickBlock() {
    const hover = this.world.visuals?.hoverPos;
    if (!hover) return;
    const blockId = this.world.getBlock(hover.x, hover.y, hover.z);
    if (blockId > 0) {
      this.gameState.pickBlock(blockId);
      this.audio.play('ui-click');
    }
  }

  toggleOffhandFromSelected() {
    this.gameState.toggleOffhandFromSelected();
    this.audio.play('ui-click');
  }

  async updatePlayerSkin(username, options = {}) {
    try {
      const normalized = String(username || 'Steve').trim();
      const { materials } = await this.skinLoader.loadSkin(normalized);
      this._applyLoadedSkin(materials);
      const base = import.meta.env.BASE_URL || '/';
      const assetPath = base.endsWith('/') ? base + 'assets/' : base + '/assets/';
      window.dispatchEvent(
        new CustomEvent('skin-updated', {
          detail: {
            skinId: normalized === 'Steve' ? 'classic_steve' : `custom_${normalized}`,
            avatarUrl:
              normalized === 'Steve'
                ? assetPath + 'steve.png'
                : normalized === 'Alex'
                  ? assetPath + 'alex.png'
                  : `https://minotar.net/helm/${normalized}/64`,
            name: normalized,
          },
        })
      );
      if (options.persist !== false) {
        this.settings.skinUsername = normalized;
        this.saveSettings();
      }
    } catch (e) { console.error('[ArloCraft] Skin Error:', e); }
  }

  _applyLoadedSkin(materials) {
    this.player.applySkin(materials);
    if (this.hand) this.hand.updateArmSkin(materials.armR);
  }

  shakeCamera(intensity, duration = 0.5, frequency = 12) { 
    this.camera?.shake?.(intensity, duration, frequency); 
  }

  cancelMining() {
    this.world.resetMiningProgress();
  }

  dispose() {
    this._destroyed = true;
    if (this._animationId) cancelAnimationFrame(this._animationId);

    document.removeEventListener('visibilitychange', this.handlers.onVisibilityChange);
    window.removeEventListener('blur', this.handlers.onBlur);
    window.removeEventListener('resize', this.handlers.onResize);

    if (this.input?.dispose) this.input.dispose();
    if (this.multiplayer?.dispose) this.multiplayer.dispose();
    if (this.entities?.reset) this.entities.reset();
    if (this.particles?.clear) this.particles.clear();
    if (this.world?.dispose) this.world.dispose();
    if (this.renderer?.dispose) this.renderer.dispose();
    if (this.camera?.dispose) this.camera.dispose();
  }
}
