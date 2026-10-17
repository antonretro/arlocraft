import * as THREE from 'three';

/**
 * Packs every block face texture into one DataArrayTexture so a whole chunk
 * can be drawn with a single material. Layer 0 is plain white (used for
 * colour-only materials). Textures that are still loading get a layer
 * immediately and are copied in once their image arrives.
 */
export class BlockTextureArray {
  constructor({ size = 16, capacity = 1024 } = {}) {
    this.size = size;
    this.capacity = capacity;
    this.data = new Uint8Array(size * size * 4 * capacity);
    this.texture = new THREE.DataArrayTexture(this.data, size, size, capacity);
    this.texture.format = THREE.RGBAFormat;
    this.texture.type = THREE.UnsignedByteType;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.layers = new Map(); // texture uuid -> layer
    this.pending = []; // { texture, layer }
    this.nextLayer = 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;
    this.data.fill(255, 0, size * size * 4); // layer 0: white
    this.texture.needsUpdate = true;
  }

  layerFor(texture) {
    if (!texture) return 0;
    const existing = this.layers.get(texture.uuid);
    if (existing !== undefined) return existing;
    if (this.nextLayer >= this.capacity) return 0;
    const layer = this.nextLayer++;
    this.layers.set(texture.uuid, layer);
    if (!this.tryCopy(texture, layer)) this.pending.push({ texture, layer });
    return layer;
  }

  /**
   * A layer made of `base` with the opaque pixels of `overlay` drawn over
   * it (grass block sides: dirt + grey grass overlay that gets tinted).
   */
  layerForComposite(key, base, overlay) {
    const existing = this.layers.get(key);
    if (existing !== undefined) return existing;
    if (this.nextLayer >= this.capacity) return 0;
    const layer = this.nextLayer++;
    this.layers.set(key, layer);
    const composite = { uuid: key, parts: [base, overlay] };
    if (!this.tryCopy(composite, layer))
      this.pending.push({ texture: composite, layer });
    return layer;
  }

  imageOf(texture) {
    const image = texture.image ?? texture.source?.data;
    if (!image) return null;
    if (image instanceof HTMLImageElement && !image.complete) return null;
    if (!image.width || !image.height) return null;
    return image;
  }

  tryCopy(texture, layer) {
    if (texture.parts) return this.tryCopyComposite(texture.parts, layer);
    const image = this.imageOf(texture);
    if (!image) return false;
    const { size, ctx } = this;
    // Animated textures are vertical strips of square frames: use frame 0.
    const frame = Math.min(image.width, image.height);
    ctx.clearRect(0, 0, size, size);
    // Array textures are not flipped on upload, so store rows bottom-up
    // (v = 0 at the bottom of the image) to match the mesh UVs.
    ctx.save();
    ctx.translate(0, size);
    ctx.scale(1, -1);
    ctx.drawImage(image, 0, 0, frame, frame, 0, 0, size, size);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, size, size).data;
    this.data.set(pixels, layer * size * size * 4);
    // Upload only the changed layer when three.js supports it.
    if (typeof this.texture.addLayerUpdate === 'function') {
      this.texture.addLayerUpdate(layer);
    }
    this.texture.needsUpdate = true;
    return true;
  }

  tryCopyComposite(parts, layer) {
    const images = parts.map((t) => this.imageOf(t));
    if (images.some((img) => !img)) return false;
    const { size, ctx } = this;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(0, size);
    ctx.scale(1, -1);
    for (const image of images) {
      const frame = Math.min(image.width, image.height);
      ctx.drawImage(image, 0, 0, frame, frame, 0, 0, size, size);
    }
    ctx.restore();
    this.data.set(
      ctx.getImageData(0, 0, size, size).data,
      layer * size * size * 4
    );
    if (typeof this.texture.addLayerUpdate === 'function') {
      this.texture.addLayerUpdate(layer);
    }
    this.texture.needsUpdate = true;
    return true;
  }

  /** Copies textures whose images finished loading. Call once per frame. */
  update() {
    if (this.pending.length === 0) return;
    this.pending = this.pending.filter(
      ({ texture, layer }) => !this.tryCopy(texture, layer)
    );
  }
}
