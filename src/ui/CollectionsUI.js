import { BLOCKS } from '../data/blocks.js';
import { RECIPE_BOOK } from '../data/recipeBook.js';
import { iconService } from './IconService.js';

export class CollectionsUI {
    constructor(gameState) {
        this.gameState = gameState;
        this.activeTab = 'blocklog';
    }

    init() {
        this.cacheRefs();
        this.setupEventListeners();
        this.renderBlocklog();
    }

    cacheRefs() {
        this.refs = {
            tabs: document.querySelectorAll('.ni-inv-tab'),
            sections: document.querySelectorAll('.ni-inv-pane'),
            blocklogList: document.getElementById('blocklog-grid'),
            recipeList: document.getElementById('recipe-list'),
            medalList: document.getElementById('medals-grid')
        };
    }

    setupEventListeners() {
        this.refs.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                if (target) this.switchTab(target);
            });
        });

        window.addEventListener('discovery-block', () => {
            if (this.activeTab === 'blocklog') this.renderBlocklog();
        });
        window.addEventListener('discovery-recipe', () => {
            if (this.activeTab === 'recipes') this.renderRecipes();
        });
    }

    switchTab(tabId) {
        this.activeTab = tabId;

        // Update UI states
        this.refs.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
        this.refs.sections.forEach(s => s.classList.toggle('active', s.id === `tab-${tabId}`));

        // Render appropriate content
        if (tabId === 'blocklog') this.renderBlocklog();
        if (tabId === 'recipes') this.renderRecipes();
        if (tabId === 'medals') this.renderMedals();
    }

    renderBlocklog() {
        const list = this.refs.blocklogList;
        if (!list) return;
        list.innerHTML = '';

        const discovered = this.gameState.discoveredBlocks || new Set();
        BLOCKS.forEach(block => {
            const isKnown = discovered.has(block.id);
            const item = document.createElement('div');
            item.className = `ni-log-item ${isKnown ? '' : 'locked'}`;
            item.title = isKnown ? block.name : 'Unknown Block';

            if (isKnown) {
                const icon = iconService.createItemElement({ id: block.id, count: 1 });
                item.appendChild(icon);
            }
            list.appendChild(item);
        });
    }

    renderRecipes() {
        const list = this.refs.recipeList;
        if (!list) return;
        list.innerHTML = '';

        const discovered = this.gameState.discoveredRecipes || new Set();
        RECIPE_BOOK.forEach(recipe => {
            const isKnown = discovered.has(recipe.id);
            if (!isKnown) return; // Only show discovered recipes for now per original design

            const card = document.createElement('div');
            card.className = 'ni-recipe-card';
            
            const resultId = recipe.result.id;
            const iconContainer = document.createElement('div');
            iconContainer.className = 'ni-recipe-result';
            const icon = iconService.createItemElement({ id: resultId, count: recipe.result.count });
            iconContainer.appendChild(icon);

            const info = document.createElement('div');
            info.className = 'ni-recipe-info';
            info.innerHTML = `<div class="ni-recipe-name">${recipe.name.toUpperCase()}</div><div class="ni-recipe-desc" style="font-size: 0.7rem; color: var(--ni-text-muted);">${this.formatPattern(recipe)}</div>`;
            
            const type = document.createElement('div');
            type.className = 'ni-recipe-type';
            type.style.fontSize = '0.6rem';
            type.style.color = 'var(--ni-blue)';
            type.style.textAlign = 'right';
            type.textContent = recipe.pattern ? 'CRAFT' : 'SHAPELESS';

            card.appendChild(iconContainer);
            card.appendChild(info);
            card.appendChild(type);
            list.appendChild(card);
        });
    }

    formatPattern(recipe) {
        if (!recipe.pattern) return recipe.ingredients?.join(', ') || 'Various items';
        return recipe.pattern.map(row => row.join(', ')).join(' / ');
    }

    renderMedals() {
        const list = this.refs.medalList;
        if (!list) return;
        list.innerHTML = '';

        const medals = this.gameState.unlockedAchievements || new Set();
        const MEDAL_DEFS = [
            { id: 'first_mine', name: 'Breaker', desc: 'Mine your first block.' },
            { id: 'crafted', name: 'Artisan', desc: 'Craft something special.' },
            { id: 'explorer', name: 'Wayfarer', desc: 'Travel 100 blocks.' },
            { id: 'survivor', name: 'Survivor', desc: 'Survive a full day cycle.' }
        ];

        MEDAL_DEFS.forEach(m => {
            const has = medals.has(m.id);
            const item = document.createElement('div');
            item.className = `ni-log-item ${has ? '' : 'locked'}`;
            item.title = has ? m.desc : 'Locked Achievement';

            if (has) {
                const icon = document.createElement('div');
                icon.className = 'item-icon medal-icon';
                const medalPath = iconService.getGeneratedIconPath('medal');
                icon.style.backgroundImage = `url('${medalPath}')`;
                icon.style.backgroundSize = 'contain';
                icon.style.width = '100%';
                icon.style.height = '100%';
                item.appendChild(icon);
            }
            list.appendChild(item);
        });
    }
}
