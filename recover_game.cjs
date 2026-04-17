const fs = require('fs');
const path = 'src/engine/Game.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Imports
if (!content.includes('SkinLoader')) {
    content = content.replace("import LZString from 'lz-string';", "import LZString from 'lz-string';\nimport { SkinLoader } from '../utils/SkinLoader.js';");
}

// 2. Constructor vars
if (!content.includes('this.skinLoader')) {
    content = content.replace("this.screenShake = 0;", "this.screenShake = 0;\n        this.skinLoader = new SkinLoader();\n        this.bobCycle = 0;");
}

// 3. Init logic
content = content.replace(/this\.init\(\);/, 'this.init().catch(e => { console.error("[ArloCraft] Init Failure:", e); if (this.showOnScreenError) this.showOnScreenError(e.message); });');

// 4. setupPlayerVisual overhaul
const oldVisual = /setupPlayerVisual\(\)\s*\{[\s\S]*?group\.visible = false;/;
const newVisual = `setupPlayerVisual() {
        const group = new THREE.Group();
        this.playerParts = {};
        const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x7289a2 });
        const darkMaterial = new THREE.MeshLambertMaterial({ color: 0x425566 });
        const legGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
        legGeo.translate(0, -0.375, 0); 
        this.playerParts.legL = new THREE.Mesh(legGeo, darkMaterial);
        this.playerParts.legL.position.set(-0.125, 0.75, 0);
        group.add(this.playerParts.legL);
        this.playerParts.legR = new THREE.Mesh(legGeo, darkMaterial);
        this.playerParts.legR.position.set(0.125, 0.75, 0);
        group.add(this.playerParts.legR);
        const armGeo = new THREE.BoxGeometry(0.25, 0.75, 0.25);
        armGeo.translate(0, -0.375, 0);
        this.playerParts.armL = new THREE.Mesh(armGeo, darkMaterial);
        this.playerParts.armL.position.set(-0.375, 1.5, 0);
        group.add(this.playerParts.armL);
        this.playerParts.armR = new THREE.Mesh(armGeo, darkMaterial);
        this.playerParts.armR.position.set(0.375, 1.5, 0);
        group.add(this.playerParts.armR);
        this.playerParts.torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), bodyMaterial);
        this.playerParts.torso.position.set(0, 1.125, 0);
        group.add(this.playerParts.torso);
        this.playerParts.head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), bodyMaterial);
        this.playerParts.head.position.set(0, 1.75, 0);
        group.add(this.playerParts.head);
        const faceTexture = new THREE.TextureLoader().load('arlo_real.png');
        faceTexture.magFilter = THREE.NearestFilter;
        this.playerParts.face = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.48), new THREE.MeshBasicMaterial({ map: faceTexture, transparent: true }));
        this.playerParts.face.position.set(0, 1.75, 0.252);
        group.add(this.playerParts.face);
        group.rotation.y = Math.PI;
        group.visible = false;`;
content = content.replace(oldVisual, newVisual);

// 5. bindEvents
if (!content.includes('this.setupSkinListeners()')) {
    content = content.replace("this.setupUI();", "this.setupUI();\n        this.setupSkinListeners();");
}

// 6. init() calls
if (!content.includes('this.initDebugOverlay()')) {
    content = content.replace("this.hud.init();", "this.hud.init();\n        this.initDebugOverlay();");
}

// 7. animate() calls
if (!content.includes('this.animatePlayer(delta)')) {
    content = content.replace("this.updateSurvivalSystems(delta);", "this.updateSurvivalSystems(delta);\n            this.animatePlayer(delta);\n            this.updateDebugHUD(delta);");
}

// 8. Methods Injection (BEFORE final brace)
const helperMethods = `
    setupSkinListeners() {
        const btn = document.getElementById('btn-update-skin');
        const input = document.getElementById('setting-player-skin');
        if (!btn || !input) return;
        const apply = () => {
            const user = input.value.trim(); if (!user) return;
            btn.textContent = '...'; btn.disabled = true;
            this.updatePlayerSkin(user).finally(() => { btn.textContent = 'Apply'; btn.disabled = false; });
        };
        btn.onclick = apply;
        if (this.settings.skinUsername) { input.value = this.settings.skinUsername; this.updatePlayerSkin(this.settings.skinUsername); }
    }
    async updatePlayerSkin(username) {
        if (!this.playerParts) return;
        try {
            const { materials } = await this.skinLoader.loadSkin(username);
            const p = this.playerParts;
            if (materials.head) p.head.material = materials.head;
            if (materials.torso) p.torso.material = materials.torso;
            if (materials.armR) p.armR.material = materials.armR;
            if (materials.armL) p.armL.material = materials.armL;
            if (materials.legR) p.legR.material = materials.legR;
            if (materials.legL) p.legL.material = materials.legL;
            if (p.face) p.face.visible = false;
            if (this.hand && this.hand.arm && materials.armR) this.hand.arm.material = materials.armR;
            const hudIcon = document.getElementById('arlo-face-image');
            if (hudIcon) hudIcon.src = 'https://minotar.net/avatar/' + username + '/64';
            this.settings.skinUsername = username; this.saveSettings();
        } catch (e) { console.error(e); }
    }
    animatePlayer(delta) {
        if (!this.playerParts || !this.hasStarted || this.isPaused) return;
        const speed = Math.sqrt(this.physics.velocity.x**2 + this.physics.velocity.z**2);
        if (speed > 0.05) {
            const angle = Math.sin(this.bobCycle || 0) * 0.45;
            this.playerParts.legR.rotation.x = angle; this.playerParts.legL.rotation.x = -angle;
            this.playerParts.armR.rotation.x = -angle * 1.1; this.playerParts.armL.rotation.x = angle * 1.1;
            this.bobCycle = (this.bobCycle || 0) + delta * (this.physics.isSprinting ? 12 : 8);
        } else {
            this.bobCycle = THREE.MathUtils.lerp(this.bobCycle || 0, 0, delta * 5);
        }
    }
    initDebugOverlay() {
        let o = document.getElementById('debug-overlay');
        if (!o) { o = document.createElement('pre'); o.id = 'debug-overlay'; document.body.appendChild(o); }
        o.style.cssText = 'position:fixed;top:10px;left:10px;z-index:1000000;background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;padding:12px;border:2px solid #0f0;pointer-events:none;';
        o.innerHTML = '<div id="debug-ticker">Initializing...</div>';
    }
    updateDebugHUD(delta) {
        const t = document.getElementById('debug-ticker'); if (!t) return;
        t.textContent = 'FPS: ' + Math.round(1/Math.max(0.001,delta)) + ' | POS: ' + this.physics.position.x.toFixed(1) + ',' + this.physics.position.z.toFixed(1);
    }
    showOnScreenError(m) {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:red;color:white;padding:20px;z-index:1000001;';
        d.innerHTML = 'ERROR: ' + m + '<br/><button onclick="location.reload()">Reload</button>';
        document.body.appendChild(d);
    }
    saveSettings() { localStorage.setItem('arlocraft-settings', JSON.stringify(this.settings)); }
`;

if (!content.includes('setupSkinListeners')) {
    content = content.trim();
    // Replace the final '}' with the helpers and a new closing brace
    content = content.replace(/\s*\}\s*$/, helperMethods + "\n}");
}

fs.writeFileSync(path, content, 'utf8');
console.log('Recovery script applied successfully');
