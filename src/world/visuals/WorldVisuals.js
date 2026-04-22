import * as THREE from 'three';

export class WorldVisuals {
  constructor(scene) {
    this.scene = scene;
    this.sharedChunkGeometries = this._initGeometries();
    this.hoverOutline = this._initHoverOutline();
    this.placementOutline = this._initPlacementOutline();
    this.miningCracks = this._initMiningCracks();

    this.scene.add(this.hoverOutline);
    this.scene.add(this.placementOutline);
    this.scene.add(this.miningCracks);
  }

  _initGeometries() {
    const withWhiteVertexColors = (geo) => {
      const count = geo.attributes.position.count;
      const colors = new Float32Array(count * 3);
      colors.fill(1.0);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    };

    return {
      solid: withWhiteVertexColors(new THREE.BoxGeometry(1, 1, 1)),
      path: (() => {
        const height = 0.9375;
        const geo = new THREE.BoxGeometry(1.001, height, 1.001);
        geo.translate(0, (height - 1) / 2, 0);
        // Manual UV cropping for side faces (0, 1, 4, 5) to avoid squishing
        // We crop one extra texel from the top of the side texture so the
        // dark seam on dirt path edges does not render as a visible black line.
        const uv = geo.attributes.uv;
        const sideFaces = [0, 1, 4, 5];
        const topSideV = 14 / 16;
        for (const faceIdx of sideFaces) {
          const start = faceIdx * 4;
          // uv is Top-Left, Top-Right, Bottom-Left, Bottom-Right
          // In Three.js BoxGeometry:
          // vertex 0: TL, 1: TR, 2: BL, 3: BR
          // Standard UVs are [0,1], [1,1], [0,0], [1,0].
          // Path blocks are 15/16 tall, but we intentionally shave off the top
          // texel row from the side texture to hide the dark border artifact.
          uv.setY(start + 0, topSideV); // TL
          uv.setY(start + 1, topSideV); // TR
          uv.setY(start + 2, 0); // BL
          uv.setY(start + 3, 0); // BR
        }
        return withWhiteVertexColors(geo);
      })(),
      farmland: (() => {
        const height = 0.9375;
        const geo = new THREE.BoxGeometry(1.001, height, 1.001);
        geo.translate(0, (height - 1) / 2, 0);
        const uv = geo.attributes.uv;
        const sideFaces = [0, 1, 4, 5];
        for (const faceIdx of sideFaces) {
          const start = faceIdx * 4;
          uv.setY(start + 0, 0.9375);
          uv.setY(start + 1, 0.9375);
          uv.setY(start + 2, 0);
          uv.setY(start + 3, 0);
        }
        return withWhiteVertexColors(geo);
      })(),
      cake: (() => {
        const geo = new THREE.BoxGeometry(0.875, 0.4375, 0.875); // 14/16 wide, 7/16 high
        geo.translate(0, -0.28125, 0);
        return withWhiteVertexColors(geo);
      })(),
      water: (() => {
        // Feature: Box-based water for standalone cases
        const geo = new THREE.BoxGeometry(1, 0.9375, 1);
        geo.translate(0, -0.03125, 0);
        return withWhiteVertexColors(geo);
      })(),
      water_top: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0.4375, 0); // Align with 15/16 height
        return withWhiteVertexColors(geo);
      })(),
      water_side: (() => {
        const geo = new THREE.PlaneGeometry(1.0, 0.9375); // Flush with blocks (No more land clipping)
        geo.translate(0, -0.03125, 0);
        geo.translate(0, 0, 0.5);
        return withWhiteVertexColors(geo);
      })(),
      paneCenter: (() => {
        const geo = new THREE.BoxGeometry(0.125, 1, 0.125);
        return withWhiteVertexColors(geo);
      })(),
      paneNorth: (() => {
        const geo = new THREE.BoxGeometry(0.125, 1, 0.5);
        geo.translate(0, 0, -0.25);
        return withWhiteVertexColors(geo);
      })(),
      paneSouth: (() => {
        const geo = new THREE.BoxGeometry(0.125, 1, 0.5);
        geo.translate(0, 0, 0.25);
        return withWhiteVertexColors(geo);
      })(),
      paneEast: (() => {
        const geo = new THREE.BoxGeometry(0.5, 1, 0.125);
        geo.translate(0.25, 0, 0);
        return withWhiteVertexColors(geo);
      })(),
      paneWest: (() => {
        const geo = new THREE.BoxGeometry(0.5, 1, 0.125);
        geo.translate(-0.25, 0, 0);
        return withWhiteVertexColors(geo);
      })(),
      deco: (() => {
        const p1 = new THREE.PlaneGeometry(1, 1);
        p1.rotateY(Math.PI / 4);
        const p2 = new THREE.PlaneGeometry(1, 1);
        p2.rotateY(-Math.PI / 4);
        const merged = new THREE.BufferGeometry();
        const pos1 = p1.attributes.position.array;
        const pos2 = p2.attributes.position.array;
        const uv1 = p1.attributes.uv.array;
        const uv2 = p2.attributes.uv.array;
        const norm1 = p1.attributes.normal.array;
        const norm2 = p2.attributes.normal.array;
        const idx1 = Array.from(p1.index.array);
        const idx2 = Array.from(p2.index.array).map((i) => i + 4);
        merged.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([...pos1, ...pos2], 3)
        );
        merged.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute([...uv1, ...uv2], 2)
        );
        merged.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute([...norm1, ...norm2], 3)
        );
        merged.setIndex([...idx1, ...idx2]);
        return withWhiteVertexColors(merged);
      })(),
      tallDeco: (() => {
        // Correct 2-block height centering
        const p1 = new THREE.PlaneGeometry(1, 2);
        p1.rotateY(Math.PI / 4);
        p1.translate(0, 0.5, 0); // Corrected: y-range is -0.5 to 1.5, relative to block-center y=0.5 -> absolute 0 to 2
        const p2 = new THREE.PlaneGeometry(1, 2);
        p2.rotateY(-Math.PI / 4);
        p2.translate(0, 0.5, 0);
        const merged = new THREE.BufferGeometry();
        const pos1 = p1.attributes.position.array;
        const pos2 = p2.attributes.position.array;
        const uv1 = p1.attributes.uv.array;
        const uv2 = p2.attributes.uv.array;
        const norm1 = p1.attributes.normal.array;
        const norm2 = p2.attributes.normal.array;
        const idx1 = Array.from(p1.index.array);
        const idx2 = Array.from(p2.index.array).map((i) => i + 4);
        merged.setAttribute('position', new THREE.Float32BufferAttribute([...pos1, ...pos2], 3));
        merged.setAttribute('uv', new THREE.Float32BufferAttribute([...uv1, ...uv2], 2));
        merged.setAttribute('normal', new THREE.Float32BufferAttribute([...norm1, ...norm2], 3));
        merged.setIndex([...idx1, ...idx2]);
        return withWhiteVertexColors(merged);
      })(),
      decoLOD: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.translate(0, 0, 0);
        return withWhiteVertexColors(geo);
      })(),
  tallDecoLOD: (() => {
    const geo = new THREE.PlaneGeometry(1, 2);
    geo.translate(0, 0.5, 0); // Corrected: y-range -0.5 to 1.5 -> relative to center 0.5 is 0 to 2
    return withWhiteVertexColors(geo);
  })(),
      face_top: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0.5, 0);
        geo.addGroup(0, 6, 2);
        return withWhiteVertexColors(geo);
      })(),
      face_bottom: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(Math.PI / 2);
        geo.translate(0, -0.5, 0);
        geo.addGroup(0, 6, 3);
        return withWhiteVertexColors(geo);
      })(),
      face_px: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateY(Math.PI / 2);
        geo.translate(0.5, 0, 0);
        geo.addGroup(0, 6, 0);
        return withWhiteVertexColors(geo);
      })(),
      face_nx: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateY(-Math.PI / 2);
        geo.translate(-0.5, 0, 0);
        geo.addGroup(0, 6, 1);
        return withWhiteVertexColors(geo);
      })(),
      face_pz: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.translate(0, 0, 0.5);
        geo.addGroup(0, 6, 4);
        return withWhiteVertexColors(geo);
      })(),
      face_nz: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateY(Math.PI);
        geo.translate(0, 0, -0.5);
        geo.addGroup(0, 6, 5);
        return withWhiteVertexColors(geo);
      })(),
      stair: (() => {
        const base = new THREE.BoxGeometry(1, 0.5, 1);
        base.translate(0, -0.25, 0);
        const step = new THREE.BoxGeometry(1, 0.5, 0.5);
        step.translate(0, 0.25, 0.25);
        const merged = new THREE.BufferGeometry();
        const pos = [
          ...base.attributes.position.array,
          ...step.attributes.position.array,
        ];
        const uv = [...base.attributes.uv.array, ...step.attributes.uv.array];
        const norm = [
          ...base.attributes.normal.array,
          ...step.attributes.normal.array,
        ];
        const idx = [
          ...Array.from(base.index.array),
          ...Array.from(step.index.array).map(
            (i) => i + base.attributes.position.count
          ),
        ];
        merged.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(pos, 3)
        );
        merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        merged.setAttribute(
          'normal',
          new THREE.Float32BufferAttribute(norm, 3)
        );
        merged.setIndex(idx);
        for (const group of base.groups) {
          merged.addGroup(group.start, group.count, group.materialIndex);
        }
        const baseIndexCount = base.index.count;
        for (const group of step.groups) {
          merged.addGroup(
            group.start + baseIndexCount,
            group.count,
            group.materialIndex
          );
        }
        return withWhiteVertexColors(merged);
      })(),
      stair_inner: (() => {
          // Inner corner: 3/4 of the block is covered
          const base = new THREE.BoxGeometry(1, 0.5, 1);
          base.translate(0, -0.25, 0);
          
          const step1 = new THREE.BoxGeometry(1, 0.5, 0.5);
          step1.translate(0, 0.25, 0.25);
          
          const step2 = new THREE.BoxGeometry(0.5, 0.5, 0.5);
          step2.translate(-0.25, 0.25, -0.25);
          
          const merged = new THREE.BufferGeometry();
          const pos = [...base.attributes.position.array, ...step1.attributes.position.array, ...step2.attributes.position.array];
          const uv = [...base.attributes.uv.array, ...step1.attributes.uv.array, ...step2.attributes.uv.array];
          const norm = [...base.attributes.normal.array, ...step1.attributes.normal.array, ...step2.attributes.normal.array];
          const idx = [
              ...Array.from(base.index.array),
              ...Array.from(step1.index.array).map(i => i + base.attributes.position.count),
              ...Array.from(step2.index.array).map(i => i + base.attributes.position.count + step1.attributes.position.count)
          ];
          merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          merged.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
          merged.setIndex(idx);
          
          let offset = 0;
          [base, step1, step2].forEach(b => {
              b.groups.forEach(g => merged.addGroup(g.start + offset, g.count, g.materialIndex));
              offset += b.index.count;
          });
          return withWhiteVertexColors(merged);
      })(),
      stair_outer: (() => {
          // Outer corner: 1/4 of the block is covered as a top step
          const base = new THREE.BoxGeometry(1, 0.5, 1);
          base.translate(0, -0.25, 0);
          
          const step = new THREE.BoxGeometry(0.5, 0.5, 0.5);
          step.translate(0.25, 0.25, 0.25);
          
          const merged = new THREE.BufferGeometry();
          const pos = [...base.attributes.position.array, ...step.attributes.position.array];
          const uv = [...base.attributes.uv.array, ...step.attributes.uv.array];
          const norm = [...base.attributes.normal.array, ...step.attributes.normal.array];
          const idx = [
              ...Array.from(base.index.array),
              ...Array.from(step.index.array).map(i => i + base.attributes.position.count)
          ];
          merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
          merged.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
          merged.setIndex(idx);
          
          let offset = 0;
          [base, step].forEach(b => {
              b.groups.forEach(g => merged.addGroup(g.start + offset, g.count, g.materialIndex));
              offset += b.index.count;
          });
          return withWhiteVertexColors(merged);
      })(),
      slab: (() => {
        const geo = new THREE.BoxGeometry(1, 0.5, 1);
        geo.translate(0, -0.25, 0);
        return withWhiteVertexColors(geo);
      })(),
      slab_top: (() => {
        const geo = new THREE.BoxGeometry(1, 0.5, 1);
        geo.translate(0, 0.25, 0);
        return withWhiteVertexColors(geo);
      })(),
      trapdoor: (() => {
        const geo = new THREE.BoxGeometry(1, 0.125, 1);
        geo.translate(0, -0.4375, 0);
        return withWhiteVertexColors(geo);
      })(),
      door: (() => {
        const geo = new THREE.BoxGeometry(1, 1, 0.125);
        return withWhiteVertexColors(geo);
      })(),
      sign: (() => {
        const board = new THREE.BoxGeometry(0.875, 0.5, 0.0625);
        board.translate(0, 0.25, 0);
        const stick = new THREE.BoxGeometry(0.125, 0.5, 0.125);
        stick.translate(0, -0.25, 0);
        
        // Manual merge
        const merged = new THREE.BufferGeometry();
        const bPos = board.attributes.position.array;
        const sPos = stick.attributes.position.array;
        const bUv = board.attributes.uv.array;
        const sUv = stick.attributes.uv.array;
        const bNorm = board.attributes.normal.array;
        const sNorm = stick.attributes.normal.array;
        const bIdx = Array.from(board.index.array);
        const sIdx = Array.from(stick.index.array).map(i => i + board.attributes.position.count);
        
        merged.setAttribute('position', new THREE.Float32BufferAttribute([...bPos, ...sPos], 3));
        merged.setAttribute('uv', new THREE.Float32BufferAttribute([...bUv, ...sUv], 2));
        merged.setAttribute('normal', new THREE.Float32BufferAttribute([...bNorm, ...sNorm], 3));
        merged.setIndex([...bIdx, ...sIdx]);
        for (const group of board.groups) {
          merged.addGroup(group.start, group.count, group.materialIndex);
        }
        const boardIndexCount = board.index.count;
        for (const group of stick.groups) {
          merged.addGroup(
            group.start + boardIndexCount,
            group.count,
            group.materialIndex
          );
        }
        return withWhiteVertexColors(merged);
      })(),
      grass_block_top: (() => {
        const geo = new THREE.PlaneGeometry(1.002, 1.002);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0.5002, 0); // Tiny lift to eliminate seams and Z-fighting
        return withWhiteVertexColors(geo);
      })(),
      flat: (() => {
        const geo = new THREE.PlaneGeometry(1, 1);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, -0.49, 0);
        return withWhiteVertexColors(geo);
      })(),
      solid_no_top: (() => {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        // Preserve face groups so multi-material blocks like grass_block_sides
        // still map the correct textures onto each remaining face.
        const oldIndices = Array.from(geo.index.array);
        const faces = [
          { materialIndex: 0, start: 0 },
          { materialIndex: 1, start: 6 },
          { materialIndex: 2, start: 12 }, // top
          { materialIndex: 3, start: 18 },
          { materialIndex: 4, start: 24 },
          { materialIndex: 5, start: 30 },
        ];
        const newIndices = [];
        const groups = [];

        for (const face of faces) {
          if (face.materialIndex === 2) continue;
          const groupStart = newIndices.length;
          for (let j = 0; j < 6; j++) {
            newIndices.push(oldIndices[face.start + j]);
          }
          groups.push({
            start: groupStart,
            count: 6,
            materialIndex: face.materialIndex,
          });
        }

        const result = new THREE.BufferGeometry();
        result.setAttribute('position', geo.attributes.position);
        result.setAttribute('uv', geo.attributes.uv);
        result.setAttribute('normal', geo.attributes.normal);
        result.setIndex(newIndices);
        for (const group of groups) {
          result.addGroup(group.start, group.count, group.materialIndex);
        }
        return withWhiteVertexColors(result);
      })(),
    };
  }

  _initHoverOutline() {
    const hoverGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(hoverGeo, hoverMat);
    const borderGeo = new THREE.BoxGeometry(1.003, 1.003, 1.003);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    mesh.add(new THREE.Mesh(borderGeo, borderMat));
    mesh.visible = false;
    mesh.renderOrder = 5;
    return mesh;
  }

  _initPlacementOutline() {
    const borderGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(borderGeo, borderMat);
    mesh.visible = false;
    mesh.renderOrder = 6;
    return mesh;
  }

  _initMiningCracks() {
    const crackGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const mesh = new THREE.Mesh(
      crackGeo,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
      })
    );
    mesh.visible = false;
    return mesh;
  }

  updateHover(x, y, z, visible) {
    this.hoverOutline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.hoverOutline.visible = visible;
  }

  updatePlacement(x, y, z, visible) {
    this.placementOutline.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.placementOutline.visible = visible;
  }

  updateMiningCracks(x, y, z, visible, material, geometry = null) {
    this.miningCracks.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.miningCracks.visible = visible;
    if (material) this.miningCracks.material = material;
    if (geometry && this.miningCracks.geometry !== geometry) {
      this.miningCracks.geometry = geometry;
    }
  }

  update(_time) {}
}
