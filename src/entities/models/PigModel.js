import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class PigModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Body (10x8x16 pixels)
    this.body = this.createPart(
      'body',
      10 * unit,
      8 * unit,
      16 * unit,
      0,
      0,
      0,
      {
        u: 28,
        v: 8,
        w: 10,
        h: 8,
        d: 16,
        th: 32,
      }
    );

    // Head (8x8x8 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2 * unit, 8 * unit);
    this.head = this.createPart(
      'head',
      8 * unit,
      8 * unit,
      8 * unit,
      0,
      2 * unit,
      2 * unit,
      {
        u: 0,
        v: 0,
        w: 8,
        h: 8,
        d: 8,
        th: 32,
      }
    );
    headGroup.add(this.head);

    // Snout (4x3x1)
    const snout = this.createPart(
      'snout',
      4 * unit,
      3 * unit,
      1 * unit,
      0,
      0,
      6 * unit,
      {
        u: 16,
        v: 16,
        w: 4,
        h: 3,
        d: 1,
        th: 32,
      }
    );
    headGroup.add(snout);

    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Legs (4x12x4 -> wait, pig legs are short, 4x6x4)
    const legUV = { u: 0, v: 16, w: 4, h: 6, d: 4, th: 32 };
    this.legFR = this.createPart(
      'legFR',
      4 * unit,
      6 * unit,
      4 * unit,
      3 * unit,
      -7 * unit,
      5 * unit,
      legUV
    );
    this.legFL = this.createPart(
      'legFL',
      4 * unit,
      6 * unit,
      4 * unit,
      -3 * unit,
      -7 * unit,
      5 * unit,
      legUV
    );
    this.legBR = this.createPart(
      'legBR',
      4 * unit,
      6 * unit,
      4 * unit,
      3 * unit,
      -7 * unit,
      -5 * unit,
      legUV
    );
    this.legBL = this.createPart(
      'legBL',
      4 * unit,
      6 * unit,
      4 * unit,
      -3 * unit,
      -7 * unit,
      -5 * unit,
      legUV
    );

    this.group.position.y = 0.625; // ground offset
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
