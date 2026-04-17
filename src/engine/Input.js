export class Input {
    constructor(game) {
        this.game = game;
        this.keys = Object.create(null);
        this.justPressed = Object.create(null);
        this.mouseButtons = {
            left: false,
            right: false,
            rightJustPressed: false
        };
        this.isLocked = false;
        this.init();
    }

    clearTransientInputs() {
        this.justPressed = Object.create(null);
        this.mouseButtons.rightJustPressed = false;
    }

    isDown(code) {
        return Boolean(this.keys[code]);
    }

    consumeKeyPress(code) {
        if (!this.justPressed[code]) return false;
        delete this.justPressed[code];
        return true;
    }

    consumeRightClick() {
        if (!this.mouseButtons.rightJustPressed) return false;
        this.mouseButtons.rightJustPressed = false;
        return true;
    }

    setPointerLock() {
        const canvas = this.game?.renderer?.instance?.domElement;
        if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
        canvas.requestPointerLock();
    }

    init() {
        window.addEventListener('inventory-toggle', (event) => {
            const isOpen = Boolean(event.detail);
            if (isOpen) {
                if (document.pointerLockElement) document.exitPointerLock();
            } else if (this.game.hasStarted && !this.game.isPaused) {
                this.setPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            const canvas = this.game?.renderer?.instance?.domElement;
            const locked = Boolean(canvas && document.pointerLockElement === canvas);
            this.isLocked = locked;
            this.game.onPointerLockChange(locked);
            if (!locked) {
                this.keys = Object.create(null);
                this.mouseButtons.left = false;
                this.mouseButtons.right = false;
                this.clearTransientInputs();
            }
        });

        window.addEventListener('keydown', (event) => {
            const preventCodes = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'F5', 'Escape']);
            if (preventCodes.has(event.code)) event.preventDefault();

            if (event.code === 'Escape') {
                if (this.game.isSettingsOpen?.()) {
                    this.game.showSettings(false);
                    if (this.game.isPaused) this.game.showPause(true);
                    return;
                }
                if (this.game.hasStarted) this.game.togglePause();
                return;
            }

            if (event.code === 'KeyM' && this.game.hasStarted) {
                this.game.toggleMinimap();
                return;
            }

            if (!this.game.hasStarted) return;

            if (!this.keys[event.code]) {
                this.justPressed[event.code] = true;
            }
            this.keys[event.code] = true;

            if (this.game.isPaused) return;

            if (event.code === 'F3') {
                this.game.toggleDebugOverlay();
            }

            if (event.code === 'F5') {
                this.game.cycleCameraMode();
            }

            if (event.code === 'KeyG' && this.isLocked) {
                this.game.toggleGameMode();
            }

            if (event.code === 'KeyI') {
                this.game.toggleHelpPanel();
                return;
            }

            if (event.code === 'KeyE') {
                this.game.toggleInventory();
                return;
            }

            if (event.code === 'KeyF') {
                this.game.toggleOffhandFromSelected?.();
                return;
            }

            if (event.code === 'KeyQ') {
                this.game.pickBlock?.();
                return;
            }

            if (event.code.startsWith('Digit')) {
                const index = parseInt(event.code.replace('Digit', ''), 10);
                if (index >= 1 && index <= 9) {
                    this.game.gameState.setSlot(index - 1);
                }
            }
        });

        window.addEventListener('keyup', (event) => {
            delete this.keys[event.code];
            delete this.justPressed[event.code];
        });

        document.addEventListener('mousemove', (event) => {
            if (!this.isLocked || this.game.isPaused || this.game.gameState.isInventoryOpen) return;
            const sensitivity = this.game.settings?.sensitivity ?? 0.00145;
            const invertFactor = this.game.settings?.invertY ? -1 : 1;
            this.game.adjustLook(-event.movementX * sensitivity, -event.movementY * sensitivity * invertFactor);
        });

        window.addEventListener('wheel', (event) => {
            if (!this.isLocked || this.game.isPaused || this.game.gameState.isInventoryOpen) return;
            event.preventDefault();
            const current = this.game.gameState.selectedSlot;
            const delta = event.deltaY > 0 ? 1 : -1;
            this.game.gameState.setSlot((current + delta + 9) % 9);
        }, { passive: false });

        window.addEventListener('mousedown', (event) => {
            if (!this.isLocked || this.game.isPaused || this.game.gameState.isInventoryOpen) return;
            event.preventDefault();

            if (event.button === 0) this.mouseButtons.left = true;
            if (event.button === 2) {
                this.mouseButtons.right = true;
                this.mouseButtons.rightJustPressed = true;
            }
        });

        window.addEventListener('mouseup', (event) => {
            if (event.button === 0) {
                this.mouseButtons.left = false;
                this.game.cancelMining();
            }
            if (event.button === 2) this.mouseButtons.right = false;
        });

        window.addEventListener('blur', () => {
            this.keys = Object.create(null);
            this.mouseButtons.left = false;
            this.mouseButtons.right = false;
            this.clearTransientInputs();
            this.game.cancelMining();
        });

        window.addEventListener('contextmenu', (event) => event.preventDefault());
    }
}
