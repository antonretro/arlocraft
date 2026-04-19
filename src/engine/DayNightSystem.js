import * as THREE from 'three';

const SUN_RADIUS  = 380;
const MOON_RADIUS = 380;

export class DayNightSystem {
    constructor(renderer, world, features) {
        this.renderer = renderer;
        this.world = world;
        this.features = features;
        this.timeOfDay = 0.3;
        this.dayDurationSeconds = 420;

        this._setupSunMoonPlanes();
    }

    _setupSunMoonPlanes() {
        const scene = this.renderer?.scene;
        if (!scene) return;

        const planeGeo = new THREE.PlaneGeometry(18, 18);

        const loadTex = (url, fallbackColor, cb) => {
            const mat = new THREE.MeshBasicMaterial({
                color: fallbackColor, transparent: true, opacity: 1.0,
                depthWrite: false, side: THREE.DoubleSide
            });
            const img = new Image();
            img.onload = () => {
                const tex = new THREE.CanvasTexture(img);
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true;
            };
            img.src = url;
            cb(mat);
        };

        loadTex('/textures/sky/sun.png', 0xfffde8, (mat) => {
            this.sunPlane = new THREE.Mesh(planeGeo, mat);
            this.sunPlane.renderOrder = -1;
            scene.add(this.sunPlane);
        });

        loadTex('/textures/sky/moon.png', 0xddeeff, (mat) => {
            mat.opacity = 0;
            this.moonPlane = new THREE.Mesh(planeGeo.clone(), mat);
            this.moonPlane.renderOrder = -1;
            scene.add(this.moonPlane);
        });
    }

    update(delta, getPlayerPosition) {
        this.timeOfDay = (this.timeOfDay + (delta / this.dayDurationSeconds)) % 1;
        // angle 0 = sunrise, PI/2 = noon, PI = sunset, 3PI/2 = midnight
        const angle = (this.timeOfDay * Math.PI * 2) - (Math.PI / 2);
        const sunHeight = Math.sin(angle);
        const sunDistance = 110;

        this.renderer.sun.position.set(
            Math.cos(angle) * sunDistance,
            sunHeight * sunDistance,
            70
        );

        const daylight = Math.max(0.08, Math.min(1, (sunHeight + 0.3)));
        this.renderer.setDaylightLevel(daylight);

        const cam = this.renderer?.camera ?? this.renderer?._lastCamera;
        const camPos = cam ? cam.position : new THREE.Vector3(0, 64, 0);

        if (this.sunPlane) {
            const sx = Math.cos(angle) * SUN_RADIUS;
            const sy = Math.sin(angle) * SUN_RADIUS;
            this.sunPlane.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
            this.sunPlane.lookAt(camPos);
            const isDay = sunHeight > -0.1;
            this.sunPlane.material.opacity = isDay ? Math.min(1, (sunHeight + 0.1) * 5) : 0;
            this.sunPlane.visible = this.sunPlane.material.opacity > 0.01;
        }

        if (this.moonPlane) {
            // Moon is opposite arc from sun
            const mx = Math.cos(angle + Math.PI) * MOON_RADIUS;
            const my = Math.sin(angle + Math.PI) * MOON_RADIUS;
            this.moonPlane.position.set(camPos.x + mx, camPos.y + my, camPos.z);
            this.moonPlane.lookAt(camPos);
            const isNight = sunHeight < 0.1;
            this.moonPlane.material.opacity = isNight ? Math.min(1, (-sunHeight + 0.1) * 5) : 0;
            this.moonPlane.visible = this.moonPlane.material.opacity > 0.01;
        }

        if (this.features.dynamicLighting) {
            const pos = getPlayerPosition?.();
            let depthBlend = 0;
            if (pos) {
                const surfaceY = this.world.getColumnHeight(pos.x, pos.z);
                const relativeDepth = surfaceY - pos.y;
                depthBlend = Math.max(0, Math.min(1, relativeDepth / 16));
            }
            this.renderer.updateEnvironmentLighting(daylight, pos, depthBlend);
        }
    }
}
