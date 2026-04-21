import * as THREE from 'three';

/**
 * BaseModel for all 3D Mob Entities.
 * Handles part grouping, standard walking animations, and material management.
 */
export class BaseModel {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {}; // Name -> Mesh mapping
    this.walkCycle = 0;
    this.material = new THREE.MeshLambertMaterial({
      transparent: true,
      alphaTest: 0.1,
    });
  }

  /**
   * Helper to create a textured box part.
   * @param {string} name
   * @param {number} width - World units
   * @param {number} height - World units
   * @param {number} depth - World units
   * @param {number} x, y, z - Position offsets
   * @param {object} uvConfig - { u, v, w, h, d, tw, th } in pixels
   */
  createPart(name, width, height, depth, x = 0, y = 0, z = 0, uvConfig = null) {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (uvConfig) {
      this.applyUVs(geo, uvConfig);
    }

    this.parts[name] = mesh;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Maps traditional Minecraft skin atlas UVs to a THREE.BoxGeometry.
   * Format: (u, v) is top-left of the part's skin area.
   */
  applyUVs(geometry, { u, v, w, h, d, tw = 64, th = 64 }) {
    const uvAttr = geometry.attributes.uv;

    // Helper to set UV for a face
    // Three.js BoxGeometry faces: 0:px, 1:nx, 2:py, 3:ny, 4:pz, 5:nz
    // (RIGHT, LEFT, TOP, BOTTOM, FRONT, BACK)
    const setFace = (faceIdx, uMin, vMin, uMax, vMax) => {
      const u0 = uMin / tw;
      const v0 = 1 - vMax / th;
      const u1 = uMax / tw;
      const v1 = 1 - vMin / th;

      const offset = faceIdx * 4;

      // Standard MC-style winding for BoxGeometry:
      // BL, BR, TL, TR
      uvAttr.setXY(offset + 0, u0, v1);
      uvAttr.setXY(offset + 1, u1, v1);
      uvAttr.setXY(offset + 2, u0, v0);
      uvAttr.setXY(offset + 3, u1, v0);
    };

    // Standard Minecraft Texture Atlas Layout for Cuboids
    // py (Top)
    setFace(2, u + d, v, u + d + w, v + d);
    // ny (Bottom)
    setFace(3, u + d + w, v, u + d + 2 * w, v + d);
    // px (Right)
    setFace(0, u, v + d, u + d, v + d + h);
    // nx (Left)
    setFace(1, u + d + w, v + d, u + 2 * d + w, v + d + h);
    // pz (Front)
    setFace(4, u + d, v + d, u + d + w, v + d + h);
    // nz (Back)
    setFace(5, u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h);

    uvAttr.needsUpdate = true;
  }

  setTexture(texture) {
    if (!texture) return;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    this.material.map = texture;
    this.material.needsUpdate = true;
  }

  update(delta, velocity, isDead = false) {
    if (isDead) {
      this.group.rotation.x = Math.PI / 2;
      return;
    }

    const speed = velocity.length();
    if (speed > 0.1) {
      this.walkCycle += delta * speed * 4.5;
      this.animateWalking(this.walkCycle);
    } else {
      this.walkCycle = 0;
      this.animateWalking(0);
    }
  }

  animateWalking(t) {
    // Override in specific models to animate legs/arms
  }
}
