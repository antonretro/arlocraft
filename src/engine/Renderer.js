import * as THREE from 'three';
import {
  CLOUD_SETTINGS,
  computeFogDensity,
  ATMOSPHERIC_COLORS,
} from '../rendering/RenderConfig.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

THREE.ColorManagement.enabled = true;

export class Renderer {
  constructor(preferredAPI = 'webgl2') {
    this.rendererType = 'webgl2';
    this.resolutionScale = 1;
    this.qualityTier = 'balanced';
    this.postProcessingEnabled = false;
    this.fallbackToWebGL();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8f0);
    this.scene.fog = new THREE.FogExp2(0x7ec8f0, 0.012);

    this.daylight = 1;
    this.submerged = false;
    this.fogDensityScale = 1.0;
    this.areaInfluence = { virus: 0, arlo: 0 };
    this.lastCloudUpdateMs = performance.now();

    this.setupLights();
    this.setupSky();
    this.setupClouds();
    this.setupPostProcessing();

    window.addEventListener('resize', () => {
      this.setSize(window.innerWidth, window.innerHeight);
    });
  }

  syncViewportSize(width = window.innerWidth, height = window.innerHeight) {
    if (!this.instance) return;

    const dprCap =
      this.qualityTier === 'high' ? 1.5 : this.qualityTier === 'low' ? 0.9 : 1;
    const pixelRatio =
      Math.min(window.devicePixelRatio || 1, dprCap) *
      (this.resolutionScale || 1);
    this.instance.setPixelRatio(pixelRatio);
    this.instance.setSize(width, height);

    if (this.composer) {
      this.composer.setPixelRatio?.(pixelRatio);
      this.composer.setSize(width, height);
    }
  }

  /**
   * Controls the visibility of the 3D rendering canvas.
   */
  setVisible(visible) {
    if (this.instance.domElement) {
      this.instance.domElement.style.display = visible ? 'block' : 'none';
    }
  }

  fallbackToWebGL() {
    this.rendererType = 'webgl2';
    this.instance = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.syncViewportSize(window.innerWidth, window.innerHeight);
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.setClearColor(0x87ceeb, 1);
    this._initPromise = Promise.resolve();
    console.log('[ArloCraft] Using WebGL2 renderer (Stability Mode)');

    // Update DOM if app exists
    const appElem = document.getElementById('app');
    if (appElem) {
      // Remove existing canvas if any
      const existing = appElem.querySelector('canvas');
      if (existing && existing !== this.instance.domElement) {
        existing.remove();
      }
      if (this.instance.domElement.parentNode !== appElem) {
        appElem.appendChild(this.instance.domElement);
        this.instance.domElement.style.display = 'none'; // Hidden until startGame
      }
    }
  }

  setupLights() {
    this.hemiLight = new THREE.HemisphereLight(0xcce8ff, 0x4a402f, 0.95);
    this.scene.add(this.hemiLight);

    this.ambientFill = new THREE.AmbientLight(0xf4ead8, 0.38);
    this.scene.add(this.ambientFill);

    this.sun = new THREE.DirectionalLight(0xfffff5, 1.25);
    this.sun.position.set(20, 100, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 512;
    this.sun.shadow.mapSize.height = 512;
    this.sun.shadow.camera.left = -100;
    this.sun.shadow.camera.right = 100;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
  }

  setupSky() {
    const skyGeo = new THREE.SphereGeometry(450, 64, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x0a3fc8) },
        bottom: { value: new THREE.Color(0x7ec8f0) },
        horizon: { value: new THREE.Color(0xffd090) },
        horizonStrength: { value: 0.0 },
        offset: { value: 0 },
        exponent: { value: 2.2 },
      },
      vertexShader: `
                varying float vHeight;
                void main() {
                    vHeight = normalize(position).y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: `
                uniform vec3 top;
                uniform vec3 bottom;
                uniform vec3 horizon;
                uniform float horizonStrength;
                uniform float offset;
                uniform float exponent;
                varying float vHeight;
                void main() {
                    float h = vHeight;
                    // Improved gradient: use a sigmoidal mix for more natural sky transitions
                    float factor = smoothstep(-0.05, 0.6, h); 
                    vec3 sky = mix(bottom, top, factor);
                    
                    // Horizon glow band: Use smoother transitions
                    float horizonBand = clamp(1.0 - abs(h) * 2.5, 0.0, 1.0);
                    horizonBand = smoothstep(0.0, 1.0, pow(horizonBand, 4.0)) * horizonStrength;
                    sky = mix(sky, horizon, horizonBand);
                    
                    // Darken slightly below horizon but keep it smooth
                    if (h < 0.0) {
                        float depthFactor = clamp(-h * 2.0, 0.0, 0.4);
                        sky = mix(bottom, vec3(0.02, 0.04, 0.08), depthFactor);
                    }
                    
                    gl_FragColor = vec4(sky, 1.0);
                }
            `,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Stars
    const starsGeo = new THREE.BufferGeometry();
    const starsPos = [];
    for (let i = 0; i < 2400; i++) {
      const x = THREE.MathUtils.randFloatSpread(900);
      const y = THREE.MathUtils.randFloat(20, 450);
      const z = THREE.MathUtils.randFloatSpread(900);
      starsPos.push(x, y, z);
    }
    starsGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starsPos, 3)
    );
    const starsMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      transparent: true,
      opacity: 0,
    });
    this.stars = new THREE.Points(starsGeo, starsMat);
    this.scene.add(this.stars);

    // Moon
    const moonGeo = new THREE.CircleGeometry(14, 32);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0,
    });
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
    this.scene.add(this.moonMesh);

    // Moon glow
    const moonGlowGeo = new THREE.CircleGeometry(24, 32);
    const moonGlowMat = new THREE.MeshBasicMaterial({
      color: 0x6688cc,
      transparent: true,
      opacity: 0,
    });
    this.moonGlow = new THREE.Mesh(moonGlowGeo, moonGlowMat);
    this.scene.add(this.moonGlow);
    this.scene.add(this.moonGlow);
  }

  setupPostProcessing() {
    this._initPromise.then(() => {
      this.composer = new EffectComposer(this.instance);
      this.renderPass = new RenderPass(this.scene, this._lastCamera || new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);

      // World Class: Luminous Bloom for torches/sun
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.22, // strength
        0.4,  // radius
        0.85  // threshold
      );
      this.composer.addPass(this.bloomPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
      this.syncViewportSize(window.innerWidth, window.innerHeight);
    });
  }

  setupClouds() {
    this.cloudMeshes = [];
    const loader = new THREE.TextureLoader();
    const cloudsTexture = loader.load('assets/New Textures/clouds.png');
    cloudsTexture.wrapS = cloudsTexture.wrapT = THREE.RepeatWrapping;
    cloudsTexture.magFilter = THREE.LinearFilter;
    cloudsTexture.minFilter = THREE.LinearFilter;

    const cloudGeo = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    cloudGeo.rotateX(-Math.PI / 2);

    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudsTexture },
        offset: { value: new THREE.Vector2(0, 0) },
        cloudOpacity: { value: 0.85 },
      },
      vertexShader: `
                varying vec2 vUv;
                uniform vec2 offset;
                void main() {
                    vUv = uv + offset;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: `
                varying vec2 vUv;
                uniform sampler2D map;
                uniform float cloudOpacity;

                void main() {
                    vec4 tex = texture2D(map, vUv);
                    gl_FragColor = vec4(tex.rgb, tex.a * cloudOpacity);
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.cloudPlane = new THREE.Mesh(cloudGeo, this.cloudMat);
    this.cloudPlane.position.y = CLOUD_SETTINGS.yMin;
    this.scene.add(this.cloudPlane);
  }

  updateEnvironmentLighting(
    daylight,
    playerPos = null,
    forcedDepthBlend = null
  ) {
    this.daylight = daylight;
    const clamped = Math.max(0, Math.min(1, daylight));

    // Atmosphere logic
    let state = 'DAY';
    if (daylight < 0.28) state = 'NIGHT';
    else if (daylight < 0.45) state = 'DAWN';
    else if (daylight > 0.85) state = 'DAY';

    const colors = ATMOSPHERIC_COLORS[state];
    const top = new THREE.Color(colors.top);
    const bottom = new THREE.Color(colors.bottom);
    const sunCol = new THREE.Color(colors.sun);

    // Apply depth-based darkening
    let depthBlend = forcedDepthBlend !== null ? forcedDepthBlend : 0;
    if (forcedDepthBlend === null && playerPos) {
      const surfaceY = 64;
      const depth = surfaceY - playerPos.y;
      depthBlend = Math.max(0, Math.min(0.55, depth / 180));
    }

    if (depthBlend > 0) {
      const caveTint = new THREE.Color(0x1f2c38);
      bottom.lerp(caveTint, depthBlend);
      top.lerp(caveTint, depthBlend);
    }

    if (this.skyDome) {
      this.skyDome.material.uniforms.top.value.copy(top);
      this.skyDome.material.uniforms.bottom.value.copy(bottom);
      const horizonGlowColor =
        state === 'DUSK'
          ? new THREE.Color(0xff4400)
          : state === 'DAWN'
            ? new THREE.Color(0xff8833)
            : new THREE.Color(0xffd0a0);
      const horizonStr =
        state === 'DAWN' || state === 'DUSK'
          ? 0.85
          : state === 'DAY'
            ? 0.12
            : 0.05; // Small horizon bleed even at night
      this.skyDome.material.uniforms.horizon.value.copy(horizonGlowColor);
      this.skyDome.material.uniforms.horizonStrength.value = horizonStr;
    }
    this.scene.background.copy(bottom);

    const fogCol = bottom.clone().lerp(new THREE.Color(0xffffff), 0.05);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density =
      computeFogDensity(daylight, this.submerged) *
      (this.fogDensityScale || 1.0);

    // Enforce visibility floor
    const intensityFactor = 0.4 + clamped * 1.1;
    this.sun.intensity = intensityFactor;
    this.sun.color.copy(sunCol);

    this.hemiLight.intensity = 0.8 + clamped * 0.6;
    this.hemiLight.color.set(top);
    this.hemiLight.groundColor.set(0x6d6253);

    if (this.ambientFill) {
      this.ambientFill.intensity = 0.35 + clamped * 0.2;
      this.ambientFill.color.copy(sunCol).lerp(new THREE.Color(0xffffff), 0.35);
    }

    // Center sun shadow camera on player for infinite coverage
    if (playerPos) {
      const sx = Math.floor(playerPos.x / 4) * 4;
      const sz = Math.floor(playerPos.z / 4) * 4;
      this.sun.position.set(sx + 20, 100, sz + 20);
      this.sun.target.position.set(sx, 0, sz);
      this.sun.target.updateMatrixWorld();
    }

    // Stars & Moon
    if (this.stars) {
      this.stars.material.opacity = Math.max(0, (0.35 - daylight) * 2.5);
      this.stars.visible = this.stars.material.opacity > 0.01;
    }
    if (this.moonMesh && this.moonGlow) {
      const moonOp = Math.max(0, (0.32 - daylight) * 1.8);
      this.moonMesh.material.opacity = moonOp;
      this.moonGlow.material.opacity = moonOp * 0.4;
      this.moonMesh.visible = moonOp > 0.01;
      this.moonGlow.visible = this.moonMesh.visible;
    }
  }

  setDaylightLevel(daylight) {
    this.daylight = Math.max(0, Math.min(1, daylight));

    // Synced with updateEnvironmentLighting logic
    this.sun.intensity = 0.4 + this.daylight * 1.1;
    this.hemiLight.intensity = 0.8 + this.daylight * 0.6;
    if (this.ambientFill) {
      this.ambientFill.intensity = 0.35 + this.daylight * 0.2;
    }

    // Sky colors mix - use THREE.Color to wrap the hex constants from RenderConfig
    const dayTop = new THREE.Color(ATMOSPHERIC_COLORS.DAY.top);
    const dayBottom = new THREE.Color(ATMOSPHERIC_COLORS.DAY.bottom);
    const nightTop = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.top);
    const nightBottom = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.bottom);

    const skyTop = dayTop.clone().lerp(nightTop, 1 - this.daylight);
    const skyBottom = dayBottom.clone().lerp(nightBottom, 1 - this.daylight);

    if (this.skyDome) {
      this.skyDome.material.uniforms.top.value.copy(skyTop);
      this.skyDome.material.uniforms.bottom.value.copy(skyBottom);
    }

    this.scene.fog.color.copy(skyBottom);
    this.scene.fog.density =
      computeFogDensity(this.daylight, this.submerged) *
      (this.fogDensityScale || 1.0);

    if (this.stars) {
      this.stars.material.opacity = Math.max(0, (0.45 - this.daylight) * 1.5);
      this.stars.visible = this.stars.material.opacity > 0.05;
    }

    if (this.moonMesh && this.moonGlow) {
      const moonOp = Math.max(0, (0.32 - this.daylight) * 1.8);
      this.moonMesh.material.opacity = moonOp;
      this.moonGlow.material.opacity = moonOp * 0.4;
      this.moonMesh.visible = moonOp > 0.01;
      this.moonGlow.visible = this.moonMesh.visible;
    }
  }

  toggleShadows(enabled) {
    this.instance.shadowMap.enabled = Boolean(enabled);
    this.sun.castShadow = Boolean(enabled);
  }

  setFogDensityScale(scale) {
    this.fogDensityScale = Math.max(0, Math.min(2, Number(scale) || 1.0));
  }

  setUnderwaterState(submerged) {
    this.submerged = Boolean(submerged);
    if (submerged) {
      // Deep teal-blue underwater fog
      this.scene.fog.color.setHex(0x0a3d5a);
      this.scene.background.setHex(0x061e2e);
      if (this.skyDome) this.skyDome.visible = false;
    } else {
      if (this.skyDome) this.skyDome.visible = true;
    }
    this.scene.fog.density =
      computeFogDensity(this.daylight, this.submerged) *
      (this.fogDensityScale || 1.0);
  }

  render(camera) {
    this._lastCamera = camera; // exposed for DayNightSystem sun/moon positioning
    if (this.skyDome) this.skyDome.position.copy(camera.position);
    if (this.stars) this.stars.position.copy(camera.position);

    // Moon Billboarding: face the camera
    if (this.moonMesh && this.moonGlow) {
      // Position moon in the sky distance
      const moonDir = new THREE.Vector3(0, 0.45, -1).normalize();
      const moonDist = 400;
      this.moonMesh.position
        .copy(camera.position)
        .addScaledVector(moonDir, moonDist);
      this.moonGlow.position.copy(this.moonMesh.position);

      this.moonMesh.lookAt(camera.position);
      this.moonGlow.lookAt(camera.position);
    }

    const now = performance.now();
    const delta = Math.max(
      0,
      Math.min(0.05, (now - this.lastCloudUpdateMs) / 1000)
    );
    this.lastCloudUpdateMs = now;

    // Scroll cloud noise plane
    if (this.cloudMat) {
      this.cloudMat.uniforms.offset.value.x += delta * 0.0015; // Even slower for "huge cloud" feel
      this.cloudMat.uniforms.offset.value.y += delta * 0.0008;
    }

    // Follow camera so the cloud plane never falls out of view
    if (this.cloudPlane) {
      this.cloudPlane.position.x = camera.position.x;
      this.cloudPlane.position.z = camera.position.z;
    }

    if (this.postProcessingEnabled && this.composer && camera) {
      if (this.renderPass.camera !== camera) this.renderPass.camera = camera;
      this.composer.render();
    } else {
      this.instance.render(this.scene, camera);
    }
  }

  setQualityTier(tier = 'balanced') {
    this.qualityTier = ['low', 'balanced', 'high'].includes(tier)
      ? tier
      : 'balanced';
    this.postProcessingEnabled = this.qualityTier === 'high';
    
    if (this.bloomPass) {
      this.bloomPass.enabled = this.postProcessingEnabled;
    }
    
    if (this.cloudPlane) {
      this.cloudPlane.visible = this.qualityTier !== 'low';
    }

    if (this.instance && this.sun) {
      const shadowRes = this.qualityTier === 'high' ? 1024 : 512;
      this.sun.shadow.mapSize.set(shadowRes, shadowRes);
      this.instance.shadowMap.type = this.qualityTier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null; // Forces re-allocation
    }

    this.syncViewportSize(window.innerWidth, window.innerHeight);
  }

  setResolutionScale(scale) {
    this.resolutionScale = Math.max(0.1, Math.min(2.0, Number(scale) || 1.0));
    this.syncViewportSize(window.innerWidth, window.innerHeight);
  }
  setSize(w, h) {
    this.syncViewportSize(w, h);
  }

  setAreaInfluence(influence) {
    this.areaInfluence = influence || { virus: 0, arlo: 0 };
  }

  applyFromSettings(settings) {
    if (!this.instance) return;

    // Resolution Scaling
    if (settings.resolutionScale !== undefined) {
      this.setResolutionScale(settings.resolutionScale);
    }

    // Cloud Opacity
    if (settings.cloudOpacity !== undefined && this.cloudMat) {
      this.cloudMat.uniforms.cloudOpacity.value = settings.cloudOpacity;
    }

    // Shadow Management
    const shadows = Boolean(settings.shadowsEnabled);
    if (this.instance.shadowMap) {
      this.instance.shadowMap.enabled = shadows;

      this.scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.needsUpdate = true;
          obj.receiveShadow = shadows;
          obj.castShadow = shadows;
        }
      });
    }
  }

  async waitForInit() {
    await this._initPromise;
  }
}
