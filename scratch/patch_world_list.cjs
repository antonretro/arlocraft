const fs = require('fs');
const path = 'c:/Users/Anthony/arlocraft/src/engine/Game.js';
let content = fs.readFileSync(path, 'utf8');
let lines = content.split('\n');

const newMethod = `    renderWorldList() {
        const list = document.getElementById('world-list-container');
        if (!list) return;
        list.innerHTML = '';

        const slotLabel = document.getElementById('create-slot-label');
        if (slotLabel) slotLabel.textContent = this.selectedWorldSlot.toUpperCase();

        const slotIcons = [
            'icons/items/grass.png',
            'icons/items/dirt.png',
            'icons/items/sand.png',
            'icons/items/wood.png',
            'icons/items/leaves.png'
        ];

        for (const [idx, slotId] of this.getWorldSlotIds().entries()) {
            const card = document.createElement('div');
            card.className = 'ni-world-card';
            if (slotId === this.selectedWorldSlot) card.classList.add('active');
            
            const summary = this.readWorldSlotSummary(slotId);
            const slotIcon = slotIcons[idx % slotIcons.length];
            
            if (summary?.exists) {
                const when = summary.savedAt ? new Date(summary.savedAt).toLocaleDateString() : 'N/A';
                card.innerHTML = \`
                    <div class="ni-world-card-icon">
                        <img src="\${slotIcon}" style="width: 32px; height: 32px; image-rendering: pixelated;" />
                    </div>
                    <div class="ni-world-name">\${slotId.toUpperCase()}</div>
                    <div class="ni-world-meta">\${summary.mode} · Seed: \${summary.seed}</div>
                    <div class="ni-world-meta">\${when}</div>
                \`;
            } else {
                card.innerHTML = \`
                    <div class="ni-world-card-icon" style="opacity: 0.4; filter: grayscale(1);">
                        <img src="\${slotIcon}" style="width: 32px; height: 32px; image-rendering: pixelated;" />
                    </div>
                    <div class="ni-world-name" style="opacity: 0.5;">\${slotId.toUpperCase()}</div>
                    <div class="ni-world-meta">New Frontier</div>
                    <div class="ni-world-meta">Empty Space</div>
                \`;
            }

            card.addEventListener('click', () => this.selectWorldSlot(slotId));
            list.appendChild(card);
        }
        this.refreshTitleMenuState();
    }`;

// Replace lines 290 to 326 (0-indexed: 289 to 325)
const start = 289;
const count = 326 - 290 + 1;
lines.splice(start, count, newMethod);

fs.writeFileSync(path, lines.join('\n'));
console.log('Successfully updated renderWorldList via line indices.');
