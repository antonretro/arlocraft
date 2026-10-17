import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

const UNIT = 1 / 16;

/**
 * Data-driven cuboid model. Parts are written in Minecraft model space
 * (pixels, +Y down, feet at y = 24, head towards -Z) so specs can be copied
 * straight from vanilla model definitions; they are converted here to
 * three.js space (+Y up, feet at 0, head towards +Z).
 *
 * Part spec:
 *   name, uv: [u, v], box: [ox, oy, oz, w, h, d] (relative to pivot),
 *   pivot: [x, y, z], rot: [rx, ry, rz] (radians, Minecraft convention),
 *   anim: 'legA' | 'legB' | 'armA' | 'armB' | 'wingL' | 'wingR' | 'tail' | 'spin',
 *   inflate: grows the box without changing its UVs (armour/fur layers),
 *   overlay: true renders the part with the overlay texture (e.g. sheep wool)
 */
export class BoxModel extends BaseModel {
  constructor(spec) {
    super();
    this.spec = spec;
    this.animated = [];
    const tw = spec.texWidth ?? 64;
    const th = spec.texHeight ?? 32;
    this.overlayMaterial = null;

    for (const part of spec.parts) {
      const [ox, oy, oz, w, h, d] = part.box;
      const grow = (part.inflate ?? 0) * 2;
      const [px, py, pz] = part.pivot ?? [0, 0, 0];
      const [rx, ry, rz] = part.rot ?? [0, 0, 0];

      // Pivot in three.js space.
      const pivot = new THREE.Group();
      pivot.position.set(px * UNIT, (24 - py) * UNIT, -pz * UNIT);
      // A rotation about X keeps its sign under the Y/Z flip; Y and Z flip.
      pivot.rotation.set(rx, -ry, -rz);

      // Box centre relative to the pivot, in three.js space. Zero-thickness
      // fins and wings get a hair of depth so they still render.
      const mesh = this.createPart(
        part.name,
        Math.max(w + grow, 0.02) * UNIT,
        Math.max(h + grow, 0.02) * UNIT,
        Math.max(d + grow, 0.02) * UNIT,
        (ox + w / 2) * UNIT,
        -(oy + h / 2) * UNIT,
        -(oz + d / 2) * UNIT,
        { u: part.uv[0], v: part.uv[1], w, h, d, tw, th }
      );
      // createPart parented the mesh to the root group; move it under the pivot.
      this.group.remove(mesh);
      pivot.add(mesh);
      if (part.overlay) {
        if (!this.overlayMaterial) {
          this.overlayMaterial = new THREE.MeshLambertMaterial({
            transparent: true,
            alphaTest: 0.1,
            visible: false,
          });
        }
        mesh.material = this.overlayMaterial;
      }
      this.group.add(pivot);

      if (part.anim) {
        this.animated.push({
          pivot,
          anim: part.anim,
          base: pivot.rotation.clone(),
          amp: part.amp ?? spec.swing ?? 0.6,
        });
      }
    }
  }

  setOverlayTexture(texture) {
    if (!texture || !this.overlayMaterial) return;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    this.overlayMaterial.map = texture;
    this.overlayMaterial.visible = true;
    this.overlayMaterial.needsUpdate = true;
  }

  dispose() {
    super.dispose();
    this.overlayMaterial?.dispose();
  }

  update(delta, velocity, isDead = false) {
    if (isDead) {
      this.group.rotation.z = Math.PI / 2;
      return;
    }
    const speed = velocity.length();
    this.walkCycle += delta * Math.max(speed, 0.2) * 4.5;
    this.idleTime = (this.idleTime ?? 0) + delta;
    const moving = speed > 0.1;
    const s = moving ? Math.sin(this.walkCycle) : 0;
    const flap = Math.sin(this.idleTime * (this.spec.flapRate ?? 18));
    const sway = Math.sin(this.idleTime * 2.2);

    for (const item of this.animated) {
      const { pivot, base, amp } = item;
      switch (item.anim) {
        case 'legA':
          pivot.rotation.x = base.x + s * amp;
          break;
        case 'legB':
          pivot.rotation.x = base.x - s * amp;
          break;
        case 'armA':
          pivot.rotation.x = base.x - s * amp * 0.8;
          break;
        case 'armB':
          pivot.rotation.x = base.x + s * amp * 0.8;
          break;
        case 'wingL':
          pivot.rotation.z = base.z + flap * amp;
          break;
        case 'wingR':
          pivot.rotation.z = base.z - flap * amp;
          break;
        case 'tail':
          pivot.rotation.y = base.y + sway * amp * 0.5;
          break;
        case 'spin':
          pivot.rotation.x = base.x + Math.sin(this.idleTime * 3) * amp * 0.4;
          break;
        default:
          break;
      }
    }
  }
}
