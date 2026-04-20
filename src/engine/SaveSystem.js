import LZString from 'lz-string';

export class SaveSystem {
  constructor(game) {
    this.game = game;
  }

  getSlotKey(slotId) {
    return `ArloCraft-world-save-${slotId}`;
  }

  encode(data) {
    const json = JSON.stringify(data);
    return {
      format: 'ArloCraft-lz-v1',
      data: LZString.compressToBase64(json),
    };
  }

  decode(rawText) {
    const text = String(rawText ?? '').trim();
    if (!text) throw new Error('Empty save payload');

    const parsed = JSON.parse(text);

    if (
      parsed?.format === 'ArloCraft-lz-v1' &&
      typeof parsed.data === 'string'
    ) {
      const decompressed = LZString.decompressFromBase64(parsed.data);
      if (!decompressed)
        throw new Error('Compressed save could not be decompressed');
      return JSON.parse(decompressed);
    }

    return parsed;
  }

  saveToSlot(slotId) {
    const data = this.game.getSaveData();
    const packed = this.encode(data);
    localStorage.setItem(this.getSlotKey(slotId), JSON.stringify(packed));
    return true;
  }

  loadFromSlot(slotId) {
    const raw = localStorage.getItem(this.getSlotKey(slotId));
    if (!raw) return false;

    const data = this.decode(raw);
    this.game.applySaveData(data);
    return true;
  }

  exportToFile(filename = 'ArloCraft_world.json') {
    const data = this.game.getSaveData();
    const payload = JSON.stringify(this.encode(data));
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  async importFromFile(file) {
    const text = await file.text();
    const data = this.decode(text);
    this.game.applySaveData(data);
    return true;
  }
}
