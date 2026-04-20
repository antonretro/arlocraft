export class ActionSystem {
  constructor(gameState) {
    this.gameState = gameState;
    this.activePrompt = null;
    this.promptWindow = 0; // ms
    this.onCommandSuccess = null;
  }

  triggerPrompt(type, duration = 1000) {
    const prompt = {
      type,
      start: Date.now(),
      duration,
      perfectWindow: [duration * 0.7, duration * 0.9], // Success window if clicked then
    };
    this.activePrompt = prompt;

    // Dispatch UI event
    window.dispatchEvent(
      new CustomEvent('action-prompt', { detail: this.activePrompt })
    );

    setTimeout(() => {
      if (this.activePrompt === prompt) {
        this.activePrompt = null;
      }
    }, duration);
  }

  checkInput() {
    if (!this.activePrompt) return false;

    const now = Date.now();
    const elapsed = now - this.activePrompt.start;
    const [low, high] = this.activePrompt.perfectWindow;

    if (elapsed >= low && elapsed <= high) {
      this.success();
      return true;
    } else {
      this.fail();
      return false;
    }
  }

  success() {
    console.log('ACTION COMMAND SUCCESS!');
    window.dispatchEvent(new CustomEvent('action-success'));
    this.activePrompt = null;
  }

  fail() {
    console.log('ACTION COMMAND FAIL!');
    window.dispatchEvent(new CustomEvent('action-fail'));
    this.activePrompt = null;
  }
}
