const fs = require('fs');
let c = fs.readFileSync('src/ui/HUD.js','utf8');
const p1 = c.indexOf('    getIconPath(itemId) {');
const p2 = c.indexOf('    getGeneratedIconPath(itemId) {');
if (p1 !== -1 && p2 !== -1) {
    const replacement = `    getBlockTextureSet(id) {
        const alias = this.resolveIconAlias(id) || id;
        return {
            all: this.blockTextures[alias] || this.blockTextures[\`\${alias}_all\`],
            top: this.blockTextures[\`\${alias}_top\`],
            side: this.blockTextures[\`\${alias}_side\`],
            front: this.blockTextures[\`\${alias}_front\`],
            bottom: this.blockTextures[\`\${alias}_bottom\`]
        };
    }

    getIconPath(itemId) {
        if (!itemId) return this.getGeneratedIconPath('item');

        const alias = this.resolveIconAlias(itemId) || itemId;
        
        const toolMap = {
            pick_wood: 'wooden_pickaxe',
            sledge_iron: 'iron_axe',
            power_blade: 'iron_sword',
            glitch_saber: 'diamond_sword',
            data_drill: 'iron_pickaxe',
            decoder_wand: 'stick',
            magnet_glove: 'iron_ingot',
            rocket_boots: 'iron_boots',
            static_bow: 'bow',
            apple: 'apple',
            bread: 'bread',
            steak: 'cooked_beef'
        };
        const mcId = toolMap[alias] || alias;

        if (this.itemTextures && this.itemTextures[mcId]) return this.itemTextures[mcId];
        if (this.blockTextures && this.blockTextures[mcId]) return this.blockTextures[mcId];

        return this.getGeneratedIconPath(itemId);
    }\n\n`;
    c = c.slice(0, p1) + replacement + c.slice(p2);
    fs.writeFileSync('src/ui/HUD.js', c);
    console.log('REPLACED');
} else {
    console.log('NOT FOUND');
}
