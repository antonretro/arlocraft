import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class HumanoidModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Head (8x8x8 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 24 * unit, 0);
    this.head = this.createPart(
      'head',
      8 * unit,
      8 * unit,
      8 * unit,
      0,
      4 * unit,
      0,
      {
        u: 0,
        v: 0,
        w: 8,
        h: 8,
        d: 8,
      }
    );
    headGroup.add(this.head);
    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Body (8x12x4)
    this.body = this.createPart(
      'body',
      8 * unit,
      12 * unit,
      4 * unit,
      0,
      18 * unit,
      0,
      {
        u: 16,
        v: 16,
        w: 8,
        h: 12,
        d: 4,
      }
    );

    // Arms (4x12x4)
    const armUV = { u: 40, v: 16, w: 4, h: 12, d: 4 };
    this.armR = this.createPart(
      'armR',
      4 * unit,
      12 * unit,
      4 * unit,
      6 * unit,
      18 * unit,
      0,
      armUV
    );
    this.armL = this.createPart(
      'armL',
      4 * unit,
      12 * unit,
      4 * unit,
      -6 * unit,
      18 * unit,
      0,
      armUV
    );

    // Legs (4x12x4)
    const legUV = { u: 0, v: 16, w: 4, h: 12, d: 4 };
    this.legR = this.createPart(
      'legR',
      4 * unit,
      12 * unit,
      4 * unit,
      2 * unit,
      6 * unit,
      0,
      legUV
    );
    this.legL = this.createPart(
      'legL',
      4 * unit,
      12 * unit,
      4 * unit,
      -2 * unit,
      6 * unit,
      0,
      legUV
    );

    this.group.position.y = 0;
  }

  animateWalking(t) {
    const s = Math.sin(t);
    const speed = 0.7;

    this.parts.legR.rotation.x = s * speed;
    this.parts.legL.rotation.x = -s * speed;

    // Humanoid swing arms opposite legs
    this.parts.armR.rotation.x = -s * speed;
    this.parts.armL.rotation.x = s * speed;

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.y = Math.sin(t * 0.2) * 0.1;
    }
  }
}
