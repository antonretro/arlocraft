/**
 * SimulationManager
 * Unifies the non-interaction based systems into a single tick loop.
 * Handles survival mechanics, day/night cycles, and dynamic performance tuning.
 */
export class SimulationManager {
  constructor(game) {
    this.game = game;
    this.idleWorldTick = 0;
  }

  update(delta) {
    const g = this.game;
    if (!g.hasStarted) return;

    const canSimulate = !g.isPaused && !g.gameState.isInventoryOpen;
    const playerPos = g.getPlayerPosition();

    // 1. Passive World Updates (When paused or title screen)
    if (!canSimulate) {
      this.idleWorldTick = (this.idleWorldTick + 1) % 120;
      let worldDelta = delta;
      let runWorld = false;

      if (!g.hasStarted) {
        runWorld = this.idleWorldTick % 24 === 0;
        worldDelta = 1 / 30;
      } else if (g.isPaused) {
        runWorld = this.idleWorldTick % 10 === 0;
        worldDelta = Math.min(1 / 20, delta * 3);
      }
      
      if (runWorld || g.world.pendingChunkLoads.length > 0) {
        g.world.update(playerPos, worldDelta);
      }
      return;
    }

    // 2. Core Gameplay Systems Ticking
    g.entities.update(delta);
    g.particles.update(delta);
    
    // Survival & Area Influence (Throttled to 5Hz)
    g.survival.update(delta);
    this.zoneTick = (this.zoneTick || 0) + delta;
    if (this.zoneTick >= 0.2) {
        const areaInfluence = g.world.getAreaInfluence(playerPos);
        if (g.updateZoneMeter) g.updateZoneMeter(areaInfluence);
        this.zoneTick = 0;
    }

    // Horizons & Biomes (Throttled to 10Hz)
    this.biomeTick = (this.biomeTick || 0) + delta;
    if (this.biomeTick >= 0.1) {
        if (g.horizons) {
            const dominantBiome = g.world.terrain.getBiomeAt(playerPos.x, playerPos.z)?.id || 'plains';
            g.horizons.update(g.camera.instance.position, g.renderer.daylight, dominantBiome);
        }
        this.biomeTick = 0;
    }

    // World & Day/Night
    g.world.update(playerPos, delta);
    g.dayNight.update(delta, () => playerPos);
    
    // 3. UI & Utility Sync
    if (g.minimap) g.minimap.update(delta, playerPos, g.viewYaw);
    
    // Throttle coordinate updates to 10Hz (0.1s)
    this.coordinateTick = (this.coordinateTick || 0) + delta;
    if (this.coordinateTick >= 0.1) {
        g.hud.updateCoordinates(playerPos, g.viewYaw, g.world);
        this.coordinateTick = 0;
    }
    
    if (g.updateDebugOverlay) g.updateDebugOverlay(delta);
    
    // 4. State & Utility Updates
    this.updateUnderwaterState();
    this.updateDynamicQuality(delta);
  }

  updateUnderwaterState() {
    const g = this.game;
    const camPos = g.camera.instance.position;
    const submerged = g.world.isPositionInWater(camPos.x, camPos.y, camPos.z);

    const overlay = document.getElementById('underwater-light');
    if (overlay) {
      if (submerged) overlay.classList.add('submerged');
      else overlay.classList.remove('submerged');
    }
    g.renderer.setUnderwaterState(submerged);
  }

  updateDynamicQuality(delta) {
    const g = this.game;
    if (!g.features.dynamicQualityAuto || !g.hasStarted) return;

    g.performanceSampler.frames += 1;
    g.performanceSampler.time += Math.max(0, delta);
    if (g.performanceSampler.time < 1.2) return;

    const fps = g.performanceSampler.frames / Math.max(0.001, g.performanceSampler.time);
    g.performanceSampler.frames = 0;
    g.performanceSampler.time = 0;

    const now = performance.now();
    if (now - g.performanceSampler.lastAdjust < 2600) return;

    const cap = g.settings.fpsCap === 999 ? 144 : g.settings.fpsCap || 60;
    const lowThreshold = cap * 0.62;
    const highThreshold = cap * 0.92;

    const AUTO_PROFILE = {
      low: { resolution: 0.6, renderDist: 2 },
      balanced: { resolution: 0.85, renderDist: 3 },
      high: { resolution: 1.0, renderDist: 4 },
    };

    let target = g.qualityTier;
    const idx = g.qualityOrder.indexOf(g.qualityTier);
    if (fps < lowThreshold && idx > 0) {
      target = g.qualityOrder[idx - 1];
    } else if (fps > highThreshold && idx < g.qualityOrder.length - 1) {
      target = g.qualityOrder[idx + 1];
    }

    if (target === g.qualityTier) return;
    g.applyQualityTier(target);

    const profile = AUTO_PROFILE[target];
    if (profile) {
      g.renderer.setResolutionScale(profile.resolution);
      g.settings.resolutionScale = profile.resolution;
      
      const resInput = document.getElementById('setting-resolution');
      const resLabel = document.getElementById('setting-resolution-value');
      if (resInput) resInput.value = profile.resolution;
      if (resLabel) resLabel.textContent = profile.resolution.toFixed(1) + 'x';
    }

    g.performanceSampler.lastAdjust = now;
    g.setStatus(
      `Auto: ${target.toUpperCase()} | ${Math.round(fps)} FPS | res ${((profile?.resolution || 1) * 100).toFixed(0)}% | rd ${g.getEffectiveRenderDistanceForTier(target)}`
    );
  }
}
