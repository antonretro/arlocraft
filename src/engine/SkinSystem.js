export class SkinSystem {
  constructor() {
    this.currentSkin = 'classic_steve';
    this.customSkinData = null;
    this.classicSkins = [
      {
        id: 'classic_steve',
        name: 'Steve',
        url: 'https://minotar.net/skin/steve',
        faceUrl: 'https://minotar.net/helm/steve/64',
      },
      {
        id: 'classic_alex',
        name: 'Alex',
        url: 'https://minotar.net/skin/alex',
        faceUrl: 'https://minotar.net/helm/alex/64',
      },
    ];
    this.randomSkins = this._generateRandomSkins(10);
  }

  _generateRandomSkins(count) {
    const skins = [];
    const famousNames = [
      'Jim', 'Bob', 'DanTDM', 'Mumbo Jumbo', 'Grian', 'Dream', 'Technoblade',
      'Stampy', 'PopularMMOs', 'CaptainSparklez', 'JackSucksAtLife', 'AntVenom',
      'Etho', 'SethBling', 'Notch', 'Jeb', 'Dinnerbone', 'Gruncle Stan'
    ];
    
    // Sort so Steve and Alex are top (handled by being in classicSkins or first here if desired)
    
    const baseColors = ['#ffccaa', '#ffaa88', '#dd8866', '#aa6644', '#774433'];
    const shirtColors = ['#008888', '#aa0000', '#00aa00', '#0000aa', '#aaaa00', '#880088'];
    const pantColors = ['#4444aa', '#333333', '#446622', '#664422'];

    for (let i = 0; i < count; i++) {
        const name = famousNames[i % famousNames.length];
        const skin = {
            id: `random_${i}`,
            name: name,
            url: `https://minotar.net/skin/${name.replace(' ', '_')}`,
            faceUrl: `https://minotar.net/helm/${name.replace(' ', '_')}/64`,
            isProcedural: false // Using Minotar now for these famous names
        };
        skins.push(skin);
    }
    return skins;
  }

  getSkinUrl(skinId) {
    const classic = this.classicSkins.find((s) => s.id === skinId);
    if (classic) return classic.url;

    const random = this.randomSkins.find((s) => s.id === skinId);
    if (random) return null; // Needs canvas generation

    if (skinId === 'custom') return this.customSkinData;

    return 'assets/steve.png';
  }

  applySkin(skinId, data = null) {
    this.currentSkin = skinId;
    if (skinId === 'custom' && data) {
      this.customSkinData = data;
    }
    localStorage.setItem('arlocraft_skin_id', skinId);
    if (data) localStorage.setItem('arlocraft_custom_skin', data);

    window.dispatchEvent(
      new CustomEvent('skin-changed', { detail: { skinId, data } })
    );
  }

  loadSavedSkin() {
    const savedId = localStorage.getItem('arlocraft_skin_id');
    const savedData = localStorage.getItem('arlocraft_custom_skin');
    if (savedId) {
      this.currentSkin = savedId;
      this.customSkinData = savedData;
    }
  }
}
