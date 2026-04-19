/**
 * Notification System for AntonCraft.
 * Handles queueing and displaying "Discovery" toasts and Achievement medals.
 */
export class NotificationSystem {
    constructor() {
        this.queue = [];
        this.active = false;
        this.container = null;
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        let el = document.getElementById('notification-container');
        if (!el) {
            el = document.createElement('div');
            el.id = 'notification-container';
            document.body.appendChild(el);
        }
        this.container = el;

        // Listen for discovery events
        window.addEventListener('discovery-block', (e) => this.show('BLOCK DISCOVERED', e.detail.id, 'block'));
        window.addEventListener('discovery-recipe', (e) => this.show('RECIPE UNLOCKED', e.detail.id, 'recipe'));
        window.addEventListener('achievement-unlocked', (e) => this.show('ACHIEVEMENT UNLOCKED', e.detail.id, 'medal'));
    }

    show(title, id, type) {
        this.queue.push({ title, id, type });
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
        }, 4000); // Wait for animation + buffer
    }

    render(data) {
        const toast = document.createElement('div');
        toast.className = `ni-notification-toast ni-glass type-${data.type}`;
        
        let iconHtml = '';
        if (data.type === 'medal') {
            iconHtml = '<div class="toast-icon medal-icon">🏅</div>';
        } else {
            iconHtml = `<div class="toast-icon ${data.type}-icon"></div>`;
        }

        toast.innerHTML = `
            ${iconHtml}
            <div class="toast-content">
                <div class="toast-title">${data.title}</div>
                <div class="toast-name">${String(data.id).replace(/_/g, ' ').toUpperCase()}</div>
            </div>
        `;

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        // Animate out
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
}
