import { iconService } from '../ui/IconService.js';
import { RECIPE_BOOK } from '../data/recipeBook.js';

export class NotificationSystem {
    constructor() {
        this.queue = [];
        this.active = false;
        this.container = null;
        this.init();
    }

    init() {
        let el = document.getElementById('notification-container');
        if (!el) {
            el = document.createElement('div');
            el.id = 'notification-container';
            document.body.appendChild(el);
        }
        this.container = el;
    }

    show(title, rawId, type) {
        this.queue.push({ title, id: rawId, type });
        this.processQueue();
    }

    processQueue() {
        if (this.active || this.queue.length === 0) return;
        this.active = true;

        const next = this.queue.shift();
        this.render(next);

        setTimeout(() => {
            this.active = false;
            this.processQueue();
        }, 4000);
    }

    render(data) {
        const toast = document.createElement('div');
        toast.className = `ni-toast type-${data.type}`;
        
        const iconContainer = document.createElement('div');
        iconContainer.className = `ni-toast-icon ${data.type}-icon`;

        if (data.type === 'medal') {
            const medalPath = iconService.getGeneratedIconPath('medal');
            iconContainer.style.backgroundImage = `url('${medalPath}')`;
            iconContainer.style.backgroundSize = 'contain';
            iconContainer.classList.add('medal-icon');
        } else {
            let iconId = data.id;
            if (data.type === 'recipe') {
                const recipe = RECIPE_BOOK.find(r => r.id === data.id);
                if (recipe) iconId = recipe.result.id;
            }
            const iconEl = iconService.createItemElement({ id: iconId, count: 1 });
            iconContainer.appendChild(iconEl);
        }

        const content = document.createElement('div');
        content.className = 'ni-toast-content';
        
        const title = document.createElement('h4');
        title.textContent = data.title;

        const name = document.createElement('p');
        name.textContent = String(data.id).replace(/_/g, ' ').toUpperCase();

        content.appendChild(title);
        content.appendChild(name);
        
        toast.appendChild(iconContainer);
        toast.appendChild(content);

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        // Animate out
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
}
