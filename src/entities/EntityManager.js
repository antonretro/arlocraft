import * as THREE from 'three';
import { MOBS } from '../data/mobs.js';
import { TOOLS } from '../data/tools.js';
import { MobEntity } from './MobEntity.js';

const entityTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/entity/**/*.png', {
    eager: true,
    query: '?url',
    import: 'default'
});

const entityTextureUrls = new Map(
    Object.entries(entityTextureModules).map(([path, url]) => {
        const normalized = path
            .replace('../Igneous 1.19.4/assets/minecraft/textures/entity/', '')
            .replace(/\.png$/i, '');
        return [normalized, url];
    })
);

function createTextureFromCanvas(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

function createHumanoidBillboardCanvas(image) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const draw = (sx, sy, sw, sh, dx, dy) => {
        ctx.drawImage(image, sx, sy, sw, sh, dx, dy, sw, sh);
    };

    draw(8, 8, 8, 8, 4, 0);     // head front
    draw(20, 20, 8, 12, 4, 8);  // body front
    draw(44, 20, 4, 12, 0, 8);  // right arm front
    draw(44, 20, 4, 12, 12, 8); // left arm mirrored from right arm
    draw(4, 20, 4, 12, 4, 20);  // right leg front
    draw(4, 20, 4, 12, 8, 20);  // left leg mirrored from right leg

    return canvas;
}

export class EntityManager {
    constructor(game) {
        this.game = game;
        this.entities = [];
        this.raycaster = new THREE.Raycaster();
        this.raycaster.firstHitOnly = true;
        this.toolById = new Map(TOOLS.map((tool) => [tool.id, tool]));
        this.attackCooldown = 0;
        this.maxEntities = 18;
        this.comboChain = 0;
        this.comboTimer = 0;
        this.tmpHitMin = new THREE.Vector3();
        this.tmpHitMax = new THREE.Vector3();
        this.tmpHitPoint = new THREE.Vector3();
        this.tmpHitBox = new THREE.Box3();
        this.textureLoader = new THREE.TextureLoader();
        this.loadedTextureCache = new Map();
        this.billboardTextureCache = new Map();
    }

    spawn(typeId, x, y, z) {
        if (this.entities.length >= this.maxEntities) return null;
        const config = MOBS.find(m => m.id === typeId);
        if (!config) return null;

        const entity = new MobEntity(this.game, config, x, y, z);

        const textureUrl = this.resolveTextureUrl(config);
        if (textureUrl && entity.mesh) {
            this.loadEntityTexture(textureUrl, config.textureMode).then((texture) => {
                if (!texture || entity.dead) return;
                entity.applyTexture?.(texture);
            }).catch((error) => {
                console.warn(`[AntonCraft] Failed to load entity texture for ${config.id}:`, error);
            });
        }

        this.entities.push(entity);
        if (entity.mesh?.geometry?.computeBoundsTree && !entity.mesh.geometry.boundsTree) {
            entity.mesh.geometry.computeBoundsTree();
        }
        this.game.renderer.scene.add(entity.mesh);
        return entity;
    }

    resolveTextureUrl(config) {
        if (typeof config.texture === 'string' && config.texture) return config.texture;
        if (typeof config.textureKey === 'string' && config.textureKey) {
            return entityTextureUrls.get(config.textureKey) ?? null;
        }
        return null;
    }

    loadEntityTexture(url, textureMode = 'billboard') {
        const cacheKey = `${textureMode}:${url}`;
        if (this.billboardTextureCache.has(cacheKey)) {
            return Promise.resolve(this.billboardTextureCache.get(cacheKey));
        }

        const loadBaseImage = () => {
            if (this.loadedTextureCache.has(url)) return Promise.resolve(this.loadedTextureCache.get(url));
            return new Promise((resolve, reject) => {
                const img = new Image();
                if (url.startsWith('http')) img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const tex = new THREE.CanvasTexture(img);
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.colorSpace = THREE.SRGBColorSpace;
                    this.loadedTextureCache.set(url, tex);
                    resolve(tex);
                };
                img.onerror = reject;
                img.src = url;
            });
        };

        return loadBaseImage().then((texture) => {
            let finalTexture = texture;
            if (textureMode === 'humanoid_billboard') {
                finalTexture = createTextureFromCanvas(createHumanoidBillboardCanvas(texture.image));
            }
            this.billboardTextureCache.set(cacheKey, finalTexture);
            return finalTexture;
        });
    }

    getAttackDamage(selectedItem) {
        const baseDamage = 4;
        const offhand = this.game?.gameState?.getOffhandItem?.();
        const offhandTool = offhand ? this.toolById.get(offhand.id) : null;
        const offhandBonus = offhandTool ? (offhandTool.damage * 0.25) : 0;
        if (!selectedItem) return baseDamage + offhandBonus;

        const tool = this.toolById.get(selectedItem.id);
        if (!tool) return baseDamage + offhandBonus;
        return baseDamage + (tool.damage * 0.6) + offhandBonus;
    }

    getAttackProfile(selectedItem) {
        const tool = selectedItem ? this.toolById.get(selectedItem.id) : null;
        return {
            tool,
            damage: this.getAttackDamage(selectedItem),
            range: tool?.range ?? (tool?.type === 'ranged' ? 12 : 4),
            cooldown: tool?.cooldown ?? 0.25,
            knockback: tool?.knockback ?? 0.65,
            critChance: tool?.critChance ?? 0.03
        };
    }

    findEntityInCrosshair(camera, maxRange, predicate = null) {
        if (!camera || this.entities.length === 0) return null;

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const ray = this.raycaster.ray;
        let nearest = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const entity of this.entities) {
            if (!entity || entity.dead) continue;
            if (predicate && !predicate(entity)) continue;

            const center = entity.mesh?.position;
            if (!center) continue;

            const half = entity.hitboxHalf ?? entity.hitboxSize ?? null;
            const hx = Math.max(0.2, half?.x ?? 0.45);
            const hy = Math.max(0.4, half?.y ?? 0.9);
            const hz = Math.max(0.2, half?.z ?? 0.45);

            this.tmpHitMin.set(center.x - hx, center.y - hy, center.z - hz);
            this.tmpHitMax.set(center.x + hx, center.y + hy, center.z + hz);
            this.tmpHitBox.set(this.tmpHitMin, this.tmpHitMax);

            const hit = ray.intersectBox(this.tmpHitBox, this.tmpHitPoint);
            if (!hit) continue;

            const dist = hit.distanceTo(ray.origin);
            if (dist > maxRange) continue;
            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearest = entity;
            }
        }

        if (!nearest) return null;
        return { entity: nearest, distance: nearestDistance };
    }

    hasHostileTarget(camera, maxRange) {
        return Boolean(this.findEntityInCrosshair(camera, maxRange, (entity) => !entity.config?.friendly));
    }

    attackFromCamera(camera, selectedItem) {
        if (this.attackCooldown > 0 || this.entities.length === 0) return false;

        const profile = this.getAttackProfile(selectedItem);
        const targetHit = this.findEntityInCrosshair(camera, profile.range, (entity) => !entity.config?.friendly);
        if (!targetHit) return false;
        const target = targetHit.entity;

        const comboBonus = this.comboTimer > 0 ? (Math.min(5, this.comboChain) * 0.08) : 0;
        let damage = profile.damage * (1 + comboBonus);
        const distance = targetHit.distance;

        if ((profile.tool?.type === 'ranged' || profile.tool?.type === 'gun') && distance > (profile.range * 0.72)) {
            damage *= 0.86;
        }

        const critChance = profile.critChance + (comboBonus * 0.03);
        const isCrit = Math.random() < critChance;
        if (isCrit) {
            damage *= 1.75;
            window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: 'CRIT HIT' } }));
        }

        const knockback = profile.knockback * (1 + (comboBonus * 0.65));
        target.takeDamage(damage, camera.position, knockback);
        this.attackCooldown = profile.cooldown;

        this.comboChain = Math.min(8, this.comboChain + 1);
        this.comboTimer = 1.25;
        if (this.comboChain >= 3) {
            window.dispatchEvent(new CustomEvent('action-prompt', { detail: { type: `COMBO x${this.comboChain}` } }));
        }
        return true;
    }

    interactFromCamera(camera, selectedItem) {
        if (this.entities.length === 0) return false;
        const hit = this.findEntityInCrosshair(camera, 4.5, (entity) => entity.config?.friendly);
        if (!hit) return false;
        const target = hit.entity;
        if (!target || !target.isAlly) return false;

        if (selectedItem && selectedItem.foodVal) {
            target.feed(selectedItem);
            return true;
        } else {
            target.pet();
            return true;
        }
    }

    update(delta) {
        if (this.attackCooldown > 0) {
            this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        }
        if (this.comboTimer > 0) {
            this.comboTimer = Math.max(0, this.comboTimer - delta);
            if (this.comboTimer === 0) this.comboChain = 0;
        }

        const playerPos = this.game.camera.instance.position;
        this.entities.forEach((entity) => {
            const farDistanceSq = entity.mesh.position.distanceToSquared(playerPos);
            if (farDistanceSq > 110 * 110) {
                entity.dead = true;
                if (entity.mesh?.geometry?.disposeBoundsTree) entity.mesh.geometry.disposeBoundsTree();
                this.game.renderer.scene.remove(entity.mesh);
                return;
            }
            entity.update(delta);
        });
        this.entities = this.entities.filter((entity) => !entity.dead);
    }

    interactNearbyEntity(position, maxDist) {
        if (!position) return false;
        let best = null;
        let minDist = maxDist;

        for (const entity of this.entities) {
            // Find the closest friendly NPC
            if (entity.config?.friendly && !entity.dead) {
                const dist = entity.mesh.position.distanceTo(position);
                if (dist < minDist) {
                    minDist = dist;
                    best = entity;
                }
            }
        }

        if (best && typeof best.showChat === 'function') {
            best.showChat();
            return true;
        }
        return false;
    }
}
