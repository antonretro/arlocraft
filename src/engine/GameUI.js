export class GameUI {
    constructor(game) {
        this.game = game;
    }

    get(id) {
        return document.getElementById(id);
    }

    showTitle(visible) {
        const overlay = this.get('overlay');
        if (!overlay) return;
        overlay.style.display = visible ? 'flex' : 'none';
    }

    showHUD(visible) {
        const hud = this.get('hud');
        const minimap = this.get('minimap');
        if (hud) hud.style.display = visible ? 'flex' : 'none';
        if (minimap) minimap.style.display = visible ? 'block' : 'none';
    }

    showPause(visible) {
        const pause = this.get('pause-overlay');
        if (!pause) return;
        pause.style.display = visible ? 'flex' : 'none';
    }

    showSettings(visible) {
        const panel = this.get('settings-panel');
        if (!panel) return;
        panel.style.display = visible ? 'flex' : 'none';
    }

    isSettingsOpen() {
        const panel = this.get('settings-panel');
        return Boolean(panel && panel.style.display !== 'none');
    }

    setStatus(message, isError = false) {
        const status = this.get('settings-status');
        if (!status) return;
        status.textContent = message;
        status.style.color = isError ? '#ff7979' : '#d2ffd6';
    }

    setMenuScreen(screen) {
        const screenIds = [
            'screen-booting',
            'screen-title',
            'screen-world-select',
            'screen-world-create',
            'screen-loading'
        ];

        const nextId =
            screen === 'booting' ? 'screen-booting' :
            screen === 'world-select' ? 'screen-world-select' :
            screen === 'world-create' ? 'screen-world-create' :
            screen === 'loading' ? 'screen-loading' :
            'screen-title';

        for (const id of screenIds) {
            const node = this.get(id);
            if (!node) continue;
            node.classList.toggle('ni-screen-active', id === nextId);
        }
    }

    showLoadingScreen(statusText = 'Generating World...', subText = 'Building terrain and structures...') {
        const overlay = this.get('overlay');
        const status = this.get('loading-status');
        const sub = this.get('loading-subtext');
        const bar = this.get('loading-progress');

        if (overlay) overlay.style.display = 'flex';
        if (status) status.textContent = statusText;
        if (sub) sub.textContent = subText;
        if (bar) bar.style.width = '0%';

        this.setMenuScreen('loading');

        if (this._loadingInterval) clearInterval(this._loadingInterval);
        let pct = 0;
        this._loadingInterval = setInterval(() => {
            pct = Math.min(pct + Math.random() * 8, 90);
            if (bar) bar.style.width = `${pct}%`;
        }, 120);
    }

    hideLoadingScreen() {
        if (this._loadingInterval) {
            clearInterval(this._loadingInterval);
            this._loadingInterval = null;
        }

        const bar = this.get('loading-progress');
        if (bar) bar.style.width = '100%';

        setTimeout(() => this.setMenuScreen('title'), 350);
    }

    renderWorldList() {
        const list = this.get('world-list-container');
        if (!list) return;

        list.innerHTML = '';

        const slotLabel = this.get('create-slot-label');
        if (slotLabel) slotLabel.textContent = this.game.selectedWorldSlot.toUpperCase();

        const icons = ['???', '??', '???', '???', '??'];

        for (const [idx, slotId] of this.game.worldSlots.getAll().entries()) {
            const card = document.createElement('div');
            card.className = 'ni-world-card';

            if (slotId === this.game.selectedWorldSlot) {
                card.classList.add('active');
            }

            const summary = this.game.worldSlots.getSummary(slotId);
            const icon = icons[idx % icons.length];

            if (summary?.exists) {
                const when = summary.savedAt
                    ? new Date(summary.savedAt).toLocaleDateString()
                    : 'N/A';

                card.innerHTML = `
                    <div class="ni-world-card-icon">${icon}</div>
                    <div class="ni-world-name">${slotId.toUpperCase()}</div>
                    <div class="ni-world-meta">${summary.mode ?? 'SURVIVAL'} · Seed: ${summary.seed ?? 'unknown'}</div>
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

            card.addEventListener('click', () => {
                this.game.selectWorldSlot(slotId);
            });

            list.appendChild(card);
        }

        this.refreshTitleMenuState();
    }

    refreshTitleMenuState() {
        const summary = this.game.worldSlots.getSummary(this.game.selectedWorldSlot);
        const hasSave = Boolean(summary?.exists);

        const playBtn = this.get('btn-play-world');
        const deleteBtn = this.get('btn-delete-world');
        const createBtn = this.get('btn-start');

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

    bindMainMenu() {
        const btnStart = this.get('btn-start');
        const btnModeSurvival = this.get('btn-mode-survival');
        const btnModeCreative = this.get('btn-mode-creative');
        const btnRandomSeed = this.get('btn-title-random-seed');
        const btnToWorlds = this.get('btn-to-worlds');
        const btnToSettings = this.get('btn-to-settings');
        const btnTitleQuit = this.get('btn-title-quit');
        const btnPlayWorld = this.get('btn-play-world');
        const btnNewWorld = this.get('btn-new-world');
        const btnDeleteWorld = this.get('btn-delete-world');
        const btnWorldsBack = this.get('btn-worlds-back');
        const btnCreateBack = this.get('btn-create-back');

        if (btnStart) {
            btnStart.addEventListener('click', () => {
                const summary = this.game.worldSlots.getSummary(this.game.selectedWorldSlot);

                if (summary?.exists) {
                    const confirmed = window.confirm(
                        `${this.game.selectedWorldSlot.toUpperCase()} already has a world. Create a new one with this seed and overwrite it on next save?`
                    );
                    if (!confirmed) return;
                }

                this.game.startGame({
                    skipSeedApply: false,
                    preserveCurrentMode: false
                });
            });
        }

        if (btnModeSurvival) {
            btnModeSurvival.addEventListener('click', () => this.game.setMenuMode('SURVIVAL'));
        }

        if (btnModeCreative) {
            btnModeCreative.addEventListener('click', () => this.game.setMenuMode('CREATIVE'));
        }

        if (btnRandomSeed) {
            btnRandomSeed.addEventListener('click', () => this.game.randomizeSeed());
        }

        if (btnToWorlds) {
            btnToWorlds.addEventListener('click', () => {
                this.renderWorldList();
                this.setMenuScreen('world-select');
            });
        }

        if (btnWorldsBack) {
            btnWorldsBack.addEventListener('click', () => this.setMenuScreen('title'));
        }

        if (btnNewWorld) {
            btnNewWorld.addEventListener('click', () => {
                this.renderWorldList();
                this.setMenuScreen('world-create');
            });
        }

        if (btnCreateBack) {
            btnCreateBack.addEventListener('click', () => {
                this.renderWorldList();
                this.setMenuScreen('world-select');
            });
        }

        if (btnPlayWorld) {
            btnPlayWorld.addEventListener('click', () => {
                const loaded = this.game.loadWorldLocal(this.game.selectedWorldSlot);
                if (loaded) {
                    this.game.startGame({
                        skipSeedApply: true,
                        preserveCurrentMode: true
                    });
                } else {
                    this.setStatus(`No save in ${this.game.selectedWorldSlot.toUpperCase()}.`, true);
                    this.setMenuScreen('world-create');
                }
            });
        }

        if (btnDeleteWorld) {
            btnDeleteWorld.addEventListener('click', () => {
                this.game.deleteWorldSlot(this.game.selectedWorldSlot);
            });
        }

        if (btnToSettings) {
            btnToSettings.addEventListener('click', () => {
                this.showSettings(true);
                this.setStatus('Settings opened.');
            });
        }

        if (btnTitleQuit) {
            btnTitleQuit.addEventListener('click', () => this.game.handleTitleQuit());
        }
    }

    bindPauseMenu() {
        const btnResume = this.get('btn-resume');
        const btnPauseSettings = this.get('btn-pause-settings');
        const btnPauseSave = this.get('btn-pause-save');
        const btnPauseLoad = this.get('btn-pause-load');
        const btnBackTitle = this.get('btn-back-title');

        if (btnResume) btnResume.addEventListener('click', () => this.game.resumeGame());

        if (btnPauseSettings) {
            btnPauseSettings.addEventListener('click', () => {
                this.showPause(false);
                this.showSettings(true);
            });
        }

        if (btnPauseSave) {
            btnPauseSave.addEventListener('click', () => this.game.saveWorldLocal(this.game.selectedWorldSlot));
        }

        if (btnPauseLoad) {
            btnPauseLoad.addEventListener('click', () => this.game.loadWorldLocal(this.game.selectedWorldSlot));
        }

        if (btnBackTitle) {
            btnBackTitle.addEventListener('click', () => this.game.returnToTitle());
        }
    }

    bindSettingsMenu() {
        const btnClose = this.get('btn-settings-close');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.showSettings(false);
                if (this.game.isPaused) this.showPause(true);
            });
        }

        // --- Video & Controls ---
        this.bindSettingsControls();
        this.bindGraphicsControls();
        this.bindAudioControls();
        
        // --- System & Persistence ---
        const btnExport = this.get('btn-export-save');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                this.game.saveSystem.exportToFile();
                this.setStatus('World save exported.');
            });
        }

        const btnReset = this.get('btn-reset-settings');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const ok = window.confirm('Reset all settings to defaults?');
                if (ok) {
                    this.game.settings = this.game.settingsManager.reset();
                    this.setStatus('Settings reset to defaults.');
                    window.location.reload(); 
                }
            });
        }
    }

    bindSettingsControls() {
        const sensitivityInput = this.get('setting-sensitivity');
        const sensitivityLabel = this.get('setting-sensitivity-value');
        if (sensitivityInput) {
            sensitivityInput.value = String(this.game.settings.sensitivity);
            if (sensitivityLabel) sensitivityLabel.textContent = Number(this.game.settings.sensitivity).toFixed(4);
            sensitivityInput.addEventListener('input', () => {
                const value = Number(sensitivityInput.value);
                this.game.settings.sensitivity = value;
                this.game.settingsManager.save();
                if (sensitivityLabel) sensitivityLabel.textContent = value.toFixed(4);
            });
        }

        const fovInput = this.get('setting-fov');
        const fovLabel = this.get('setting-fov-value');
        if (fovInput) {
            fovInput.value = String(this.game.settings.fov);
            if (fovLabel) fovLabel.textContent = `${this.game.settings.fov} deg`;
            fovInput.addEventListener('input', () => {
                const value = Number(fovInput.value);
                this.game.settings.fov = value;
                this.game.settingsManager.save();
                if (fovLabel) fovLabel.textContent = `${value} deg`;
                if (this.game.camera?.instance) {
                    this.game.camera.instance.fov = value;
                    this.game.camera.instance.updateProjectionMatrix();
                }
            });
        }

        const invertYInput = this.get('setting-invert-y');
        if (invertYInput) {
            invertYInput.checked = this.game.settings.invertY;
            invertYInput.addEventListener('change', () => {
                this.game.settings.invertY = invertYInput.checked;
                this.game.settingsManager.save();
            });
        }

        const autoJumpInput = this.get('setting-auto-jump');
        if (autoJumpInput) {
            autoJumpInput.checked = this.game.settings.autoJump;
            autoJumpInput.addEventListener('change', () => {
                this.game.settings.autoJump = autoJumpInput.checked;
                this.game.settingsManager.save();
                if (this.game.physics) this.game.physics.autoJumpEnabled = autoJumpInput.checked;
            });
        }

        const fpsCapSelect = this.get('setting-fps-cap');
        if (fpsCapSelect) {
            fpsCapSelect.value = String(this.game.settings.fpsCap ?? 60);
            fpsCapSelect.addEventListener('change', () => {
                this.game.settings.fpsCap = Number(fpsCapSelect.value);
                this.game.settingsManager.save();
            });
        }
    }

    bindGraphicsControls() {
        const shadowsInput = this.get('setting-shadows');
        if (shadowsInput) {
            shadowsInput.checked = this.game.settings.shadowsEnabled;
            shadowsInput.addEventListener('change', () => {
                this.game.settings.shadowsEnabled = shadowsInput.checked;
                this.game.renderer.toggleShadows(shadowsInput.checked);
                this.game.settingsManager.save();
            });
        }

        const fogInput = this.get('setting-fog');
        const fogLabel = this.get('setting-fog-value');
        if (fogInput) {
            fogInput.value = String(this.game.settings.fogDensityScale);
            if (fogLabel) fogLabel.textContent = Number(this.game.settings.fogDensityScale).toFixed(1);
            fogInput.addEventListener('input', () => {
                const val = Number(fogInput.value);
                this.game.settings.fogDensityScale = val;
                this.game.renderer.setFogDensityScale(val);
                this.game.settingsManager.save();
                if (fogLabel) fogLabel.textContent = val.toFixed(1);
            });
        }

        const resolutionInput = this.get('setting-resolution');
        const resolutionLabel = this.get('setting-resolution-value');
        if (resolutionInput) {
            resolutionInput.value = String(this.game.settings.resolutionScale);
            if (resolutionLabel) resolutionLabel.textContent = `${Number(this.game.settings.resolutionScale).toFixed(1)}x`;
            resolutionInput.addEventListener('input', () => {
                const val = Number(resolutionInput.value);
                this.game.settings.resolutionScale = val;
                this.game.renderer.setResolutionScale(val);
                this.game.settingsManager.save();
                if (resolutionLabel) resolutionLabel.textContent = `${val.toFixed(1)}x`;
            });
        }

        const renderDistanceInput = this.get('setting-render-distance');
        const renderDistanceLabel = this.get('setting-render-distance-value');
        if (renderDistanceInput) {
            renderDistanceInput.value = String(this.game.settings.renderDistance);
            if (renderDistanceLabel) renderDistanceLabel.textContent = String(this.game.settings.renderDistance);
            renderDistanceInput.addEventListener('input', () => {
                const value = Math.max(2, Math.min(6, Math.round(Number(renderDistanceInput.value))));
                this.game.settings.renderDistance = value;
                const effective = this.game.getEffectiveRenderDistanceForTier(this.game.qualityTier);
                this.game.world.setRenderDistance(effective);
                this.game.settingsManager.save();
                if (renderDistanceLabel) renderDistanceLabel.textContent = String(value);
            });
        }

        const autoQualityInput = this.get('setting-auto-quality');
        if (autoQualityInput) {
            autoQualityInput.checked = this.game.settings.autoQuality;
            autoQualityInput.addEventListener('change', () => {
                this.game.settings.autoQuality = autoQualityInput.checked;
                if (this.game.features) this.game.features.dynamicQualityAuto = autoQualityInput.checked;
                this.game.settingsManager.save();
            });
        }

        const graphicsApiSelect = this.get('setting-graphics-api');
        if (graphicsApiSelect) {
            graphicsApiSelect.value = this.game.settings.graphicsAPI || 'webgl2';
            graphicsApiSelect.addEventListener('change', () => {
                const val = graphicsApiSelect.value;
                this.game.settings.graphicsAPI = val;
                this.game.settingsManager.save();
                if (window.confirm('Graphics API changed to ' + val.toUpperCase() + '. Reload page now to apply?')) {
                    window.location.reload();
                }
            });
        }

        const qualityBtns = document.querySelectorAll('.btn-quality');
        const syncQualityBtns = () => {
            qualityBtns.forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.tier === this.game.qualityTier);
            });
        };
        qualityBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const tier = btn.dataset.tier;
                this.game.settings.qualityTierPref = tier;
                this.game.settingsManager.save();
                this.game.applyQualityTier(tier);
                syncQualityBtns();
            });
        });
        syncQualityBtns();
    }

    bindAudioControls() {
        const audioMuteInput = this.get('setting-audio-muted');
        const audioMasterInput = this.get('setting-audio-master');
        const audioMasterLabel = this.get('setting-audio-master-value');
        const audioSfxInput = this.get('setting-audio-sfx');
        const audioSfxLabel = this.get('setting-audio-sfx-value');
        const audioUiInput = this.get('setting-audio-ui');
        const audioUiLabel = this.get('setting-audio-ui-value');
        const audioWorldInput = this.get('setting-audio-world');
        const audioWorldLabel = this.get('setting-audio-world-value');

        const syncAudioLabel = (el, value) => {
            if (el) el.textContent = `${Math.round(value * 100)}%`;
        };

        const apply = () => {
            this.game.audio.applyFromSettings(this.game.settings);
            this.game.settingsManager.save();
        };

        if (audioMuteInput) {
            audioMuteInput.checked = this.game.settings.audioMuted;
            audioMuteInput.addEventListener('change', () => {
                this.game.settings.audioMuted = audioMuteInput.checked;
                apply();
            });
        }

        [
            { input: audioMasterInput, label: audioMasterLabel, key: 'audioMaster' },
            { input: audioSfxInput, label: audioSfxLabel, key: 'audioSfx' },
            { input: audioUiInput, label: audioUiLabel, key: 'audioUi' },
            { input: audioWorldInput, label: audioWorldLabel, key: 'audioWorld' }
        ].forEach(({ input, label, key }) => {
            if (input) {
                input.value = String(this.game.settings[key]);
                syncAudioLabel(label, this.game.settings[key]);
                input.addEventListener('input', () => {
                    const val = Math.max(0, Math.min(1, Number(input.value)));
                    this.game.settings[key] = val;
                    syncAudioLabel(label, val);
                    apply();
                });
            }
        });
    }

    bindCanvasControls() {
        const canvas = this.game.renderer?.instance?.domElement;
        if (!canvas) return;

        canvas.addEventListener('click', () => {
            if (!this.game.hasStarted || this.game.isPaused || this.game.gameState.isInventoryOpen) return;
            this.game.input.setPointerLock();
        });
    }

    bindAll() {
        this.bindMainMenu();
        this.bindPauseMenu();
        this.bindSettingsMenu();
        this.bindCanvasControls();
    }
}
