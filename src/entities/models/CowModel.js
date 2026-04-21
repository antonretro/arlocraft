import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class CowModel extends BaseModel {
  constructor() {
    super();

    // Cow scale: 16px = 1.0 units
    const unit = 1 / 16;

    // Body (12x10x18 pixels)
    this.body = this.createPart(
      'body',
      12 * unit,
      10 * unit,
      18 * unit,
      0,
      2 * unit,
      2 * unit,
      {
        u: 18,
        v: 4,
        w: 12,
        h: 10,
        d: 18,
        th: 32,
      }
    );

    // Head (8x8x6 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 4 * unit, 11 * unit);
    this.head = this.createPart(
      'head',
      8 * unit,
      8 * unit,
      6 * unit,
      0,
      2 * unit,
      2 * unit,
      {
        u: 0,
        v: 0,
        w: 8,
        h: 8,
        d: 6,
        th: 32,
      }
    );
    headGroup.add(this.head);

    // Horns (1x3x1 each)
    const hornL = this.createPart(
      'hornL',
      1 * unit,
      3 * unit,
      1 * unit,
      -4 * unit,
      6 * unit,
      1 * unit,
      {
        u: 22,
        v: 0,
        w: 1,
        h: 3,
        d: 1,
        th: 32,
      }
    );
    const hornR = this.createPart(
      'hornR',
      1 * unit,
      3 * unit,
      1 * unit,
      4 * unit,
      6 * unit,
      1 * unit,
      {
        u: 22,
        v: 0,
        w: 1,
        h: 3,
        d: 1,
        th: 32,
      }
    );
    headGroup.add(hornL);
    headGroup.add(hornR);

    // Muzzle/Nose (4x3x1)
    const muzzle = this.createPart(
      'muzzle',
      4 * unit,
      3 * unit,
      1 * unit,
      0,
      0,
      5 * unit,
      {
        u: 0,
        v: 14,
        w: 4,
        h: 3,
        d: 1,
        th: 32,
      }
    );
    headGroup.add(muzzle);

    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Udder (4x3x6)
    this.udder = this.createPart(
      'udder',
      4 * unit,
      3 * unit,
      6 * unit,
      0,
      -5 * unit,
      -2 * unit,
      {
        u: 52,
        v: 0,
        w: 4,
        h: 3,
        d: 6,
        th: 32,
      }
    );

    // Legs (4x12x4)
    const legUV = { u: 0, v: 16, w: 4, h: 12, d: 4, th: 32 };
    this.legFR = this.createPart(
      'legFR',
      4 * unit,
      12 * unit,
      4 * unit,
      4 * unit,
      -11 * unit,
      7 * unit,
      legUV
    );
    this.legFL = this.createPart(
      'legFL',
      4 * unit,
      12 * unit,
      4 * unit,
      -4 * unit,
      -11 * unit,
      7 * unit,
      legUV
    );
    this.legBR = this.createPart(
      'legBR',
      4 * unit,
      12 * unit,
      4 * unit,
      4 * unit,
      -11 * unit,
      -5 * unit,
      legUV
    );
    this.legBL = this.createPart(
      'legBL',
      4 * unit,
      12 * unit,
      4 * unit,
      -4 * unit,
      -11 * unit,
      -5 * unit,
      legUV
    );

    // Adjust entire group so feet are at ground level
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
