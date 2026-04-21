/**
 * ChatSystem
 * Manages in-game communication, system messages, and command parsing.
 */
export class ChatSystem {
  constructor(game) {
    this.game = game;
    this.messages = [];
    this.maxMessages = 100;
    this.visible = false;
  }

  addMessage(sender, text, type = 'user') {
    const message = {
      id: Date.now() + Math.random(),
      sender,
      text,
      type, // user | system | warning | error
      timestamp: Date.now()
    };

    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // Trigger UI update
    window.dispatchEvent(new CustomEvent('chat-updated', { detail: this.messages }));
    
    // Auto-scroll logic is handled by React component
    return message;
  }

  sendMessage(text) {
    if (!text || text.trim() === '') return;

    // Command Parsing
    if (text.startsWith('/')) {
        this.game.commands?.execute(text.substring(1));
        return;
    }

    // Local echo
    const username = this.game.settings?.skinUsername || 'Me';
    this.addMessage(username, text);

    // Broadcast to peers
    if (this.game.multiplayer) {
      this.game.multiplayer.broadcast({
        type: 'chat',
        data: { text, sender: username }
      });
    }
  }
}
