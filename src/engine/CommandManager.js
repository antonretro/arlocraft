/**
 * CommandManager
 * Handles registration and execution of in-game commands.
 */
export class CommandManager {
  constructor(game) {
    this.game = game;
    this.commands = new Map();
    this.init();
  }

  register(name, description, handler) {
    this.commands.set(name.toLowerCase(), { description, handler });
  }

  execute(cmdLine) {
    const args = cmdLine.trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();
    const command = this.commands.get(cmdName);

    if (!command) {
      this.game.chat?.addMessage('SYSTEM', `Unknown command: /${cmdName}`, 'error');
      return false;
    }

    try {
      return command.handler(args);
    } catch (err) {
      this.game.chat?.addMessage('SYSTEM', `Error executing /${cmdName}: ${err.message}`, 'error');
      return false;
    }
  }

  init() {
    this.register('help', 'Shows available commands', () => {
      let msg = 'Available commands: ';
      const names = Array.from(this.commands.keys()).map(n => `/${n}`);
      this.game.chat?.addMessage('SYSTEM', msg + names.join(', '), 'system');
    });

    this.register('tp', 'Teleport: /tp [x y z]', (args) => {
      if (args.length < 3) throw new Error('Usage: /tp [x] [y] [z]');
      const x = parseFloat(args[0]), y = parseFloat(args[1]), z = parseFloat(args[2]);
      this.game.physics?.resetPlayer(x, y, z);
      this.game.chat?.addMessage('SYSTEM', `Teleported to ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`, 'system');
    });

    this.register('mode', 'Set gamemode: /mode [survival|creative]', (args) => {
      const mode = args[0]?.toUpperCase();
      if (mode !== 'SURVIVAL' && mode !== 'CREATIVE') throw new Error('Usage: /mode [survival|creative]');
      this.game.gameState.setMode(mode);
      this.game.chat?.addMessage('SYSTEM', `Gamemode set to ${mode}`, 'system');
    });

    this.register('time', 'Set world time: /time [set day|night|noon|midnight|number]', (args) => {
        if (args[0] === 'set') {
            const val = args[1];
            let time = 0;
            if (val === 'day') time = 1000;
            else if (val === 'noon') time = 6000;
            else if (val === 'night') time = 13000;
            else if (val === 'midnight') time = 18000;
            else time = parseInt(val) || 0;
            
            this.game.dayNight?.setTime(time);
            this.game.chat?.addMessage('SYSTEM', `Time set to ${time}`, 'system');
        } else {
            throw new Error('Usage: /time set [value]');
        }
    });

    this.register('clear', 'Clear chat history', () => {
      if (this.game.chat) {
          this.game.chat.messages = [];
          window.dispatchEvent(new CustomEvent('chat-updated', { detail: [] }));
      }
    });

    this.register('spawn', 'Teleport to world spawn', () => {
        this.game.player?.position.set(0, 100, 0); // Default spawn
        this.game.chat?.addMessage('SYSTEM', 'Returning to origin point.', 'system');
    });

    this.register('give', 'Give item: /give [id] [count]', (args) => {
        const id = args[0];
        const count = parseInt(args[1]) || 1;
        if (!id) throw new Error('Usage: /give [id] [count]');
        this.game.gameState.addBlockToInventory(id, count);
        this.game.chat?.addMessage('SYSTEM', `Granted ${count}x ${id}`, 'system');
    });

    this.register('weather', 'Set weather: /weather [clear|rain|thunder]', (args) => {
        const type = args[0]?.toLowerCase();
        if (!['clear', 'rain', 'thunder'].includes(type)) throw new Error('Usage: /weather [clear|rain|thunder]');
        this.game.world.weather?.setWeather(type);
        this.game.chat?.addMessage('SYSTEM', `Weather set to ${type}`, 'system');
    });

    this.register('summon', 'Spawn entity: /summon [id]', (args) => {
        const id = args[0];
        if (!id) throw new Error('Usage: /summon [id]');
        const pos = this.game.player?.position || { x: 0, y: 100, z: 0 };
        this.game.entities?.spawn(id, pos.x, pos.y, pos.z);
        this.game.chat?.addMessage('SYSTEM', `Summoned ${id}`, 'system');
    });

    this.register('kill', 'Suicide', () => {
        this.game.gameState.damage(100);
        this.game.chat?.addMessage('SYSTEM', 'Oof.', 'system');
    });

    this.register('seed', 'Show world seed', () => {
        const seed = this.game.world.config?.seed || 'Unknown';
        this.game.chat?.addMessage('SYSTEM', `World Seed: ${seed}`, 'system');
    });

    this.register('effect', 'Apply status effect: /effect [id] [seconds] [level]', (args) => {
        const id = args[0];
        const seconds = parseInt(args[1]) || 30;
        const level = parseInt(args[2]) || 1;
        if (!id) throw new Error('Usage: /effect [id] [seconds] [level]');
        this.game.gameState.applyEffect({ id, duration: seconds, level });
        this.game.chat?.addMessage('SYSTEM', `Applied ${id} ${level} for ${seconds}s`, 'system');
    });
    
    this.register('morph', 'Morph into an entity: /morph [id|clear]', (args) => {
        const id = args[0]?.toLowerCase();
        if (!id) throw new Error('Usage: /morph [id|clear]');
        
        if (id === 'clear' || id === 'none' || id === 'reset') {
            this.game.gameState.morphId = null;
            this.game.chat?.addMessage('SYSTEM', 'Cleared morph.', 'system');
        } else {
            this.game.gameState.morphId = id;
            this.game.chat?.addMessage('SYSTEM', `Morphed into ${id}`, 'system');
        }
        
        // Trigger player mesh update
        window.dispatchEvent(new CustomEvent('player-morph-changed', { detail: this.game.gameState.morphId }));
    });
  }
}
