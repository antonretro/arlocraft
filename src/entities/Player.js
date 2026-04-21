import * as THREE from 'three';

/**
 * Player Entity
 * Owns the 3D representation, animation state, and skin application for the local player.
 */
export class Player {
    constructor(game) {
        this.game = game;
        this.mesh = new THREE.Group();
        this.parts = {};
        this.bobCycle = 0;

        this.setupVisuals();
        this.game.renderer.scene.add(this.mesh);
    }

    setupVisuals() {
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x7289a2 });
        const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x425566 });

        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.78, 0.9, 0.38),
            bodyMaterial
        );
        torso.position.set(0, 0.95, 0);
        this.mesh.add(torso);

        const legL = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.75, 0.28),
            darkMaterial
        );
        legL.position.set(-0.18, 0.36, 0);
        this.mesh.add(legL);

        const legR = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.75, 0.28),
            darkMaterial
        );
        legR.position.set(0.18, 0.36, 0);
        this.mesh.add(legR);

        const armL = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.72, 0.22),
            darkMaterial
        );
        armL.position.set(-0.52, 1.0, 0);
        this.mesh.add(armL);

        const armR = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.72, 0.22),
            darkMaterial
        );
        armR.position.set(0.52, 1.0, 0);
        this.mesh.add(armR);

        // --- Blob Shadow ---
        const shadowGeo = new THREE.CircleGeometry(0.45, 16);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.005;
        this.mesh.add(shadow);

        const headGroup = new THREE.Group();
        headGroup.position.set(0, 1.72, 0);

        const head = new THREE.Mesh(
            new THREE.BoxGeometry(0.62, 0.62, 0.62),
            bodyMaterial
        );
        headGroup.add(head);

        const facePath = 'arlo_real.png';
        const faceTexture = new THREE.TextureLoader().load(facePath);
        faceTexture.magFilter = THREE.NearestFilter;
        faceTexture.minFilter = THREE.NearestFilter;
        const facePlane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.56, 0.56),
            new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true })
        );
        facePlane.position.set(0, 0, 0.322);
        headGroup.add(facePlane);

        this.mesh.add(headGroup);

        this.parts = {
            torso,
            head,
            headGroup,
            armL,
            armR,
            legL,
            legR,
            face: facePlane,
            shadow
        };

        this.mesh.visible = false; // Hidden in 1st person by default
    }

    update(delta, velocity, isGrounded, isSprinting, inWater, viewPitch) {
        const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
        
        // Update Bob Cycle
        if (isGrounded && speed > 0.1) {
            const multiplier = isSprinting ? 12.0 : 8.5;
            this.bobCycle += delta * multiplier;
        } else if (inWater) {
            this.bobCycle += delta * 3.5;
        } else {
            this.bobCycle = THREE.MathUtils.lerp(this.bobCycle, 0, delta * 3.5);
        }

        // Animate Limbs
        if (speed > 0.05 || inWater) {
            const a = Math.sin(this.bobCycle) * 0.45;
            this.parts.legR.rotation.x = a;
            this.parts.legL.rotation.x = -a;
            this.parts.armR.rotation.x = -a * 1.1;
            this.parts.armL.rotation.x = a * 1.1;
        } else {
            this.parts.legR.rotation.x = THREE.MathUtils.lerp(this.parts.legR.rotation.x, 0, delta * 5);
            this.parts.legL.rotation.x = THREE.MathUtils.lerp(this.parts.legL.rotation.x, 0, delta * 5);
            this.parts.armR.rotation.x = THREE.MathUtils.lerp(this.parts.armR.rotation.x, 0, delta * 5);
            this.parts.armL.rotation.x = THREE.MathUtils.lerp(this.parts.armL.rotation.x, 0, delta * 5);
        }

        // Sync head tilt to view pitch
        if (this.parts.headGroup) {
            this.parts.headGroup.rotation.x = -viewPitch;
        }
    }

    applySkin(materials) {
        if (!this.parts) return;
        
        const partNames = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
        for (const name of partNames) {
            if (materials[name]) {
                this.parts[name].material = materials[name];
                const matArray = Array.isArray(materials[name]) ? materials[name] : [materials[name]];
                matArray.forEach(m => { m.needsUpdate = true; });
            }
        }
        
        if (this.parts.face) this.parts.face.visible = false;
    }

    setVisible(visible) {
        this.mesh.visible = visible;
    }
}
