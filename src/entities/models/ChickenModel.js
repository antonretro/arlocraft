import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class ChickenModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Body (6x6x8 pixels)
    this.body = this.createPart(
      'body',
      6 * unit,
      6 * unit,
      8 * unit,
      0,
      7 * unit,
      0,
      {
        u: 0,
        v: 9,
        w: 6,
        h: 6,
        d: 8,
        th: 32,
      }
    );

    // Head (4x6x3 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 10 * unit, 4 * unit);
    this.head = this.createPart(
      'head',
      4 * unit,
      6 * unit,
      3 * unit,
      0,
      3 * unit,
      1.5 * unit,
      {
        u: 0,
        v: 0,
        w: 4,
        h: 6,
        d: 3,
        th: 32,
      }
    );
    headGroup.add(this.head);

    // Bill / Beak (4x2x2)
    const bill = this.createPart(
      'bill',
      4 * unit,
      2 * unit,
      2 * unit,
      0,
      2 * unit,
      4 * unit,
      {
        u: 14,
        v: 0,
        w: 4,
        h: 2,
        d: 2,
        th: 32,
      }
    );
    headGroup.add(bill);

    // Wattle (2x2x2)
    const wattle = this.createPart(
      'wattle',
      2 * unit,
      2 * unit,
      2 * unit,
      0,
      0,
      4 * unit,
      {
        u: 14,
        v: 4,
        w: 2,
        h: 2,
        d: 2,
        th: 32,
      }
    );
    headGroup.add(wattle);

    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Wings (1x4x6)
    this.wingL = this.createPart(
      'wingL',
      1 * unit,
      4 * unit,
      6 * unit,
      -3.5 * unit,
      8 * unit,
      0,
      {
        u: 24,
        v: 13,
        w: 1,
        h: 4,
        d: 6,
        th: 32,
      }
    );
    this.wingR = this.createPart(
      'wingR',
      1 * unit,
      4 * unit,
      6 * unit,
      3.5 * unit,
      8 * unit,
      0,
      {
        u: 24,
        v: 13,
        w: 1,
        h: 4,
        d: 6,
        th: 32,
      }
    );

    // Legs (3x5x3) - simpler rod representation
    const legUV = { u: 26, v: 0, w: 3, h: 5, d: 3, th: 32 };
    this.legL = this.createPart(
      'legL',
      1 * unit,
      5 * unit,
      1 * unit,
      -1.5 * unit,
      2.5 * unit,
      1 * unit,
      legUV
    );
    this.legR = this.createPart(
      'legR',
      1 * unit,
      5 * unit,
      1 * unit,
      1.5 * unit,
      2.5 * unit,
      1 * unit,
      legUV
    );

    // Feet (3x0x4) - flat planes for feet
    // Simplified for now: just more legs

    this.group.position.y = 0;
  }

  animateWalking(t) {
    const s = Math.sin(t);
    const speed = 0.8;
    this.parts.legL.rotation.x = s * speed;
    this.parts.legR.rotation.x = -s * speed;

    // Wing flapping
    this.parts.wingL.rotation.z = Math.abs(s) * 0.4;
    this.parts.wingR.rotation.z = -Math.abs(s) * 0.4;

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.x = Math.sin(t * 0.5) * 0.1;
    }
  }
}
