import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class SkeletonModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Head (8x8x8 pixels)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 24 * unit, 0);
    this.head = this.createPart('head', 8 * unit, 8 * unit, 8 * unit, 0, 4 * unit, 0, {
      u: 0, v: 0, w: 8, h: 8, d: 8
    });
    headGroup.add(this.head);
    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Body (8x12x4)
    this.body = this.createPart('body', 8 * unit, 12 * unit, 4 * unit, 0, 18 * unit, 0, {
      u: 16, v: 16, w: 8, h: 12, d: 4
    });

    // Arms (2x12x2) - Skeletons have thin limbs
    const armUV = { u: 40, v: 16, w: 2, h: 12, d: 2 };
    this.armR = this.createPart('armR', 2 * unit, 12 * unit, 2 * unit, 5 * unit, 18 * unit, 0, armUV);
    this.armL = this.createPart('armL', 2 * unit, 12 * unit, 2 * unit, -5 * unit, 18 * unit, 0, armUV);

    // Initial pose: Ready to shoot?
    this.armR.rotation.x = -Math.PI / 3;
    this.armL.rotation.x = -Math.PI / 3;

    // Legs (2x12x2)
    const legUV = { u: 0, v: 16, w: 2, h: 12, d: 2 };
    this.legR = this.createPart('legR', 2 * unit, 12 * unit, 2 * unit, 2 * unit, 6 * unit, 0, legUV);
    this.legL = this.createPart('legL', 2 * unit, 12 * unit, 2 * unit, -2 * unit, 6 * unit, 0, legUV);

    this.group.position.y = 0;
  }

  animateWalking(t) {
    const s = Math.sin(t);
    const speed = 0.7;
    
    this.parts.legR.rotation.x = s * speed;
    this.parts.legL.rotation.x = -s * speed;

    // Skeletons walk with stiff arms or slight bob
    this.parts.armR.rotation.x = -Math.PI / 3 + s * 0.1;
    this.parts.armL.rotation.x = -Math.PI / 3 - s * 0.1;

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.y = Math.sin(t * 0.2) * 0.1;
    }
  }
}
