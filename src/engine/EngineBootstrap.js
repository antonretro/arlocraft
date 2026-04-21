import * as THREE from 'three';
import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { World } from '../world/World.js';
import { Physics } from './Physics.js';
import { EntityManager } from '../entities/EntityManager.js';
import { Player } from '../entities/Player.js';
import { PlayerHand } from '../entities/PlayerHand.js';
import { AudioSystem } from './AudioSystem.js';
import { DayNightSystem } from './DayNightSystem.js';
import { HorizonService } from '../world/visuals/HorizonService.js';
import { ParticleSystem } from './ParticleSystem.js';
import { ScriptSystem } from './ScriptSystem.js';
import { BlockScriptManager } from './BlockScriptManager.js';
import { MultiplayerManager } from './MultiplayerManager.js';
import { ChatSystem } from './ChatSystem.js';
import { CommandManager } from './CommandManager.js';
import { Input } from './Input.js';
import { ActionSystem } from './ActionSystem.js';
import { NotificationSystem } from './NotificationSystem.js';
import { SurvivalSystem } from './SurvivalSystem.js';
import { HUDCore } from '../ui/HUDCore.js';
import { HelpPanel } from '../ui/HelpPanel.js';
import { MiniMap } from '../ui/MiniMap.js';
import { ResourcePackManager } from '../world/ResourcePackManager.js';
import { UpdateChecker } from './UpdateChecker.js';
import { SkinLoader } from '../utils/SkinLoader.js';
import { SkinSystem } from './SkinSystem.js';
import { WorldSlotManager } from './WorldSlotManager.js';
import { SaveSystem } from './SaveSystem.js';
import { SettingsManager } from './SettingsManager.js';
import { GameState } from './GameState.js';
import { Stats } from './Stats.js';
import { DebugProfiler } from '../utils/DebugProfiler.js';
import { initReactUI } from '../ui/UIManager.jsx';
import { FEATURES } from '../data/features.js';

/**
 * EngineBootstrap
 * Responsible for the orchestration of service instantiation and wiring.
 * Moves the "God Object" setup logic out of Game.js.
 */
export class EngineBootstrap {
  static async init(game) {
    console.log('[ArloCraft] Bootstrapping Engine...');

    // 1. Data & State
    game.settingsManager = new SettingsManager();
    game.settings = game.settingsManager.getAll();
    game.saveSystem = new SaveSystem(game);
    game.worldSlots = new WorldSlotManager(game.saveSystem);
    game.skinSystem = new SkinSystem();
    game.skinSystem.loadSavedSkin();
    game.skinLoader = new SkinLoader();
    game.minimap = new MiniMap(game);
    game.resourceManager = ResourcePackManager.getInstance();
    
    game.gameState = new GameState();
    game.stats = new Stats();
    game.gameState.stats = game.stats;
    game.gameState.initStartingInventory();
    
    game.features = { ...FEATURES };
    game.currentVersionId = 'v1.1-STABLE';

    // 2. UI Foundation
    game.hud = new HUDCore(game);
    game.helpPanel = new HelpPanel(game);
    game.reactRoot = initReactUI(game);
    game.updateChecker = new UpdateChecker('antonretro', 'arlocraft');

    // 3. Core Engine Services
    game.renderer = new Renderer(game.settings.graphicsAPI);
    game.camera = new Camera(game.renderer.scene);
    game.player = new Player(game);
    game.world = new World(game.renderer.scene, game);
    game.entities = new EntityManager(game);

    game.physics = new Physics(game.camera, game.world);
    game.physics.autoJumpEnabled = game.settings.autoJump;
    
    game.hand = new PlayerHand();
    game.camera.viewmodelGroup.add(game.hand.group);
    
    game.actionSystem = new ActionSystem(game);
    game.input = new Input(game);

    // 4. Gameplay Systems
    game.notifications = new NotificationSystem();
    game.chat = new ChatSystem(game);
    game.blockScripts = new BlockScriptManager(game);
    await game.blockScripts.init();
    
    game.multiplayer = new MultiplayerManager(game);
    game.particles = new ParticleSystem(game);
    game.scripts = new ScriptSystem(game);
    game.survival = new SurvivalSystem(game.gameState, game.hud);
    game.dayNight = new DayNightSystem(game.renderer, game.world, {});
    game.horizons = new HorizonService(game.renderer.scene, game.renderer);
    
    game.audio = new AudioSystem();
    game.audio.applyFromSettings(game.settings);
    game.audio.installAutoUnlock(document);

    // 5. Utility & Polish
    game.renderer.applyFromSettings(game.settings);
    game.profiler = new DebugProfiler(game);
    game.clock = new THREE.Timer();

    this.bindGlobalEvents(game);
    this.setupSkinListeners(game);

    console.log('[ArloCraft] Bootstrap Complete.');
  }

  static bindGlobalEvents(game) {
    window.addEventListener('player-respawn', () => {
      game.physics.resetPlayer();
      game.audio.play('respawn');
    });

    window.addEventListener('block-mined', (event) => {
      const minedId = event.detail?.id;
      if (minedId) game.gameState.addBlockToInventory(minedId, 1);
      game.stats.addXP(game.world.getBlockXP(minedId));
      game.screenShake = Math.max(0.05, minedId === 'virus' ? 0.09 : 0.05);
      game.shakeCamera(game.screenShake);
      game.audio.play('block-mined', { id: minedId });
    });

    window.addEventListener('enemy-defeated', (event) => {
      const xp = event.detail?.xp ?? 0;
      game.stats.addXP(xp);
      game.audio.play('enemy-defeated');
    });

    window.addEventListener('mode-changed', (event) => {
      if (game.gameState.mode !== event.detail) {
        game.setMenuMode(event.detail, false);
      }
      game.audio.play('mode-changed');
    });

    window.addEventListener('inventory-toggle', (event) => {
      if (event.detail) game.helpPanel.setState('inventory');
      else if (!game.isPaused && game.hasStarted)
        game.helpPanel.setState('playing');
      game.audio.play(event.detail ? 'inventory-open' : 'inventory-close');
    });

    window.addEventListener('interact-crafting-table', () => {
      if (!game.hasStarted || game.isPaused) return;
      if (!game.gameState.isInventoryOpen) game.gameState.toggleInventory();
      game.audio.play('crafting-open');
    });

    window.addEventListener('block-placed', (event) => {
      game.audio.play('block-placed', { id: event.detail?.id });
    });
    
    window.addEventListener('player-damaged', () => game.audio.play('player-damaged'));
    window.addEventListener('action-success', () => game.audio.play('action-success'));
    window.addEventListener('action-fail', () => game.audio.play('action-fail'));
    window.addEventListener('level-up', () => game.audio.play('level-up'));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        game.toggleDebugOverlay();
      }
    });

    window.addEventListener('skin-changed', (event) => {
      const { skinId, data } = event.detail;
      if (skinId.startsWith('custom_')) {
        const username = skinId.replace('custom_', '');
        game.updatePlayerSkin(username);
        game.settings.skinUsername = username;
        game.saveSettings();
        window.dispatchEvent(
          new CustomEvent('skin-updated', {
            detail: {
              skinId,
              avatarUrl: data || game.skinSystem.getSkinUrl(skinId),
              name: game.skinSystem.getSkinMeta(skinId).name,
            },
          })
        );
      } else {
        const url = game.skinSystem.getSkinUrl(skinId) || data;
        if (url) {
          game.skinLoader.loadSkinFromUrl(url).then(({ materials }) => {
            game._applyLoadedSkin(materials, url);
            game.settings.skinUsername = '';
            game.saveSettings();
            window.dispatchEvent(
              new CustomEvent('skin-updated', {
                detail: {
                  skinId,
                  avatarUrl: game.skinSystem.getSkinMeta(skinId).faceUrl || url,
                  name: game.skinSystem.getSkinMeta(skinId).name,
                },
              })
            );
          }).catch(console.error);
        }
      }
    });
  }

  static setupSkinListeners(game) {
    setTimeout(() => {
      const savedSkinId = game.skinSystem.currentSkin;
      const savedSkinUrl = game.skinSystem.getSkinUrl(savedSkinId);

      if (savedSkinUrl && savedSkinId !== 'classic_steve') {
        window.dispatchEvent(
          new CustomEvent('skin-changed', {
            detail: { skinId: savedSkinId, data: savedSkinUrl },
          })
        );
        return;
      }

      if (game.settings.skinUsername) {
        game.updatePlayerSkin(game.settings.skinUsername, { persist: false });
      } else {
        window.dispatchEvent(
          new CustomEvent('skin-updated', {
            detail: {
              skinId: savedSkinId,
              avatarUrl:
                game.skinSystem.getSkinMeta(savedSkinId).faceUrl ||
                game.skinSystem.getSkinUrl(savedSkinId),
              name: game.skinSystem.getSkinMeta(savedSkinId).name,
            },
          })
        );
      }
    }, 250);
  }
}
