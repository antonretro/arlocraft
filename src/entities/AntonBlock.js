import * as THREE from 'three';
import { MobEntity } from './MobEntity.js';

/**
 * AntonBlock: The ultimate anti-virus ally.
 * Can be commanded, petted, and fed to grow stronger.
 */
export class AntonBlock extends MobEntity {
    constructor(game, config, x, y, z) {
        super(game, config, x, y, z);
        this.isAlly = true;
        this.morale = 100;
        this.state = 'FOLLOW'; // FOLLOW, STAY
        
        // Custom Anton Texture (Using the provided face)
        const loader = new THREE.TextureLoader();
        const texture = loader.load('faces/anton_happy.png');
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        
        this.material.map = texture;
        this.material.color.setHex(0xffffff); // Clear the tinted color
        this.material.needsUpdate = true;
    }

    pet() {
        if (this.dead) return;
        this.morale = Math.min(200, this.morale + 20);
        
        // Sparkle/Heart Effect (Console log for now, can add particles later)
        console.log("Anton feels loved!");
        
        // Happy jump animation
        this.velocity.y = 4;
        
        // UI Notification or sound would go here
    }

    feed(foodItem) {
        if (this.dead || !foodItem) return;
        const nutrition = foodItem.foodVal || 2;
        this.hp = Math.min(this.maxHp, this.hp + nutrition * 2);
        this.morale = Math.min(200, this.morale + 10);
        
        // Eating jump
        this.velocity.y = 2.5;
        console.log(`Anton ate ${foodItem.name}!`);
    }

    update(delta) {
        if (this.dead) return;

        // Face player always
        const cam = this.game.camera.instance;
        this.mesh.lookAt(cam.position.x, this.mesh.position.y, cam.position.z);

        const distToPlayer = this.mesh.position.distanceTo(cam.position);

        if (this.state === 'FOLLOW') {
            if (distToPlayer > 18) {
                // Teleport if too far
                this.mesh.position.set(cam.position.x - 2, cam.position.y, cam.position.z - 2);
            } else if (distToPlayer > 4) {
                const dir = new THREE.Vector3().subVectors(cam.position, this.mesh.position).normalize();
                this.mesh.position.addScaledVector(dir, this.config.speed * delta);
            }
        }

        // Snap to terrain
        const floorY = this.game.world.getTerrainHeight(this.mesh.position.x, this.mesh.position.z);
        if (this.mesh.position.y > floorY + 1) {
            this.velocity.y -= 9.8 * delta;
        } else {
            this.mesh.position.y = floorY + 0.6;
            this.velocity.y = Math.max(0, this.velocity.y);
        }
        this.mesh.position.y += this.velocity.y * delta;
    }
}

