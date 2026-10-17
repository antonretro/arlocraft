/**
 * ChatSystem
 * Manages in-game communication, system messages, and command parsing.
 */
const HISTORY_KEY = 'arlocraft-chat-history';
const MAX_HISTORY = 50;

export class ChatSystem {
  constructor(game) {
    this.game = game;
    this.messages = [];
    this.maxMessages = 100;
    this.visible = false;
    this.history = this.loadHistory();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list)
        ? list.filter((s) => typeof s === 'string')
        : [];
    } catch {
      return [];
    }
  }

  remember(text) {
    if (this.history[this.history.length - 1] !== text) this.history.push(text);
    if (this.history.length > MAX_HISTORY) this.history.shift();
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      // History is a convenience; ignore storage errors.
    }
  }

  addMessage(sender, text, type = 'user') {
    const message = {
      id: Date.now() + Math.random(),
      sender,
      text,
      type, // user | system | warning | error | bot
      timestamp: Date.now(),
    };

    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // Trigger UI update
    window.dispatchEvent(
      new CustomEvent('chat-updated', { detail: this.messages })
    );

    return message;
  }

  clear() {
    this.messages = [];
    window.dispatchEvent(new CustomEvent('chat-updated', { detail: [] }));
  }

  sendMessage(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return;
    this.remember(trimmed);

    // Command Parsing
    if (trimmed.startsWith('/')) {
      const commands = this.game.commandManager ?? this.game.commands;
      if (trimmed.length > 1) commands?.execute(trimmed.substring(1));
      return;
    }

    // Local echo
    const username = this.game.settings?.skinUsername || 'Me';
    this.addMessage(username, trimmed);

    // Broadcast to peers
    if (this.game.multiplayer) {
      this.game.multiplayer.broadcast({
        type: 'chat',
        data: { text: trimmed, sender: username },
      });
    }

    // Build Bots listen to what the local player says.
    this.game.entities?.handleChatMessage?.(trimmed);
  }
}
