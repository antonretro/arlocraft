import * as THREE from 'three';

export class Physics {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.isReady = false;
        this.mode = 'SURVIVAL';

        this.position = new THREE.Vector3(0, 2.5, 0);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.forward = new THREE.Vector3();
        this.right = new THREE.Vector3();
        this.moveDir = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);

        this.gravity = -24;
        this.walkSpeed = 6.2;
        this.sprintSpeed = 8.4;
        this.creativeSpeed = 11;
        this.crouchSpeed = 2.8;
        this.jumpSpeed = 7.2;
        this.groundFriction = 18;
        this.airFriction = 3.5;
        this.waterFriction = 6.2;
        this.swimSpeed = 4.8;
        this.swimRiseSpeed = 5.4;
        this.swimSinkSpeed = -4.8;
        this.buoyancy = -0.75;
        this.feetOffset = 0.3;
        this.maxStepHeight = 0.62;
        this.playerRadius = 0.32;
        this.bodyHeight = 1.75;
        this.eyeHeight = 1.32;
        this.currentEyeHeight = 1.32;
        this.isCrouching = false;
        this.voidFallTimer = 0;
        this.autoJumpEnabled = true;
        this.jumpBufferWindow = 0.14;
        this.coyoteWindow = 0.09;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.autoJumpCooldown = 0;
        this.lastSafePosition = new THREE.Vector3(0, 2.5, 0);
        this.tmpRescuePos = new THREE.Vector3();

        // Compatibility shim used elsewhere in the game.
        this.playerBody = {
            translation: () => ({ x: this.position.x, y: this.position.y, z: this.position.z }),
            linvel: () => ({ x: this.velocity.x, y: this.velocity.y, z: this.velocity.z }),
            setTranslation: (p) => this.position.set(p.x, p.y, p.z),
            setLinvel: (v) => this.velocity.set(v.x, v.y, v.z)
        };
    }

    async init() {
        this.isReady = true;
        this.resetPlayer();
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'CREATIVE') this.velocity.y = 0;
    }

    resetPlayer() {
        if (!this.isReady) return;
        const spawn = this.world.getSafeSpawnPoint(0, 0);
        this.position.set(spawn.x, spawn.y, spawn.z);
        this.lastSafePosition.copy(this.position);
        this.velocity.set(0, 0, 0);
        this.voidFallTimer = 0;
    }

    applyKnockback(direction, strength = 2.6, lift = 0.28) {
        if (!direction) return;
        const dir = direction.clone();
        dir.y = 0;
        if (dir.lengthSq() < 0.0001) return;
        dir.normalize();
        this.velocity.x += dir.x * strength;
        this.velocity.z += dir.z * strength;
        this.velocity.y = Math.max(this.velocity.y, lift);
    }

    getGroundYAt(x, z, currentY = this.position.y) {
        return this.world.getGroundYBelow(x, currentY, z) + this.feetOffset;
    }

    isGrounded() {
        return this.position.y <= (this.getGroundYAt(this.position.x, this.position.z, this.position.y) + 0.03);
    }

    resolveHorizontalCollisions() {
        if (this.mode === 'CREATIVE') return;

        const minY = this.position.y - this.feetOffset;
        const maxY = minY + this.bodyHeight;
        const minBlockY = Math.floor(minY);
        const maxBlockY = Math.floor(maxY);

        const minX = Math.floor(this.position.x - this.playerRadius - 0.5);
        const maxX = Math.floor(this.position.x + this.playerRadius + 0.5);
        const minZ = Math.floor(this.position.z - this.playerRadius - 0.5);
        const maxZ = Math.floor(this.position.z + this.playerRadius + 0.5);

        for (let by = minBlockY; by <= maxBlockY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    if (!this.world.isSolidAt(bx, by, bz)) continue;

                    const blockMinY = by - 0.5;
                    const blockMaxY = by + 0.5;
                    if (maxY <= blockMinY || minY >= blockMaxY) continue;

                    const dx = this.position.x - bx;
                    const overlapX = (this.playerRadius + 0.5) - Math.abs(dx);
                    if (overlapX <= 0) continue;

                    const dz = this.position.z - bz;
                    const overlapZ = (this.playerRadius + 0.5) - Math.abs(dz);
                    if (overlapZ <= 0) continue;

                    if (overlapX < overlapZ) {
                        this.position.x += (dx >= 0 ? 1 : -1) * overlapX;
                        this.velocity.x = 0;
                    } else {
                        this.position.z += (dz >= 0 ? 1 : -1) * overlapZ;
                        this.velocity.z = 0;
                    }
                }
            }
        }
    }

    resolveBodyIntersections(iterations = 1) {
        if (this.mode === 'CREATIVE') return;

        for (let iter = 0; iter < iterations; iter++) {
            let corrected = false;

            const minY = this.position.y - this.feetOffset;
            const maxY = minY + this.bodyHeight;
            const minBlockY = Math.floor(minY);
            const maxBlockY = Math.floor(maxY);

            const minX = Math.floor(this.position.x - this.playerRadius - 0.5);
            const maxX = Math.floor(this.position.x + this.playerRadius + 0.5);
            const minZ = Math.floor(this.position.z - this.playerRadius - 0.5);
            const maxZ = Math.floor(this.position.z + this.playerRadius + 0.5);

            for (let by = minBlockY; by <= maxBlockY; by++) {
                for (let bx = minX; bx <= maxX; bx++) {
                    for (let bz = minZ; bz <= maxZ; bz++) {
                        if (!this.world.isSolidAt(bx, by, bz)) continue;

                        const blockMinY = by - 0.5;
                        const blockMaxY = by + 0.5;
                        if (maxY <= blockMinY || minY >= blockMaxY) continue;

                        const dx = this.position.x - bx;
                        const overlapX = (this.playerRadius + 0.5) - Math.abs(dx);
                        if (overlapX <= 0) continue;

                        const dz = this.position.z - bz;
                        const overlapZ = (this.playerRadius + 0.5) - Math.abs(dz);
                        if (overlapZ <= 0) continue;

                        const overlapY = Math.min(maxY - blockMinY, blockMaxY - minY);
                        if (overlapY <= 0) continue;

                        const pushEps = 0.0008;
                        if (overlapY <= overlapX && overlapY <= overlapZ) {
                            const centerY = (minY + maxY) * 0.5;
                            if (centerY >= by) this.position.y += overlapY + pushEps;
                            else this.position.y -= overlapY + pushEps;
                            this.velocity.y = 0;
                        } else if (overlapX <= overlapZ) {
                            this.position.x += (dx >= 0 ? 1 : -1) * (overlapX + pushEps);
                            this.velocity.x = 0;
                        } else {
                            this.position.z += (dz >= 0 ? 1 : -1) * (overlapZ + pushEps);
                            this.velocity.z = 0;
                        }

                        corrected = true;
                    }
                }
            }

            if (!corrected) break;
        }
    }

    canOccupyAt(x, y, z, overrideHeight = null) {
        const height = overrideHeight ?? this.bodyHeight;
        const minY = y - this.feetOffset;
        const maxY = minY + height;
        const minBlockY = Math.floor(minY);
        const maxBlockY = Math.floor(maxY);
        const minX = Math.floor(x - this.playerRadius - 0.5);
        const maxX = Math.floor(x + this.playerRadius + 0.5);
        const minZ = Math.floor(z - this.playerRadius - 0.5);
        const maxZ = Math.floor(z + this.playerRadius + 0.5);

        for (let by = minBlockY; by <= maxBlockY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
                for (let bz = minZ; bz <= maxZ; bz++) {
                    if (!this.world.isSolidAt(bx, by, bz)) continue;

                    const blockMinY = by - 0.5;
                    const blockMaxY = by + 0.5;
                    if (maxY <= blockMinY || minY >= blockMaxY) continue;

                    const dx = x - bx;
                    const overlapX = (this.playerRadius + 0.5) - Math.abs(dx);
                    if (overlapX <= 0) continue;

                    const dz = z - bz;
                    const overlapZ = (this.playerRadius + 0.5) - Math.abs(dz);
                    if (overlapZ <= 0) continue;
                    return false;
                }
            }
        }
        return true;
    }

    shouldAutoJump() {
        if (this.moveDir.lengthSq() < 0.01) return false;
        const ahead = this.playerRadius + 0.48;
        const ax = this.position.x + (this.moveDir.x * ahead);
        const az = this.position.z + (this.moveDir.z * ahead);
        const feetY = this.position.y - this.feetOffset;
        const baseY = Math.floor(feetY + 0.5);

        const obstacleAtFeet = this.world.isSolidAt(ax, baseY, az);
        if (!obstacleAtFeet) return false;

        const headClear1 = !this.world.isSolidAt(ax, baseY + 1, az);
        const headClear2 = !this.world.isSolidAt(ax, baseY + 2, az);
        return headClear1 && headClear2;
    }

    update(delta, input, lookYaw) {
        if (!this.isReady) return;

        const keys = input.keys;
        const inWater = this.world.isPositionInWater(this.position.x, this.position.y, this.position.z);
        const grounded = !inWater && this.mode === 'SURVIVAL' && this.isGrounded();

        let wantsToCrouch = this.mode === 'SURVIVAL' && (keys['ShiftLeft'] || keys['ShiftRight']);
        
        // Ceiling Check (if releasing crouch under a low ceiling, force crouch)
        if (!wantsToCrouch && this.isCrouching) {
            if (!this.canOccupyAt(this.position.x, this.position.y, this.position.z, 1.75)) {
                wantsToCrouch = true;
            }
        }
        
        this.isCrouching = wantsToCrouch;
        
        // Eye Height Interpolation
        const targetEyeHeight = this.isCrouching ? 1.05 : 1.32;
        this.currentEyeHeight = THREE.MathUtils.lerp(this.currentEyeHeight ?? 1.32, targetEyeHeight, delta * 14);
        this.eyeHeight = this.currentEyeHeight;

        // Body Height for collisions
        this.bodyHeight = this.isCrouching ? 1.45 : 1.75;

        const sprinting = this.mode === 'SURVIVAL' && !this.isCrouching && (keys['ControlLeft'] || keys['ControlRight']);
        const speed = this.mode === 'CREATIVE' ? this.creativeSpeed : (this.isCrouching ? this.crouchSpeed : (sprinting ? this.sprintSpeed : this.walkSpeed));

        let inputX = 0;
        let inputZ = 0;
        if (keys['KeyW'] || keys['ArrowUp']) inputZ += 1;
        if (keys['KeyS'] || keys['ArrowDown']) inputZ -= 1;
        if (keys['KeyA'] || keys['ArrowLeft']) inputX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) inputX += 1;

        const yaw = Number.isFinite(lookYaw) ? lookYaw : 0;
        // Keep movement basis aligned with Three.js camera yaw convention.
        this.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
        this.right.crossVectors(this.forward, this.up).normalize();
        this.moveDir.set(0, 0, 0);
        this.moveDir.addScaledVector(this.forward, inputZ);
        this.moveDir.addScaledVector(this.right, inputX);
        if (this.moveDir.lengthSq() > 0) this.moveDir.normalize();

        // Safety check to prevent NaN movement from corrupted inputs or look yaw
        if (!Number.isFinite(this.moveDir.x) || !Number.isFinite(this.moveDir.z)) {
            this.moveDir.set(0, 0, 0);
        }

        const moveSpeed = inWater ? this.swimSpeed : speed;
        const targetX = this.moveDir.x * moveSpeed;
        const targetZ = this.moveDir.z * moveSpeed;

        if (input.consumeKeyPress('Space')) {
            this.jumpBufferTimer = this.jumpBufferWindow;
        } else {
            this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - delta);
        }
        this.coyoteTimer = grounded ? this.coyoteWindow : Math.max(0, this.coyoteTimer - delta);
        this.autoJumpCooldown = Math.max(0, this.autoJumpCooldown - delta);
        
        const friction = inWater ? this.waterFriction : (grounded ? this.groundFriction : this.airFriction);
        const lerpT = Math.min(1, friction * delta);
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetX, lerpT);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetZ, lerpT);

        if (this.mode === 'CREATIVE') {
            let vertical = 0;
            if (keys['Space']) vertical += 1;
            if (keys['ControlLeft'] || keys['ControlRight']) vertical -= 1;
            this.velocity.y = vertical * speed;
        } else {
            if (inWater) {
                let targetY = this.buoyancy;
                if (keys['Space']) {
                    targetY = this.swimRiseSpeed;
                } else if (keys['ShiftLeft'] || keys['ShiftRight'] || keys['ControlLeft'] || keys['ControlRight']) {
                    targetY = this.swimSinkSpeed;
                }
                this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, targetY, delta * 5.8);
            } else if (grounded) {
                if (this.velocity.y < 0) this.velocity.y = 0;
                const bufferedJump = this.jumpBufferTimer > 0 && this.coyoteTimer > 0;
                if (bufferedJump && !this.isCrouching) {
                    this.velocity.y = this.jumpSpeed;
                    this.jumpBufferTimer = 0;
                    this.coyoteTimer = 0;
                } else if (!this.isCrouching && this.autoJumpEnabled && this.autoJumpCooldown <= 0 && this.shouldAutoJump()) {
                    this.velocity.y = this.jumpSpeed;
                    this.autoJumpCooldown = 0.2;
                }
            } else {
                this.velocity.y += this.gravity * delta;
                if (this.velocity.y < -35) this.velocity.y = -35;
            }
        }

        if (this.mode === 'SURVIVAL') {
            const maxHorizontalSpeed = this.sprintSpeed * 1.35;
            const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
            if (horizontalSpeed > maxHorizontalSpeed && horizontalSpeed > 0.0001) {
                const scale = maxHorizontalSpeed / horizontalSpeed;
                this.velocity.x *= scale;
                this.velocity.z *= scale;
            }
            this.velocity.y = Math.max(-30, Math.min(15, this.velocity.y));
        }

        const maxLinearStep = 0.45;
        const maxMove = Math.max(
            Math.abs(this.velocity.x * delta),
            Math.abs(this.velocity.y * delta),
            Math.abs(this.velocity.z * delta)
        );
        const steps = Math.max(1, Math.min(3, Math.ceil(maxMove / maxLinearStep)));
        const stepDelta = delta / steps;

        for (let i = 0; i < steps; i++) {
            const oldX = this.position.x;
            const oldY = this.position.y;
            const oldZ = this.position.z;
            const moveX = this.velocity.x * stepDelta;
            const moveY = this.velocity.y * stepDelta;
            const moveZ = this.velocity.z * stepDelta;

            // 1. Vertical Movement (Gravity/Jump)
            this.position.y += moveY;
            if (this.mode === 'SURVIVAL') {
                if (!this.canOccupyAt(this.position.x, this.position.y, this.position.z)) {
                    this.resolveBodyIntersections(1);
                }
            }

            // 2. Horizontal X
            const preStepX = this.position.x;
            this.position.x += moveX;
            if (this.mode === 'SURVIVAL') {
                if (!this.canOccupyAt(this.position.x, this.position.y, this.position.z)) {
                    // Try stepping up before blocking
                    const groundCurrent = this.getGroundYAt(preStepX, oldZ, oldY);
                    const groundNext = this.getGroundYAt(this.position.x, oldZ, this.position.y);
                    const stepUp = groundNext - groundCurrent;
                    const stepCandidateY = Math.max(this.position.y, groundNext);

                    const canStep = grounded && this.velocity.y <= 0.2;
                    if (canStep && stepUp > 0 && stepUp <= this.maxStepHeight && this.canOccupyAt(this.position.x, stepCandidateY, oldZ)) {
                        this.position.y = stepCandidateY;
                    } else {
                        // Can't step, so block X
                        this.position.x = preStepX;
                        this.velocity.x = 0;
                    }
                } else if (this.isCrouching && grounded && this.velocity.y <= 0) {
                    const groundNext = this.getGroundYAt(this.position.x, oldZ, this.position.y);
                    if (groundNext < this.position.y - 0.3) {
                        this.position.x = preStepX;
                        this.velocity.x = 0;
                    }
                }
            }

            // 3. Horizontal Z
            const preStepZ = this.position.z;
            this.position.z += moveZ;
            if (this.mode === 'SURVIVAL') {
                if (!this.canOccupyAt(this.position.x, this.position.y, this.position.z)) {
                    const groundCurrent = this.getGroundYAt(this.position.x, preStepZ, oldY);
                    const groundNext = this.getGroundYAt(this.position.x, this.position.z, this.position.y);
                    const stepUp = groundNext - groundCurrent;
                    const stepCandidateY = Math.max(this.position.y, groundNext);

                    const canStep = grounded && this.velocity.y <= 0.2;
                    if (canStep && stepUp > 0 && stepUp <= this.maxStepHeight && this.canOccupyAt(this.position.x, stepCandidateY, this.position.z)) {
                        this.position.y = stepCandidateY;
                    } else {
                        // Can't step, so block Z
                        this.position.z = preStepZ;
                        this.velocity.z = 0;
                    }
                } else if (this.isCrouching && grounded && this.velocity.y <= 0) {
                    const groundNext = this.getGroundYAt(this.position.x, this.position.z, this.position.y);
                    if (groundNext < this.position.y - 0.3) {
                        this.position.z = preStepZ;
                        this.velocity.z = 0;
                    }
                }
            }

            // 4. Floor Snapping
            if (this.mode === 'SURVIVAL' && !inWater) {
                const floorY = this.getGroundYAt(this.position.x, this.position.z, this.position.y);
                const allowedSnapY = oldY + this.maxStepHeight + 0.1;
                if (this.position.y < floorY && this.velocity.y <= 0 && floorY <= allowedSnapY) {
                    this.position.y = floorY;
                    if (this.velocity.y < 0) this.velocity.y = 0;
                }
            }

            // --- FINAL SAFETY GUARD ---
            // If position becomes invalid (NaN/Infinity), rescue immediately to last safe spot.
            if (!Number.isFinite(this.position.x) || !Number.isFinite(this.position.y) || !Number.isFinite(this.position.z)) {
                console.warn('[ArloCraft] Physics NaN detected! Rescuing player...');
                this.position.copy(this.lastSafePosition);
                this.velocity.set(0, 0, 0);
            }
        }

        const safeGrounded = this.mode === 'SURVIVAL' && (this.isGrounded() || inWater) && this.position.y > (this.world.deepMinY + 3);
        if (safeGrounded) {
            this.lastSafePosition.copy(this.position);
        }

        const voidY = this.world.deepMinY - 35;
        if (this.position.y < voidY) {
            this.voidFallTimer += delta;
            if (this.voidFallTimer > 0.55) {
                const rescue = this.world.getSafeSpawnPoint(this.position.x, this.position.z);
                this.tmpRescuePos.set(rescue.x, rescue.y, rescue.z);
                if (this.lastSafePosition.y > this.world.deepMinY + 2) {
                    this.tmpRescuePos.lerp(this.lastSafePosition, 0.55);
                }
                this.position.copy(this.tmpRescuePos);
                this.velocity.set(0, 0, 0);
                this.voidFallTimer = 0;
            }
        } else {
            this.voidFallTimer = 0;
        }
    }
}
