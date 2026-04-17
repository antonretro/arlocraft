const fs = require('fs');
const path = 'src/engine/Game.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject into init()
// Look for this.hud.init(); and inject after it
content = content.replace(/this\.hud\.init\(\);/g, 'this.hud.init();\n        this.initDebugOverlay();\n        this.setupSkinListeners();');

// 2. Inject into animate() loop
// Look for this.updateSurvivalSystems(delta); and inject after it
content = content.replace(/this\.updateSurvivalSystems\(delta\);/g, 'this.updateSurvivalSystems(delta);\n            this.animatePlayer(delta);\n            this.updateDebugHUD(delta);\n            \n            // Bob cycle for animation\n            const speed = Math.sqrt(this.physics.velocity.x**2 + this.physics.velocity.z**2);\n            if (!this.bobCycle) this.bobCycle = 0;\n            if (speed > 0.05) {\n                this.bobCycle += delta * (this.physics.isSprinting ? 12 : 8);\n            } else {\n                this.bobCycle = (this.bobCycle || 0) * (1 - delta * 5); \n            }');

// 3. Fix 180 deg rotation
// Look for face position and add rotation after face add
content = content.replace(/group\.add\(this\.playerParts\.face\);/g, 'group.add(this.playerParts.face);\n        group.rotation.y = Math.PI;');

fs.writeFileSync(path, content, 'utf8');
console.log('Final fixes applied via regex');
