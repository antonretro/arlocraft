import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class CreeperModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Head (8x8x8 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 18 * unit, 0);
    this.head = this.createPart('head', 8 * unit, 8 * unit, 8 * unit, 0, 4 * unit, 0, {
      u: 0, v: 0, w: 8, h: 8, d: 8
    });
    headGroup.add(this.head);
    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Body (8x12x4)
    this.body = this.createPart('body', 8 * unit, 12 * unit, 4 * unit, 0, 12 * unit, 0, {
      u: 16, v: 16, w: 8, h: 12, d: 4
    });

    // Legs (4x6x4) - 4 legs
    const legUV = { u: 0, v: 16, w: 4, h: 6, d: 4 };
    this.legFR = this.createPart('legFR', 4 * unit, 6 * unit, 4 * unit, 2 * unit, 3 * unit, 4 * unit, legUV);
    this.legFL = this.createPart('legFL', 4 * unit, 6 * unit, 4 * unit, -2 * unit, 3 * unit, 4 * unit, legUV);
    this.legBR = this.createPart('legBR', 4 * unit, 6 * unit, 4 * unit, 2 * unit, 3 * unit, -4 * unit, legUV);
    this.legBL = this.createPart('legBL', 4 * unit, 6 * unit, 4 * unit, -2 * unit, 3 * unit, -4 * unit, legUV);

    this.group.position.y = 0;
  }

  animateWalking(t) {
    const s = Math.sin(t);
    const speed = 0.7;

    this.parts.legFR.rotation.x = s * speed;
    this.parts.legBL.rotation.x = s * speed;
    this.parts.legFL.rotation.x = -s * speed;
    this.parts.legBR.rotation.x = -s * speed;

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.y = Math.sin(t * 0.4) * 0.15;
    }
  }
}
