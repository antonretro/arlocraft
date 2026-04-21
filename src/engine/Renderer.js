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
    this.baseCloudOpacity = 0.85;
    this.weatherType = 'clear';
    this.weatherIntensity = 0;
    this.weatherWind = new THREE.Vector2(0.9, 0.35);

    this.setupLights();
    this.setupSky();
    this.setupClouds();
    this.setupWeatherEffects();
    this.setupPostProcessing();

    this.onResizeHandler = () => {
      this.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this.onResizeHandler);
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

    const appElem = document.getElementById('app');
    if (appElem) {
      const existing = appElem.querySelector('canvas');
      if (existing && existing !== this.instance.domElement) {
        existing.remove();
      }
      if (this.instance.domElement.parentNode !== appElem) {
        appElem.appendChild(this.instance.domElement);
        this.instance.domElement.style.display = 'none';
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
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;
    this.instance.shadowMap.autoUpdate = true;
    this.scene.add(this.sun);
  }

  setupSky() {
    const skyGeo = new THREE.SphereGeometry(450, 64, 32);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x0044ff) },
        bottom: { value: new THREE.Color(0x66ccff) },
        horizon: { value: new THREE.Color(0xffd090) },
        sunPos: { value: new THREE.Vector3(0, 1, 0) },
        horizonStrength: { value: 0.12 },
        uTime: { value: 0 },
      },
      vertexShader: `
                varying float vHeight;
                varying vec3 vWorldPos;
                void main() {
                    vHeight = normalize(position).y;
                    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
      fragmentShader: `
                uniform vec3 top;
                uniform vec3 bottom;
                uniform vec3 horizon;
                uniform vec3 sunPos;
                uniform float horizonStrength;
                uniform float uTime;
                varying float vHeight;
                varying vec3 vWorldPos;
                
                void main() {
                    float h = vHeight;
                    float factor = smoothstep(-0.05, 0.65, h); 
                    vec3 sky = mix(bottom, top, factor);
                    
                    vec3 normWorld = normalize(vWorldPos);
                    float sunDot = max(0.0, dot(normWorld, normalize(sunPos)));
                    float sunGlow = pow(sunDot, 64.0) * 0.45 + pow(sunDot, 8.0) * 0.15;
                    sky += horizon * sunGlow * horizonStrength;

                    float horizonBand = clamp(1.0 - abs(h) * 2.5, 0.0, 1.0);
                    horizonBand = smoothstep(0.0, 1.0, pow(horizonBand, 4.0)) * horizonStrength;
                    sky = mix(sky, horizon, horizonBand);
                    
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
    const starsMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        opacity: { value: 0 },
      },
      vertexShader: `
                uniform float uTime;
                varying float vTwinkle;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = 1.4 * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                    vTwinkle = sin(uTime * 3.0 + position.x * 10.0 + position.z * 10.0) * 0.5 + 0.5;
                }
            `,
      fragmentShader: `
                uniform float opacity;
                varying float vTwinkle;
                void main() {
                    float strength = 1.0 - distance(gl_PointCoord, vec2(0.5));
                    strength = pow(strength, 3.0);
                    gl_FragColor = vec4(vec3(1.0), opacity * vTwinkle * strength);
                }
            `,
      transparent: true,
      depthWrite: false,
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
  }

  setupPostProcessing() {
    this._initPromise.then(() => {
      this.composer = new EffectComposer(this.instance);
      this.renderPass = new RenderPass(this.scene, this._lastCamera || new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);

      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.22,
        0.4,
        0.85
      );
      this.composer.addPass(this.bloomPass);

      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
      this.syncViewportSize(window.innerWidth, window.innerHeight);
    });
  }

  setupClouds() {
    this.cloudLayers = [];
    const loader = new THREE.TextureLoader();
    const cloudsTexture = loader.load('assets/New Textures/clouds.png');
    cloudsTexture.wrapS = cloudsTexture.wrapT = THREE.RepeatWrapping;
    cloudsTexture.magFilter = THREE.LinearFilter;
    cloudsTexture.minFilter = THREE.LinearFilter;

    const cloudGeo1 = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    cloudGeo1.rotateX(-Math.PI / 2);
    const cloudMat1 = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudsTexture },
        uOffset: { value: new THREE.Vector2(0, 0) },
        cloudOpacity: { value: 0.65 },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform vec2 uOffset;
        void main() {
          vUv = (uv * 8.0) + uOffset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D map;
        uniform float cloudOpacity;
        void main() {
          vec4 tex = texture2D(map, vUv);
          if (tex.a < 0.1) discard;
          gl_FragColor = vec4(tex.rgb, tex.a * cloudOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.cloudPlane1 = new THREE.Mesh(cloudGeo1, cloudMat1);
    this.cloudPlane1.position.y = 210;
    this.scene.add(this.cloudPlane1);

    const cloudGeo2 = new THREE.PlaneGeometry(8000, 8000, 1, 1);
    cloudGeo2.rotateX(-Math.PI / 2);
    const cloudMat2 = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudsTexture },
        uOffset: { value: new THREE.Vector2(0.5, 0.5) },
        cloudOpacity: { value: 0.35 },
      },
      vertexShader: `
        varying vec2 vUv;
        uniform vec2 uOffset;
        void main() {
          vUv = (uv * 16.0) + uOffset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D map;
        uniform float cloudOpacity;
        void main() {
          vec4 tex = texture2D(map, vUv);
          if (tex.a < 0.1) discard;
          gl_FragColor = vec4(tex.rgb, tex.a * cloudOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.cloudPlane2 = new THREE.Mesh(cloudGeo2, cloudMat2);
    this.cloudPlane2.position.y = 260;
    this.scene.add(this.cloudPlane2);

    this.cloudLayer1 = { mesh: this.cloudPlane1, mat: cloudMat1, speed: 0.0018 };
    this.cloudLayer2 = { mesh: this.cloudPlane2, mat: cloudMat2, speed: 0.0006 };
    
    this.cloudPlane = this.cloudPlane1;
    this.cloudMat = cloudMat1;
  }

  setupWeatherEffects() {
    const dropCount = 280;
    this.weatherDropCount = dropCount;
    this.weatherDropPositions = new Float32Array(dropCount * 6);
    this.weatherDropSeeds = Array.from({ length: dropCount }, (_, index) => ({
      x: ((index * 16807) % 2147483647) / 2147483647,
      y: ((index * 48271) % 2147483647) / 2147483647,
      z: ((index * 69621) % 2147483647) / 2147483647,
    }));

    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.weatherDropPositions, 3)
    );
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xb8d8ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  updateEnvironmentLighting(
    daylight,
    playerPos = null,
    forcedDepthBlend = null
  ) {
    if (playerPos) {
      const sx = Math.floor(playerPos.x / 4) * 4;
      const sz = Math.floor(playerPos.z / 4) * 4;
      this.sun.position.set(sx + 20, 100, sz + 20);
      this.sun.target.position.set(sx, 0, sz);
      this.sun.target.updateMatrixWorld();
    }

    if (Math.abs(this.daylight - daylight) > 0.001) {
      this.instance.shadowMap.needsUpdate = true;
    }
    
    this.daylight = daylight;
    const clamped = Math.max(0, Math.min(1, daylight));

    let state = 'DAY';
    if (daylight < 0.24) state = 'NIGHT';
    else if (daylight < 0.45) {
      state = this.sun.position.y >= 0 ? 'DAWN' : 'DUSK';
    }

    const colors = ATMOSPHERIC_COLORS[state];
    const top = new THREE.Color(colors.top);
    const bottom = new THREE.Color(colors.bottom);
    const sunCol = new THREE.Color(colors.sun);
    const rainFactor = Math.max(0, Math.min(1, this.weatherIntensity || 0));
    const stormFactor = this.weatherType === 'storm' ? rainFactor : 0;

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

    if (rainFactor > 0) {
      const rainTint = new THREE.Color(0x6f8fb8);
      const rainFloor = new THREE.Color(0x7da9c9);
      top.lerp(rainTint, 0.32 * rainFactor + 0.12 * stormFactor);
      bottom.lerp(rainFloor, 0.28 * rainFactor + 0.1 * stormFactor);
    }

    if (this.skyDome?.material?.uniforms) {
      const uniforms = this.skyDome.material.uniforms;
      if (uniforms.top) uniforms.top.value.copy(top);
      if (uniforms.bottom) uniforms.bottom.value.copy(bottom);
      if (uniforms.sunPos) uniforms.sunPos.value.copy(this.sun.position);
      
      const horizonGlowColor =
        state === 'DUSK'
          ? new THREE.Color(0xff4400)
          : state === 'DAWN'
            ? new THREE.Color(0xff8833)
            : new THREE.Color(0x8ecfff);
      const horizonStr =
        state === 'DAWN' || state === 'DUSK'
          ? 0.95
          : state === 'DAY'
            ? 0.22
            : 0.08; 
      if (uniforms.horizon) {
        uniforms.horizon.value.copy(horizonGlowColor.lerp(new THREE.Color(0x9fb8cc), rainFactor * 0.5));
      }
      if (uniforms.horizonStrength) {
        uniforms.horizonStrength.value = horizonStr * (1 - rainFactor * 0.45);
      }
    }
    this.scene.background.copy(bottom);

    const fogCol = bottom.clone().lerp(new THREE.Color(0xffffff), 0.05);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density =
      computeFogDensity(Math.max(0.04, daylight - rainFactor * 0.16), this.submerged) *
      (1 + rainFactor * 0.35 + stormFactor * 0.2) *
      (this.fogDensityScale || 1.0);

    const intensityFactor = (0.4 + clamped * 1.1) * (1 - rainFactor * 0.22);
    this.sun.intensity = intensityFactor;
    this.sun.color.copy(sunCol);

    this.hemiLight.intensity = (0.8 + clamped * 0.6) * (1 - rainFactor * 0.18);
    this.hemiLight.color.set(top);
    this.hemiLight.groundColor.set(0x6d6253);

    if (this.ambientFill) {
      this.ambientFill.intensity = (0.35 + clamped * 0.2) * (1 - rainFactor * 0.12);
      this.ambientFill.color.copy(sunCol).lerp(new THREE.Color(0xffffff), 0.35);
    }

    if (playerPos) {
      const sx = Math.floor(playerPos.x / 4) * 4;
      const sz = Math.floor(playerPos.z / 4) * 4;
      this.sun.position.set(sx + 20, 100, sz + 20);
      this.sun.target.position.set(sx, 0, sz);
      this.sun.target.updateMatrixWorld();
    }

    if (this.stars) {
      const starOp = Math.max(0, (0.35 - daylight) * 2.5) * (1 - rainFactor * 0.75);
      if (this.stars.material.uniforms && this.stars.material.uniforms.opacity) {
        this.stars.material.uniforms.opacity.value = starOp;
      } else {
        this.stars.material.opacity = starOp;
      }
      this.stars.visible = starOp > 0.01;
    }
    if (this.moonMesh && this.moonGlow) {
      const moonOp = Math.max(0, (0.32 - daylight) * 1.8) * (1 - rainFactor * 0.4);
      this.moonMesh.material.opacity = moonOp;
      this.moonGlow.material.opacity = moonOp * 0.4;
      this.moonMesh.visible = moonOp > 0.01;
      this.moonGlow.visible = this.moonMesh.visible;
    }
  }

  setDaylightLevel(daylight) {
    this.daylight = Math.max(0, Math.min(1, daylight));
    this.sun.intensity = 0.4 + this.daylight * 1.1;
    this.hemiLight.intensity = 0.8 + this.daylight * 0.6;
    if (this.ambientFill) {
      this.ambientFill.intensity = 0.35 + this.daylight * 0.2;
    }

    const dayTop = new THREE.Color(ATMOSPHERIC_COLORS.DAY.top);
    const dayBottom = new THREE.Color(ATMOSPHERIC_COLORS.DAY.bottom);
    const nightTop = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.top);
    const nightBottom = new THREE.Color(ATMOSPHERIC_COLORS.NIGHT.bottom);

    const skyTop = dayTop.clone().lerp(nightTop, 1 - this.daylight);
    const skyBottom = dayBottom.clone().lerp(nightBottom, 1 - this.daylight);

    if (this.skyDome?.material?.uniforms) {
      if (this.skyDome.material.uniforms.top) this.skyDome.material.uniforms.top.value.copy(skyTop);
      if (this.skyDome.material.uniforms.bottom) this.skyDome.material.uniforms.bottom.value.copy(skyBottom);
    }

    this.scene.fog.color.copy(skyBottom);
    this.scene.fog.density =
      computeFogDensity(this.daylight, this.submerged) *
      (this.fogDensityScale || 1.0);

    if (this.stars) {
      const starOp = Math.max(0, (0.45 - this.daylight) * 1.5);
      if (this.stars.material.uniforms && this.stars.material.uniforms.opacity) {
        this.stars.material.uniforms.opacity.value = starOp;
      } else {
        this.stars.material.opacity = starOp;
      }
      this.stars.visible = starOp > 0.05;
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

  setWeatherState(type = 'clear', intensity = 0) {
    this.weatherType = type;
    this.weatherIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
  }

  setUnderwaterState(submerged) {
    this.submerged = Boolean(submerged);
    if (submerged) {
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
    this._lastCamera = camera;
    if (this.skyDome) this.skyDome.position.copy(camera.position);
    if (this.stars) this.stars.position.copy(camera.position);

    if (this.moonMesh && this.moonGlow) {
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
    const timeSec = now / 1000;
    const delta = Math.max(
      0,
      Math.min(0.05, (now - this.lastCloudUpdateMs) / 1000)
    );
    this.lastCloudUpdateMs = now;

    try {
      if (this.skyDome?.material?.uniforms?.uTime) {
        this.skyDome.material.uniforms.uTime.value = timeSec;
      }
      if (this.stars?.material?.uniforms?.uTime) {
        this.stars.material.uniforms.uTime.value = timeSec;
      }
    } catch (e) {}

    if (this.cloudLayer1?.mat?.uniforms?.uOffset) {
      this.cloudLayer1.mat.uniforms.uOffset.value.x += delta * (this.cloudLayer1.speed || 0.001);
      this.cloudLayer1.mat.uniforms.cloudOpacity.value =
        Math.min(1, this.baseCloudOpacity + this.weatherIntensity * 0.2);
      
      if (this.cloudLayer1.mesh) {
        this.cloudLayer1.mesh.position.x = camera.position.x;
        this.cloudLayer1.mesh.position.z = camera.position.z;
      }
    }
    
    if (this.cloudLayer2?.mat?.uniforms?.uOffset) {
      this.cloudLayer2.mat.uniforms.uOffset.value.x += delta * (this.cloudLayer2.speed || 0.0005);
      this.cloudLayer2.mat.uniforms.cloudOpacity.value =
        Math.min(0.8, this.baseCloudOpacity * 0.54 + this.weatherIntensity * 0.18);
      
      if (this.cloudLayer2.mesh) {
        this.cloudLayer2.mesh.position.x = camera.position.x;
        this.cloudLayer2.mesh.position.z = camera.position.z;
      }
    }

    if (this.rainLines?.geometry?.attributes?.position && camera) {
      const rainActive =
        !this.submerged &&
        this.weatherIntensity > 0.08 &&
        (this.weatherType === 'rain' || this.weatherType === 'storm');
      this.rainLines.visible = rainActive;
      this.rainLines.material.opacity = rainActive
        ? 0.12 + this.weatherIntensity * 0.22
        : 0;

      if (rainActive) {
        const range = 28 + this.weatherIntensity * 10;
        const dropLength = this.weatherType === 'storm' ? 2.6 : 1.9;
        const rainSpeed = this.weatherType === 'storm' ? 1.8 : 1.2;
        const positions = this.weatherDropPositions;
        const centerX = camera.position.x;
        const centerY = camera.position.y + 10;
        const centerZ = camera.position.z;

        for (let i = 0; i < this.weatherDropCount; i++) {
          const seed = this.weatherDropSeeds[i];
          const idx = i * 6;
          const drift = timeSec * this.weatherWind.x * 0.8;
          const sway = timeSec * this.weatherWind.y * 0.45;
          const px = centerX + (seed.x - 0.5) * range + drift;
          const pz = centerZ + (seed.z - 0.5) * range + sway;
          const fall = ((timeSec * rainSpeed + seed.y * 9.0) % 1) * 18;
          const topY = centerY + 8 - fall;

          positions[idx] = px;
          positions[idx + 1] = topY;
          positions[idx + 2] = pz;
          positions[idx + 3] = px + this.weatherWind.x * 0.18;
          positions[idx + 4] = topY - dropLength;
          positions[idx + 5] = pz + this.weatherWind.y * 0.18;
        }

        this.rainLines.geometry.attributes.position.needsUpdate = true;
      }
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
      this.instance.shadowMap.type = THREE.PCFShadowMap;
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
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

    if (settings.resolutionScale !== undefined) {
      this.setResolutionScale(settings.resolutionScale);
    }

    if (settings.cloudOpacity !== undefined) {
      this.baseCloudOpacity = settings.cloudOpacity;
      if (this.cloudMat?.uniforms?.cloudOpacity) {
        this.cloudMat.uniforms.cloudOpacity.value = settings.cloudOpacity;
      }
      if (this.cloudLayer1?.mat?.uniforms?.cloudOpacity) {
        this.cloudLayer1.mat.uniforms.cloudOpacity.value = settings.cloudOpacity;
      }
      if (this.cloudLayer2?.mat?.uniforms?.cloudOpacity) {
        this.cloudLayer2.mat.uniforms.cloudOpacity.value = settings.cloudOpacity;
      }
    }

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

  dispose() {
    window.removeEventListener('resize', this.onResizeHandler);
    
    // Recursive disposal of scene
    this.scene.traverse((object) => {
      if (object.isMesh || object.isPoints || object.isLine) {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      }
    });

    if (this.composer) {
      this.composer.passes.forEach(pass => {
        if (pass.dispose) pass.dispose();
      });
    }

    if (this.instance) {
      this.instance.dispose();
      if (this.instance.domElement && this.instance.domElement.parentNode) {
        this.instance.domElement.parentNode.removeChild(this.instance.domElement);
      }
    }
  }
}
