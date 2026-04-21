import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class SheepModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Body (10x10x16 pixels)
    this.body = this.createPart(
      'body',
      10 * unit,
      10 * unit,
      16 * unit,
      0,
      2 * unit,
      0,
      {
        u: 28,
        v: 8,
        w: 10,
        h: 10,
        d: 16,
      }
    );

    // Head (6x6x8 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 6 * unit, 8 * unit);
    this.head = this.createPart('head', 6 * unit, 6 * unit, 8 * unit, 0, 0, 0, {
      u: 0,
      v: 0,
      w: 6,
      h: 6,
      d: 8,
    });
    headGroup.add(this.head);

    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Legs (4x12x4)
    const legUV = { u: 0, v: 16, w: 4, h: 12, d: 4 };
    this.legFR = this.createPart(
      'legFR',
      4 * unit,
      12 * unit,
      4 * unit,
      3 * unit,
      -10 * unit,
      5 * unit,
      legUV
    );
    this.legFL = this.createPart(
      'legFL',
      4 * unit,
      12 * unit,
      4 * unit,
      -3 * unit,
      -10 * unit,
      5 * unit,
      legUV
    );
    this.legBR = this.createPart(
      'legBR',
      4 * unit,
      12 * unit,
      4 * unit,
      3 * unit,
      -10 * unit,
      -5 * unit,
      legUV
    );
    this.legBL = this.createPart(
      'legBL',
      4 * unit,
      12 * unit,
      4 * unit,
      -3 * unit,
      -10 * unit,
      -5 * unit,
      legUV
    );

    this.group.position.y = 1.0;
  }

  animateWalking(t) {
    const angle = 0.45;
    const s = Math.sin(t);
    this.parts.legFR.rotation.x = s * angle;
    this.parts.legBL.rotation.x = s * angle;
    this.parts.legFL.rotation.x = -s * angle;
    this.parts.legBR.rotation.x = -s * angle;

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.x = Math.sin(t * 0.5) * 0.08;
    }
  }
}
