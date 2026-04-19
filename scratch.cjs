const fs = require('fs');
let c = fs.readFileSync('src/ui/HUD.js','utf8');
const p1 = c.indexOf('// DELETED legacy iconMap // {');
const p2 = c.indexOf("scatter_blaster: 'icons/items/static_bow.png'");
if (p1 !== -1 && p2 !== -1) {
    const end = c.indexOf('};', p2) + 2;
    c = c.slice(0, p1) + c.slice(end);
    fs.writeFileSync('src/ui/HUD.js', c);
    console.log('CLEANED');
} else {
    console.log('NOT FOUND');
}
