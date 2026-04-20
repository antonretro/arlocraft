import * as THREE from 'three';
import { BaseModel } from './BaseModel.js';

export class VillagerModel extends BaseModel {
  constructor() {
    super();

    const unit = 1 / 16;

    // Head (8x10x8)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 24 * unit, 0);
    this.head = this.createPart('head', 8 * unit, 10 * unit, 8 * unit, 0, 5 * unit, 0, {
      u: 0, v: 0, w: 8, h: 10, d: 8
    });
    headGroup.add(this.head);

    // Nose (2x4x2)
    this.nose = this.createPart('nose', 2 * unit, 4 * unit, 2 * unit, 0, 1 * unit, -5 * unit, {
      u: 24, v: 0, w: 2, h: 4, d: 2
    });
    headGroup.add(this.nose);
    
    this.parts['headGroup'] = headGroup;
    this.group.add(headGroup);

    // Body (8x12x6 Robe)
    this.body = this.createPart('body', 8 * unit, 12 * unit, 6 * unit, 0, 18 * unit, 0, {
      u: 16, v: 20, w: 8, h: 12, d: 6
    });

    // Folded Arms (Unique to Villager)
    // In MC, this is often a single group with multiple boxes. 
    // We'll simplify to two side pods and a middle bar.
    const armsGroup = new THREE.Group();
    armsGroup.position.set(0, 18 * unit, -2 * unit);
    
    // Middle bar
    this.armsMiddle = this.createPart('armsMiddle', 8 * unit, 4 * unit, 4 * unit, 0, 0, -2 * unit, {
      u: 40, v: 38, w: 8, h: 4, d: 4
    });
    armsGroup.add(this.armsMiddle);
    
    // Side arm L
    this.armL = this.createPart('armL', 4 * unit, 8 * unit, 4 * unit, -4 * unit, 2 * unit, -2 * unit, {
      u: 44, v: 22, w: 4, h: 8, d: 4
    });
    armsGroup.add(this.armL);

    // Side arm R
    this.armR = this.createPart('armR', 4 * unit, 8 * unit, 4 * unit, 4 * unit, 2 * unit, -2 * unit, {
      u: 44, v: 22, w: 4, h: 8, d: 4
    });
    armsGroup.add(this.armR);

    this.parts['armsGroup'] = armsGroup;
    this.group.add(armsGroup);

    // Legs (4x12x4)
    const legUV = { u: 0, v: 22, w: 4, h: 12, d: 4 };
    this.legR = this.createPart('legR', 4 * unit, 12 * unit, 4 * unit, 2 * unit, 6 * unit, 0, legUV);
    this.legL = this.createPart('legL', 4 * unit, 12 * unit, 4 * unit, -2 * unit, 6 * unit, 0, legUV);

    this.group.position.y = 0;
  }

  animateWalking(t) {
    const s = Math.sin(t);
    const speed = 0.5;
    const unit = 1 / 16;
    
    this.parts.legR.rotation.x = s * speed;
    this.parts.legL.rotation.x = -s * speed;

    // Villagers don't swing individual arms, but their arm-bundle might bob
    if (this.parts.armsGroup) {
      this.parts.armsGroup.position.y = (18 * unit) + Math.abs(s) * 0.05;
    }

    if (this.parts.headGroup) {
      this.parts.headGroup.rotation.y = Math.sin(t * 0.2) * 0.1;
    }
  }
}
