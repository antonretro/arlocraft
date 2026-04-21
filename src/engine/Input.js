export class Input {
  constructor(game) {
    this.game = game;
    this.keys = Object.create(null);
    this.justPressed = Object.create(null);
    this.mouseButtons = {
      left: false,
      right: false,
      rightJustPressed: false,
    };
    this.gamepadState = {
      active: false,
      lx: 0,
      ly: 0,
      rx: 0,
      ry: 0,
      jump: false,
      mining: false,
      placing: false,
    };
    this.isLocked = false;
    this.handlers = {};
    this.init();
  }

  clearTransientInputs() {
    this.justPressed = Object.create(null);
    this.mouseButtons.rightJustPressed = false;
  }

  isDown(code) {
    if (this.game.chat?.visible) return false;
    return Boolean(this.keys[code]);
  }

  isJustPressed(code) {
    if (this.game.chat?.visible) return false;
    return Boolean(this.justPressed[code]);
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

  update() {
    this.pollGamepad();
  }

  pollGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0]; // Track first controller

    if (!gp) {
      this.gamepadState.active = false;
      return;
    }

    this.gamepadState.active = true;
    const deadzone = 0.15;

    // Stick Axes
    const lx = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
    const ly = Math.abs(gp.axes[1]) > deadzone ? gp.axes[1] : 0;
    const rx = Math.abs(gp.axes[2]) > deadzone ? gp.axes[2] : 0;
    const ry = Math.abs(gp.axes[3]) > deadzone ? gp.axes[3] : 0;

    this.gamepadState.lx = lx;
    this.gamepadState.ly = ly;
    this.gamepadState.rx = rx;
    this.gamepadState.ry = ry;

    // Apply Look
    if (Math.abs(rx) > 0 || Math.abs(ry) > 0) {
      const sens = (this.game.settings?.sensitivity ?? 0.00145) * 50;
      this.game.adjustLook(-rx * sens, -ry * sens);
    }

    // Buttons
    const buttonA = gp.buttons[0].pressed; // Jump
    const buttonB = gp.buttons[1].pressed; // Menu/Back
    const buttonX = gp.buttons[2].pressed; // Special/Pick
    const buttonY = gp.buttons[3].pressed; // Cam Mode
    const triggerR = gp.buttons[7].pressed || gp.buttons[7].value > 0.5; // Mine
    const triggerL = gp.buttons[6].pressed || gp.buttons[6].value > 0.5; // Place

    // Map Gamepad to Keyboard state for simplicity
    this.keys['Space'] = buttonA;
    if (buttonB && !this.lastB) this.game.togglePause();
    if (buttonX && !this.lastX) this.game.pickBlock?.();
    if (buttonY && !this.lastY) this.game.cycleCameraMode?.();

    const lb = gp.buttons[4].pressed;
    const rb = gp.buttons[5].pressed;
    if (lb && !this.lastLB)
      this.game.gameState.setSlot((this.game.gameState.selectedSlot + 8) % 9);
    if (rb && !this.lastRB)
      this.game.gameState.setSlot((this.game.gameState.selectedSlot + 1) % 9);

    this.mouseButtons.left = triggerR;
    if (triggerL && !this.gamepadState.placing) {
      this.mouseButtons.rightJustPressed = true;
    }
    this.gamepadState.placing = triggerL;

    this.lastB = buttonB;
    this.lastX = buttonX;
    this.lastY = buttonY;
    this.lastLB = lb;
    this.lastRB = rb;
  }

  setPointerLock() {
    const canvas = this.game?.renderer?.instance?.domElement;
    if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
    canvas.requestPointerLock();
  }

  init() {
    this.handlers.onInventoryToggle = (event) => {
      const isOpen = Boolean(event.detail);
      if (isOpen) {
        if (document.pointerLockElement) document.exitPointerLock();
      } else if (this.game.hasStarted && !this.game.isPaused) {
        this.setPointerLock();
      }
    };

    this.handlers.onPointerLockChange = () => {
      const canvas = this.game?.renderer?.instance?.domElement;
      const locked = Boolean(canvas && document.pointerLockElement === canvas);
      this.isLocked = locked;
      this.game.onPointerLockChange(locked);
      if (!locked && !this.game.touchControls) {
        this.keys = Object.create(null);
        this.mouseButtons.left = false;
        this.mouseButtons.right = false;
        this.clearTransientInputs();
      }
    };

    this.handlers.onKeyDown = (event) => {
      const preventCodes = new Set([
        'Space',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'F3',
        'F5',
        'Escape',
      ]);
      const isInput = event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA';
      if (preventCodes.has(event.code) && !isInput) event.preventDefault();

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

      if (event.code === 'KeyE' || event.code === 'KeyI') {
        event.preventDefault();
        this.game.toggleInventory();
        return;
      }

      if (event.code === 'KeyF') {
        this.game.toggleOffhandFromSelected?.();
        return;
      }

      if (event.code === 'KeyP') {
        this.game.pickBlock?.();
        return;
      }

      if (event.code.startsWith('Digit')) {
        const index = parseInt(event.code.replace('Digit', ''), 10);
        if (index >= 1 && index <= 9) {
          this.game.gameState.setSlot(index - 1);
        }
      }

      if (event.code === 'KeyT' && !this.game.chat?.visible) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('chat-open', { detail: { prefill: '' } }));
        return;
      }

      if (event.code === 'Slash' && !this.game.chat?.visible) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('chat-open', { detail: { prefill: '/' } }));
        return;
      }
    };

    this.handlers.onKeyUp = (event) => {
      delete this.keys[event.code];
    };

    this.handlers.onMouseMove = (event) => {
      if (
        !this.isLocked ||
        this.game.isPaused ||
        this.game.gameState.isInventoryOpen
      )
        return;
      const sensitivity = (this.game.settings?.sensitivity ?? 0.00145) * 0.85;
      const invertFactor = this.game.settings?.invertY ? -1 : 1;

      this.game.adjustLook(
        -event.movementX * sensitivity,
        -event.movementY * sensitivity * invertFactor
      );
    };

    this.handlers.onWheel = (event) => {
      if (
        !this.isLocked ||
        this.game.isPaused ||
        this.game.gameState.isInventoryOpen
      )
        return;
      event.preventDefault();
      const current = this.game.gameState.selectedSlot;
      const delta = event.deltaY > 0 ? 1 : -1;
      this.game.gameState.setSlot((current + delta + 9) % 9);
    };

    this.handlers.onMouseDown = (event) => {
      if (
        !this.isLocked ||
        this.game.isPaused ||
        this.game.gameState.isInventoryOpen
      )
        return;
      event.preventDefault();

      if (event.button === 0) this.mouseButtons.left = true;
      if (event.button === 2) {
        this.mouseButtons.right = true;
        this.mouseButtons.rightJustPressed = true;
      }
    };

    this.handlers.onMouseUp = (event) => {
      if (event.button === 0) {
        this.mouseButtons.left = false;
        this.game.cancelMining();
      }
      if (event.button === 2) this.mouseButtons.right = false;
    };

    this.handlers.onBlur = () => {
      this.keys = Object.create(null);
      this.mouseButtons.left = false;
      this.mouseButtons.right = false;
      this.clearTransientInputs();
      this.game.cancelMining();
    };

    this.handlers.onContextMenu = (event) => event.preventDefault();

    window.addEventListener('inventory-toggle', this.handlers.onInventoryToggle);
    document.addEventListener('pointerlockchange', this.handlers.onPointerLockChange);
    window.addEventListener('keydown', this.handlers.onKeyDown);
    window.addEventListener('keyup', this.handlers.onKeyUp);
    document.addEventListener('mousemove', this.handlers.onMouseMove);
    window.addEventListener('wheel', this.handlers.onWheel, { passive: false });
    window.addEventListener('mousedown', this.handlers.onMouseDown);
    window.addEventListener('mouseup', this.handlers.onMouseUp);
    window.addEventListener('blur', this.handlers.onBlur);
    window.addEventListener('contextmenu', this.handlers.onContextMenu);
  }

  dispose() {
    window.removeEventListener('inventory-toggle', this.handlers.onInventoryToggle);
    document.removeEventListener('pointerlockchange', this.handlers.onPointerLockChange);
    window.removeEventListener('keydown', this.handlers.onKeyDown);
    window.removeEventListener('keyup', this.handlers.onKeyUp);
    document.removeEventListener('mousemove', this.handlers.onMouseMove);
    window.removeEventListener('wheel', this.handlers.onWheel);
    window.removeEventListener('mousedown', this.handlers.onMouseDown);
    window.removeEventListener('mouseup', this.handlers.onMouseUp);
    window.removeEventListener('blur', this.handlers.onBlur);
    window.removeEventListener('contextmenu', this.handlers.onContextMenu);
  }
}
