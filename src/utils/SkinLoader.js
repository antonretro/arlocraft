import * as THREE from 'three';

export class SkinLoader {
  constructor() {
    const base = import.meta.env.BASE_URL || '/';
    const assetPath = base.endsWith('/') ? base : base + '/';
    this.defaultSteve = `${assetPath}assets/steve.png`;
    this.defaultAlex = `${assetPath}assets/alex.png`;
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (url.startsWith('http')) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        console.error(`[SkinLoader] Failed to load image: ${url}`, e);
        reject(e);
      };
      img.src = url;
    });
  }

  async loadSkinFromUrl(url) {
    const img = await this._loadImage(url);
    const materials = this.createMaterials(img);
    return { materials };
  }

  async loadSkin(username) {
    const url =
      username === 'Steve' || username === 'Alex' || !username
        ? username === 'Alex'
          ? this.defaultAlex
          : this.defaultSteve
        : `https://minotar.net/skin/${username}`;

    try {
      const img = await this._loadImage(url);
      const materials = this.createMaterials(img);
      return { materials };
    } catch (err) {
      if (url !== this.defaultSteve) {
        console.warn(
          `[ArloCraft] Skin load failed for ${username}, falling back to Steve.`
        );
        return this.loadSkin('Steve');
      }
      throw err;
    }
  }

  createMaterials(img) {
    const head = this.getBoxMaterials(img, 8, 8, 8, 0, 0);
    const torso = this.getBoxMaterials(img, 8, 12, 4, 16, 16);
    const armR = this.getBoxMaterials(img, 4, 12, 4, 40, 16);
    const legR = this.getBoxMaterials(img, 4, 12, 4, 0, 16);
    const armL = this.getBoxMaterials(img, 4, 12, 4, 32, 48);
    const legL = this.getBoxMaterials(img, 4, 12, 4, 16, 48);
    return { head, torso, armR, armL, legR, legL };
  }

  getBoxMaterials(img, w, h, d, u, v) {
    const faces = [
      this.extractFace(img, d, h, u, v + d), // Right  (px)
      this.extractFace(img, d, h, u + d + w, v + d), // Left   (nx)
      this.extractFace(img, w, d, u + d, v), // Top    (py)
      this.extractFace(img, w, d, u + d + w, v), // Bottom (ny)
      this.extractFace(img, w, h, u + d, v + d), // Front  (pz)
      this.extractFace(img, w, h, u + 2 * d + w, v + d), // Back   (nz)
    ];
    return faces.map((canvas) => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.5,
      });
    });
  }

  extractFace(img, fw, fh, fx, fy) {
    const c = document.createElement('canvas');
    c.width = fw;
    c.height = fh;
    if (fy + fh <= img.height) {
      c.getContext('2d').drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
    }
    return c;
  }
}
