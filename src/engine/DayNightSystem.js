import * as THREE from 'three';

const SUN_RADIUS = 380;
const MOON_RADIUS = 380;

export class DayNightSystem {
  constructor(renderer, world, features) {
    this.renderer = renderer;
    this.world = world;
    this.features = features;
    this.timeOfDay = 0.3;
    this.dayDurationSeconds = 480; // 8 minutes per day
    this.totalDays = 0;
    this._lastTime = 0.3;
    this.daylight = 1;
    this.weatherType = 'clear';
    this.weatherIntensity = 0;
    this.weatherTimer = 140;

    this._setupSunMoonPlanes();
  }

  _pickNextWeather(playerPos = null) {
    const biomeId = playerPos
      ? this.world.getBiomeAt(playerPos.x, playerPos.z)?.id || 'plains'
      : 'plains';
    const roll = Math.random();

    if (biomeId === 'desert' || biomeId === 'badlands' || biomeId === 'canyon') {
      this.weatherType = roll > 0.985 ? 'storm' : 'clear';
    } else if (biomeId === 'swamp' || biomeId === 'forest' || biomeId === 'lush_grove') {
      this.weatherType = roll > 0.82 ? 'storm' : roll > 0.42 ? 'rain' : 'clear';
    } else if (biomeId === 'tundra' || biomeId === 'snow' || biomeId === 'alpine') {
      this.weatherType = roll > 0.88 ? 'storm' : roll > 0.46 ? 'rain' : 'clear';
    } else {
      this.weatherType = roll > 0.9 ? 'storm' : roll > 0.58 ? 'rain' : 'clear';
    }

    this.weatherTimer = 90 + Math.random() * 180;
  }

  _updateWeather(delta, playerPos = null) {
    this.weatherTimer -= delta;
    if (this.weatherTimer <= 0) {
      this._pickNextWeather(playerPos);
    }

    const targetIntensity =
      this.weatherType === 'storm'
        ? 1
        : this.weatherType === 'rain'
          ? 0.68
          : 0;
    this.weatherIntensity = THREE.MathUtils.lerp(
      this.weatherIntensity,
      targetIntensity,
      Math.min(1, delta * 0.12)
    );
    this.renderer.setWeatherState?.(this.weatherType, this.weatherIntensity);
  }

  _setupSunMoonPlanes() {
    const scene = this.renderer?.scene;
    if (!scene) return;

    const planeGeo = new THREE.PlaneGeometry(18, 18);

    const loadTex = (url, fallbackColor, cb) => {
      const mat = new THREE.MeshBasicMaterial({
        color: fallbackColor,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const img = new Image();
      img.onload = () => {
        const tex = new THREE.CanvasTexture(img);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      };
      img.src = url;
      cb(mat);
    };

    const base = import.meta.env.BASE_URL || '/';
    const assetPath = base.endsWith('/') ? base : base + '/';

    loadTex(`${assetPath}resource_pack/assets/minecraft/textures/environment/sun.png`, 0xfffde8, (mat) => {
      this.sunPlane = new THREE.Mesh(planeGeo, mat);
      this.sunPlane.renderOrder = -1;
      scene.add(this.sunPlane);
    });

    loadTex(`${assetPath}resource_pack/assets/minecraft/textures/environment/moon_phases.png`, 0xddeeff, (mat) => {
      mat.opacity = 0;
      if (mat.map) {
        mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.repeat.set(0.25, 0.5); // Minecraft moon_phases are 4x2 or 4 phases horizontally
        mat.map.offset.set(0, 0.5);   // Full moon is usually first top-left
      }
      this.moonPlane = new THREE.Mesh(planeGeo.clone(), mat);
      this.moonPlane.renderOrder = -1;
      scene.add(this.moonPlane);
    });
  }

  update(delta, getPlayerPosition) {
    this.timeOfDay = (this.timeOfDay + delta / this.dayDurationSeconds) % 1.0;
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const sunDistance = 110;

    this.renderer.sun.position.set(
      Math.cos(angle) * sunDistance,
      sunHeight * sunDistance,
      70
    );
    const daylight = THREE.MathUtils.clamp((sunHeight + 0.16) / 0.9, 0.06, 1);
    this.daylight = daylight;
    this.renderer.setDaylightLevel(daylight);

    const cam = this.renderer?.camera ?? this.renderer?._lastCamera;
    const camPos = cam ? cam.position : new THREE.Vector3(0, 64, 0);

    if (this.sunPlane) {
      const sx = Math.cos(angle) * SUN_RADIUS;
      const sy = Math.sin(angle) * SUN_RADIUS;
      this.sunPlane.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
      this.sunPlane.lookAt(camPos);
      const isDay = sunHeight > -0.1;
      this.sunPlane.material.opacity = isDay
        ? Math.min(1, (sunHeight + 0.1) * 5)
        : 0;
      this.sunPlane.visible = this.sunPlane.material.opacity > 0.01;
    }

    if (this.moonPlane) {
      // Moon is opposite arc from sun
      const mx = Math.cos(angle + Math.PI) * MOON_RADIUS;
      const my = Math.sin(angle + Math.PI) * MOON_RADIUS;
      this.moonPlane.position.set(camPos.x + mx, camPos.y + my, camPos.z);
      this.moonPlane.lookAt(camPos);
      const isNight = sunHeight < 0.1;
      this.moonPlane.material.opacity = isNight
        ? Math.min(1, (-sunHeight + 0.1) * 5)
        : 0;
      this.moonPlane.visible = this.moonPlane.material.opacity > 0.01;
    }
    // Force dynamic lighting update to ensure renderer sync (fog, atmosphere, sun)
    const pos = getPlayerPosition?.();
    this._updateWeather(delta, pos);
    let depthBlend = 0;
    if (pos) {
      const surfaceY = this.world.getColumnHeight(pos.x, pos.z);
      const relativeDepth = surfaceY - pos.y;
      depthBlend = Math.max(0, Math.min(1, relativeDepth / 16));
    }
    this.renderer.updateEnvironmentLighting(daylight, pos, depthBlend);

    // Day counter
    if (this._lastTime > 0.8 && this.timeOfDay < 0.2) {
      this.totalDays++;
    }
    this._lastTime = this.timeOfDay;
  }

  getTimeString() {
    // 0 = 6:00 AM, 0.25 = 12:00 PM, 0.5 = 6:00 PM, 0.75 = 12:00 AM
    const totalMinutes = ((this.timeOfDay + 0.25) % 1) * 1440;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.floor(totalMinutes % 60);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    const mStr = minutes < 10 ? `0${minutes}` : minutes;
    return `${h12}:${mStr} ${ampm}`;
  }

  getDayNumber() {
    return this.totalDays + 1;
  }

  isNight() {
    return this.daylight < 0.28;
  }

  setTime(timeOfDay, totalDays = this.totalDays) {
    if (Number.isFinite(timeOfDay)) {
      this.timeOfDay = ((timeOfDay % 1) + 1) % 1;
      this._lastTime = this.timeOfDay;
    }
    if (Number.isFinite(totalDays)) {
      this.totalDays = Math.max(0, Math.floor(totalDays));
    }
  }

  setWeather(type = 'clear', intensity = 0) {
    this.weatherType = type || 'clear';
    this.weatherIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
    this.renderer.setWeatherState?.(this.weatherType, this.weatherIntensity);
  }
}
