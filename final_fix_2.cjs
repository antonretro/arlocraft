const fs = require('fs');
const path = 'src/engine/Game.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove the crashing call
content = content.replace(/this\.updateDebugOverlay\(delta\);/g, '// updateDebugOverlay removed to prevent crash');

// 2. Add showOnScreenError helper before the final closing brace
if (!content.includes('showOnScreenError')) {
    content = content.replace(/saveSettings\(\) \{[\s\S]*?\}\s*\}/, (match) => {
        return match.replace('}', '}\n\n    showOnScreenError(msg) {\n        const div = document.createElement("div");\n        div.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:red;color:white;padding:20px;z-index:100000;font-family:sans-serif;border-radius:10px;box-shadow:0 0 20px rgba(0,0,0,0.5);";\n        div.innerHTML = "<b>CRITICAL ERROR:</b><br/>" + msg + "<br/><br/><button onclick=\'location.reload()\'>Reload</button>";\n        document.body.appendChild(div);\n    }\n}');
    });
}

// 3. Improve init error handling
content = content.replace(/this\.init\(\)\.catch\(e => \{ console\.error\("\[ArloCraft\] Init Failure:", e\); \}\);/, 'this.init().catch(e => { console.error("[ArloCraft] Init Failure:", e); if (this.showOnScreenError) this.showOnScreenError(e.message); });');

fs.writeFileSync(path, content, 'utf8');
console.log('Final fix 2 applied');
