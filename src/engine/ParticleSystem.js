import * as THREE from 'three';

/**
 * ParticleSystem
 * Handles localized visual effects using a pool of billboarding particles.
 */
export class ParticleSystem {
    constructor(game) {
        this.game = game;
        this.scene = game.renderer.scene;
        this.particles = [];
        this.pool = [];
        
        // Configuration for different particle types
        this.types = {
            EXPLOSION: { color: 0xffaa00, size: 0.15, gravity: -12, drag: 0.94, life: 0.8 },
            SMOKE:     { color: 0x888888, size: 0.2,  gravity: 2.5, drag: 0.92, life: 1.5 },
            HEART:     { color: 0xff4444, size: 0.25, gravity: 4.0, drag: 0.98, life: 2.0 },
            PORTAL:    { color: 0xaa00ff, size: 0.12, gravity: 0,   drag: 0.9,  life: 0.6 },
            CRIT:      { color: 0xffffaa, size: 0.1,  gravity: -10, drag: 0.95, life: 1.0 },
            SNOW:      { color: 0xffffff, size: 0.08, gravity: -5,  drag: 0.9,  life: 0.5 }
        };

        // Shared Geometry
        this.geometry = new THREE.PlaneGeometry(1, 1);
    }

    /**
     * Spawn a burst of particles.
     */
    spawnBurst(pos, typeName = 'EXPLOSION', count = 12, spread = 0.5) {
        const config = this.types[typeName] || this.types.EXPLOSION;
        
        for (let i = 0; i < count; i++) {
            const particle = this.getFromPool();
            
            // Randomize trajectory
            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * spread * 10,
                (Math.random() - 0.2) * spread * 10,
                (Math.random() - 0.5) * spread * 10
            );

            particle.init(pos, vel, config);
            this.particles.push(particle);
        }
    }

    getFromPool() {
        if (this.pool.length > 0) return this.pool.pop();
        return new Particle(this.scene, this.geometry);
    }

    update(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.update(delta, this.game.camera.instance);
            
            if (p.dead) {
                p.hide();
                this.pool.push(p);
                this.particles.splice(i, 1);
            }
        }
    }
}

class Particle {
    constructor(scene, geometry) {
        this.scene = scene;
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.visible = false;
        scene.add(this.mesh);
        
        this.velocity = new THREE.Vector3();
        this.pos = new THREE.Vector3();
        this.dead = true;
    }

    init(pos, vel, config) {
        this.pos.copy(pos);
        this.velocity.copy(vel);
        this.config = config;
        
        this.life = config.life;
        this.maxLife = config.life;
        this.dead = false;
        
        this.material.color.setHex(config.color);
        this.material.opacity = 1;
        
        const s = config.size;
        this.mesh.scale.set(s, s, s);
        this.mesh.position.copy(pos);
        this.mesh.visible = true;
    }

    update(delta, camera) {
        if (this.dead) return;

        this.life -= delta;
        if (this.life <= 0) {
            this.dead = true;
            return;
        }

        // Physics
        this.velocity.y += this.config.gravity * delta;
        this.velocity.multiplyScalar(this.config.drag);
        this.pos.addScaledVector(this.velocity, delta);
        
        // Visuals
        this.mesh.position.copy(this.pos);
        this.material.opacity = this.life / this.maxLife;
        
        // Face camera (billboard)
        this.mesh.quaternion.copy(camera.quaternion);
    }

    hide() {
        this.mesh.visible = false;
    }
}
