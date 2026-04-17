const fs = require('fs');
const path = 'src/engine/Game.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Rotation Fix
const oldVisual = `        this.playerParts.face.position.set(0, 1.75, 0.252);
        group.add(this.playerParts.face);

        group.visible = false;
        this.playerVisual = group;`;
const newVisual = `        this.playerParts.face.position.set(0, 1.75, 0.252);
        group.add(this.playerParts.face);

        // Flipped 180 deg to match game forward direction
        group.rotation.y = Math.PI;

        group.visible = false;
        this.playerVisual = group;`;
content = content.replace(oldVisual, newVisual);

// 2. Init Calls
const oldInit = `this.hud.init();
        this.initPerfPanel();`;
const newInit = `this.hud.init();
        this.initDebugOverlay();
        this.setupSkinListeners();
        this.initPerfPanel();`;
content = content.replace(oldInit, newInit);

// 3. Animate Loop Calls
const oldAnimate = `            this.world.update(playerPos, delta);
            this.profiler.worldMs = performance.now() - worldStart;
            this.updateSurvivalSystems(delta);`;
const newAnimate = `            this.world.update(playerPos, delta);
            this.profiler.worldMs = performance.now() - worldStart;
            this.updateSurvivalSystems(delta);
            this.animatePlayer(delta);
            this.updateDebugHUD(delta);
            
            // Bob cycle for limb swinging
            const speed = Math.sqrt(this.physics.velocity.x**2 + this.physics.velocity.z**2);
            if (speed > 0.01) {
                this.bobCycle = (this.bobCycle || 0) + delta * (this.physics.isSprinting ? 12 : 8);
            } else {
                this.bobCycle = (this.bobCycle || 0) * (1 - delta * 5);
            }`;
content = content.replace(oldAnimate, newAnimate);

fs.writeFileSync(path, content, 'utf8');
console.log('Edits applied successfully');
