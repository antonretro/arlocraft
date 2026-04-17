const fs = require('fs');
let c = fs.readFileSync('src/ui/HUD.js','utf8');
if (!c.includes('const itemTextureModules')) {
    const search = "import { CraftingSystem } from '../engine/CraftingSystem.js';";
    const insert = "\n\nconst itemTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/item/*.png', { eager: true, query: '?url' });\nconst blockTextureModules = import.meta.glob('../Igneous 1.19.4/assets/minecraft/textures/block/*.png', { eager: true, query: '?url' });";
    c = c.replace(search, search + insert);
    fs.writeFileSync('src/ui/HUD.js', c);
    console.log('ADDED');
} else {
    console.log('ALREADY THERE');
}
