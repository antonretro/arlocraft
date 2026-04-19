/**
 * TouchControls — virtual joystick + action buttons for mobile/touch play.
 *
 * Strategy:
 *  - Left half: joystick → injects synthetic key state into input.keys
 *  - Right half: drag → calls game.adjustLook()
 *  - Buttons (bottom-right): mine, place, jump, inventory, pause
 */
export class TouchControls {
    constructor(game) {
        this.game = game;
        this.input = game.input;

        // Joystick state
        this._joyActive = false;
        this._joyId = null;
        this._joyOriginX = 0;
        this._joyOriginY = 0;
        this._joyDX = 0;
        this._joyDY = 0;

        // Look state
        this._lookId = null;
        this._lookLastX = 0;
        this._lookLastY = 0;

        // Button touch tracking (buttonId → touchId)
        this._btnTouches = new Map();

        this._build();
        this._bindEvents();
    }

    _build() {
        const root = document.createElement('div');
        root.id = 'touch-controls';
        root.innerHTML = `
            <div id="tc-joystick-zone">
                <div id="tc-dpad-hint"></div>
                <div id="tc-joystick-base">
                    <div id="tc-joystick-knob"></div>
                </div>
            </div>
            <div id="tc-look-zone"></div>
            <div id="tc-action-btns">
                <div id="tc-row-top">
                    <button class="tc-btn tc-btn-sm" id="tc-jump">&#8679;</button>
                    <button class="tc-btn tc-btn-sm" id="tc-inv">&#127084;</button>
                    <button class="tc-btn tc-btn-sm" id="tc-pause">&#9644;</button>
                </div>
                <div id="tc-row-bot">
                    <button class="tc-btn tc-btn-mine" id="tc-mine">&#9888;</button>
                    <button class="tc-btn tc-btn-place" id="tc-place">&#9633;</button>
                </div>
            </div>
        `;
        document.body.appendChild(root);

        this._joyBase = root.querySelector('#tc-joystick-base');
        this._joyKnob = root.querySelector('#tc-joystick-knob');
        this._joyZone = root.querySelector('#tc-joystick-zone');
        this._lookZone = root.querySelector('#tc-look-zone');
    }

    _bindEvents() {
        // Single touchstart/move/end on document to handle all zones
        document.addEventListener('touchstart',  (e) => this._onStart(e),  { passive: false });
        document.addEventListener('touchmove',   (e) => this._onMove(e),   { passive: false });
        document.addEventListener('touchend',    (e) => this._onEnd(e),    { passive: false });
        document.addEventListener('touchcancel', (e) => this._onEnd(e),    { passive: false });

        // Action buttons
        this._wireBtn('tc-mine',  'mine');
        this._wireBtn('tc-place', 'place');
        this._wireBtn('tc-jump',  'jump');
        this._wireBtn('tc-inv',   'inv');
        this._wireBtn('tc-pause', 'pauseBtn');
    }

    _wireBtn(id, action) {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tid = e.changedTouches[0].identifier;
            this._btnTouches.set(action, tid);
            this._doAction(action, true);
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this._btnTouches.delete(action);
            this._doAction(action, false);
        }, { passive: false });

        el.addEventListener('touchcancel', (e) => {
            e.stopPropagation();
            this._btnTouches.delete(action);
            this._doAction(action, false);
        }, { passive: false });
    }

    _doAction(action, down) {
        const { input, game } = this;
        if (action === 'mine') {
            input.mouseButtons.left = down;
            if (!down) game.cancelMining?.();
        } else if (action === 'place') {
            input.mouseButtons.right = down;
            if (down) input.mouseButtons.rightJustPressed = true;
            else input.mouseButtons.rightJustPressed = false;
        } else if (action === 'jump') {
            if (down) {
                input.keys['Space'] = true;
                input.justPressed['Space'] = true;
            } else {
                delete input.keys['Space'];
            }
        } else if (action === 'inv') {
            if (down) game.toggleInventory?.();
        } else if (action === 'pauseBtn') {
            if (down) game.togglePause?.();
        }
    }

    _onStart(e) {
        if (!this.game.hasStarted || this.game.isPaused) return;

        // Only prevent default for joystick/look zones, not HUD/hotbar elements
        const hasNonHudTouch = Array.from(e.changedTouches).some(t => {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            return !el?.closest('#tc-action-btns') && !el?.closest('#hud');
        });
        if (hasNonHudTouch) e.preventDefault();

        for (const t of e.changedTouches) {
            const el = document.elementFromPoint(t.clientX, t.clientY);
            // Skip if touch is on a button or HUD element
            if (el?.closest('#tc-action-btns') || el?.closest('#hud')) continue;

            const onLeft = t.clientX < window.innerWidth * 0.45;

            if (onLeft && !this._joyActive) {
                // Start joystick
                this._joyActive = true;
                this._joyId = t.identifier;
                this._joyOriginX = t.clientX;
                this._joyOriginY = t.clientY;
                this._joyBase.style.left = t.clientX + 'px';
                this._joyBase.style.top  = t.clientY + 'px';
                this._joyBase.style.opacity = '1';
                this._setKnob(0, 0);
            } else if (!onLeft && this._lookId === null) {
                // Start look
                this._lookId = t.identifier;
                this._lookLastX = t.clientX;
                this._lookLastY = t.clientY;
            }
        }
    }

    _onMove(e) {
        if (!this.game.hasStarted || this.game.isPaused) return;
        e.preventDefault();

        for (const t of e.changedTouches) {
            if (t.identifier === this._joyId) {
                const dx = t.clientX - this._joyOriginX;
                const dy = t.clientY - this._joyOriginY;
                const MAX = 52;
                const dist = Math.min(Math.hypot(dx, dy), MAX);
                const angle = Math.atan2(dy, dx);
                const cx = Math.cos(angle) * dist;
                const cy = Math.sin(angle) * dist;
                this._setKnob(cx, cy);
                this._joyDX = dx / MAX;
                this._joyDY = dy / MAX;
                this._applyJoy();
            } else if (t.identifier === this._lookId) {
                const dx = t.clientX - this._lookLastX;
                const dy = t.clientY - this._lookLastY;
                this._lookLastX = t.clientX;
                this._lookLastY = t.clientY;
                const sens = (this.game.settings?.sensitivity ?? 0.00145) * 420;
                const inv  = this.game.settings?.invertY ? -1 : 1;
                this.game.adjustLook(-dx * sens, -dy * sens * inv);
            }
        }
    }

    _onEnd(e) {
        for (const t of e.changedTouches) {
            if (t.identifier === this._joyId) {
                this._joyActive = false;
                this._joyId = null;
                this._joyDX = 0;
                this._joyDY = 0;
                this._joyBase.style.opacity = '0';
                this._setKnob(0, 0);
                this._applyJoy();
            }
            if (t.identifier === this._lookId) {
                this._lookId = null;
            }
        }
    }

    _setKnob(x, y) {
        this._joyKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }

    _applyJoy() {
        const { keys } = this.input;
        const DEAD = 0.2;
        const dx = this._joyDX;
        const dy = this._joyDY;

        if (dy < -DEAD) keys['KeyW'] = true; else delete keys['KeyW'];
        if (dy >  DEAD) keys['KeyS'] = true; else delete keys['KeyS'];
        if (dx < -DEAD) keys['KeyA'] = true; else delete keys['KeyA'];
        if (dx >  DEAD) keys['KeyD'] = true; else delete keys['KeyD'];
    }

    show(visible) {
        const el = document.getElementById('touch-controls');
        if (el) el.style.display = visible ? 'block' : 'none';
    }

    /** Call once per frame to keep sprinting diagonal working */
    tick() {
        if (this._joyActive) this._applyJoy();
    }

    static isTouchDevice() {
        return ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    }
}
