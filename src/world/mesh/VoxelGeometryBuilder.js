import * as THREE from 'three';

/**
 * High-Performance VoxelGeometryBuilder (Refined)
 * 
 * Improvements:
 * - Fixed texture rotations (Up = Y standard)
 * - Basis Parity Check for robust triangle winding
 * - Refined grass tinting (Top face strictly)
 */
export class VoxelGeometryBuilder {
  constructor(world) {
    this.world = world;
    this.cs = world.chunkSize;
    const ps = this.cs + 2; 
    const csSq = this.cs * this.cs;

    // --- REUSABLE BUFFERS ---
    this.sharedData = new Int32Array(ps * ps * ps);

    const maxFaces = (this.cs + 1) * csSq * 3 * 2;
    this.verticesArr = new Float32Array(maxFaces * 4 * 3);
    this.normalsArr = new Float32Array(maxFaces * 4 * 3);
    this.colorsArr = new Float32Array(maxFaces * 4 * 3);
    this.uvsArr = new Float32Array(maxFaces * 4 * 2);
    this.indicesArr = new Uint32Array(maxFaces * 6); 

    // --- SCRATCHPADS ---
    this.mask = new Int32Array(csSq);
    this.tmpColor = new THREE.Color();
    this.chunkColorMap = new Float32Array(csSq * 3);

    this.tmpP = new Int32Array(3);
    this.tmpDu = new Int32Array(3);
    this.tmpDv = new Int32Array(3);
    this.tmpCorners = [
      new Int32Array(3), new Int32Array(3),
      new Int32Array(3), new Int32Array(3),
    ];

    this.propCache = world.state.propertyCache;
    this.grassId = world.state.getInternalId('grass_block');
    this.grassAltId = world.state.getInternalId('grass');
    this.pathId = world.state.getInternalId('path_block');
    this.farmlandId = world.state.getInternalId('farmland');
  }

  _getAxes(axis) {
    /**
     * Standard Texture Orientation:
     * Axis 0 (X): u=2 (Z), v=1 (Y) -> LH
     * Axis 1 (Y): u=0 (X), v=2 (Z) -> LH
     * Axis 2 (Z): u=0 (X), v=1 (Y) -> RH
     */
    if (axis === 0) return { u: 2, v: 1, w: 0, rh: false };
    if (axis === 1) return { u: 0, v: 2, w: 1, rh: false };
    return { u: 0, v: 1, w: 2, rh: true };
  }

  _isTransparent(rawId) {
    if (rawId === 0) return true;
    const props = this.propCache[rawId];
    return (props & 0x02) !== 0 || (props & 0x08) !== 0;
  }

  _isOpaque(rawId) {
    return rawId !== 0 && ((this.propCache[rawId] & 0x01) !== 0);
  }

  prepareBuffer(chunk) {
    const cs = this.cs;
    const ps = cs + 2;
    this.sharedData.fill(0);
    const worldX = chunk.cx * cs;
    const worldY = chunk.cy * cs;
    const worldZ = chunk.cz * cs;

    for (let py = 0; py < ps; py++) {
      const yOff = py * ps * ps;
      for (let pz = 0; pz < ps; pz++) {
        const zOff = pz * ps;
        for (let px = 0; px < ps; px++) {
          const rawId = this.world.getRawBlockAt(worldX + px - 1, worldY + py - 1, worldZ + pz - 1);
          this.sharedData[px + zOff + yOff] = rawId;
        }
      }
    }

    for (let z = 0; z < cs; z++) {
      for (let x = 0; x < cs; x++) {
        const hex = this.world.terrain.getBlendedColor(worldX + x, worldZ + z, 'color');
        const idx = (x + z * cs) * 3;
        this.chunkColorMap[idx] = ((hex >> 16) & 255) / 255;
        this.chunkColorMap[idx + 1] = ((hex >> 8) & 255) / 255;
        this.chunkColorMap[idx + 2] = (hex & 255) / 255;
      }
    }
  }

  build(chunk, blockIdsNumeric) {
    this.vPtr = 0; this.nPtr = 0; this.cPtr = 0;
    this.uvPtr = 0; this.iPtr = 0; this.vertCount = 0;
    const groups = [];
    for (let dir = 0; dir < 6; dir++) {
      const start = this.iPtr;
      this._generateFaces(dir, chunk, blockIdsNumeric);
      const count = this.iPtr - start;
      if (count > 0) groups.push({ start, count, materialIndex: dir });
    }
    if (this.vertCount === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.verticesArr.subarray(0, this.vPtr), 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normalsArr.subarray(0, this.nPtr), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.colorsArr.subarray(0, this.cPtr), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvsArr.subarray(0, this.uvPtr), 2));
    const IndicesClass = this.vertCount > 65535 ? Uint32Array : Uint16Array;
    geo.setIndex(new THREE.BufferAttribute(new IndicesClass(this.indicesArr.subarray(0, this.iPtr)), 1));
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  _generateFaces(direction, chunk, blockIdsNumeric) {
    const cs = this.cs;
    const ps = cs + 2;
    const isPositive = (direction & 1) === 0;
    const axis = direction >> 1;
    const { u, v, w } = this._getAxes(axis);
    const offset = isPositive ? 1 : -1;
    const nStride = (w === 0 ? offset : (w === 2 ? offset * ps : offset * ps * ps));

    for (let depth = 0; depth < cs; depth++) {
      this.mask.fill(0);
      const dPad = depth + 1;
      for (let j = 0; j < cs; j++) {
        const jPad = j + 1;
        for (let i = 0; i < cs; i++) {
          const iPad = i + 1;
          this.tmpP[u] = iPad;
          this.tmpP[v] = jPad;
          this.tmpP[w] = dPad;
          const bIdx = this.tmpP[0] + this.tmpP[2] * ps + this.tmpP[1] * ps * ps;
          const blockRaw = this.sharedData[bIdx];
          if (blockRaw === 0 || !blockIdsNumeric.has(blockRaw)) continue;
          const neighborRaw = this.sharedData[bIdx + nStride];
          if (this._isTransparent(neighborRaw)) {
            if (!this._isTransparent(blockRaw) || neighborRaw !== blockRaw) {
              this.mask[i + j * cs] = blockRaw;
            }
          }
        }
      }
      for (let j = 0; j < cs; j++) {
        for (let i = 0; i < cs; i++) {
          const rawId = this.mask[i + j * cs];
          if (rawId === 0) continue;
          let width = 1;
          while (i + width < cs && this.mask[i + width + j * cs] === rawId) width++;
          let height = 1;
          let done = false;
          while (j + height < cs && !done) {
            for (let k = 0; k < width; k++) {
              if (this.mask[i + k + (j + height) * cs] !== rawId) {
                done = true; break;
              }
            }
            if (!done) height++;
          }
          this._addQuad(direction, depth, i, j, width, height, rawId, ps);
          for (let yy = 0; yy < height; yy++) {
            for (let xx = 0; xx < width; xx++) this.mask[i + xx + (j + yy) * cs] = 0;
          }
        }
      }
    }
  }

  _addQuad(direction, depth, i, j, width, height, rawId, ps) {
    const cs = this.cs;
    const isPositive = (direction & 1) === 0;
    const axis = direction >> 1;
    const { u, v, w, rh } = this._getAxes(axis);
    const s = this.vertCount;

    this.tmpP[0] = 0; this.tmpP[1] = 0; this.tmpP[2] = 0;
    this.tmpP[w] = depth + 1 + (isPositive ? 1 : 0);
    this.tmpP[u] = i + 1;
    this.tmpP[v] = j + 1;

    this.tmpDu[0] = 0; this.tmpDu[1] = 0; this.tmpDu[2] = 0;
    this.tmpDu[u] = width;
    this.tmpDv[0] = 0; this.tmpDv[1] = 0; this.tmpDv[2] = 0;
    this.tmpDv[v] = height;

    for (let k = 0; k < 4; k++) {
      const c = this.tmpCorners[k];
      const useU = k === 1 || k === 2;
      const useV = k === 2 || k === 3;
      c[0] = this.tmpP[0] + (useU ? this.tmpDu[0] : 0) + (useV ? this.tmpDv[0] : 0);
      c[1] = this.tmpP[1] + (useU ? this.tmpDu[1] : 0) + (useV ? this.tmpDv[1] : 0);
      c[2] = this.tmpP[2] + (useU ? this.tmpDu[2] : 0) + (useV ? this.tmpDv[2] : 0);
    }

    const props = this.propCache[rawId] || 0;
    const isTintable = (props & 0x04) !== 0;
    let shouldTint = isTintable;
    if (isTintable && (rawId === this.grassId || rawId === this.grassAltId || rawId === this.pathId || rawId === this.farmlandId)) {
      if (axis !== 1 || !isPositive) shouldTint = false;
    }

    if (shouldTint) {
      let lx, lz;
      if (axis === 1) { lx = i; lz = j; } 
      else if (axis === 0) { lx = depth; lz = i; } 
      else { lx = i; lz = depth; }
      const cIdx = (lx + lz * cs) * 3;
      this.tmpColor.setRGB(this.chunkColorMap[cIdx], this.chunkColorMap[cIdx + 1], this.chunkColorMap[cIdx + 2]);
    } else {
      this.tmpColor.setRGB(1, 1, 1);
    }

    const nx = axis === 0 ? (isPositive ? 1 : -1) : 0;
    const ny = axis === 1 ? (isPositive ? 1 : -1) : 0;
    const nz = axis === 2 ? (isPositive ? 1 : -1) : 0;

    const isShort = (props & 0x08) !== 0;
    const shift = isShort ? 0.0625 : 0;

    for (let k = 0; k < 4; k++) {
      const c = this.tmpCorners[k];
      let vx = c[0] - 1;
      let vy = c[1] - 1;
      let vz = c[2] - 1;

      if (isShort) {
        if (axis === 1 && isPositive) {
          vy -= shift;
        } else if (axis !== 1 && (k === 2 || k === 3)) {
          vy -= shift;
        }
      }

      this.verticesArr[this.vPtr++] = vx;
      this.verticesArr[this.vPtr++] = vy;
      this.verticesArr[this.vPtr++] = vz;
      this.normalsArr[this.nPtr++] = nx;
      this.normalsArr[this.nPtr++] = ny;
      this.normalsArr[this.nPtr++] = nz;
      const ao = this._calculateAO(c, axis, isPositive ? 1 : -1, (k === 1 || k === 2 ? 0 : -1), (k === 2 || k === 3 ? 0 : -1), ps);
      const aoF = 1.0 - ao * 0.18;
      this.colorsArr[this.cPtr++] = this.tmpColor.r * aoF;
      this.colorsArr[this.cPtr++] = this.tmpColor.g * aoF;
      this.colorsArr[this.cPtr++] = this.tmpColor.b * aoF;
    }

    // Parity-aware winding order
    const ccw = (rh && isPositive) || (!rh && !isPositive);
    if (ccw) {
      this.indicesArr[this.iPtr++] = s; this.indicesArr[this.iPtr++] = s + 1; this.indicesArr[this.iPtr++] = s + 2;
      this.indicesArr[this.iPtr++] = s; this.indicesArr[this.iPtr++] = s + 2; this.indicesArr[this.iPtr++] = s + 3;
    } else {
      this.indicesArr[this.iPtr++] = s; this.indicesArr[this.iPtr++] = s + 3; this.indicesArr[this.iPtr++] = s + 2;
      this.indicesArr[this.iPtr++] = s; this.indicesArr[this.iPtr++] = s + 2; this.indicesArr[this.iPtr++] = s + 1;
    }
    
    // UV Cropping for short blocks (Paths/Farmland)
    // We crop the TOP of the texture sheet to remove the border line and align the rim.
    const uMax = width;
    const isSide = axis !== 1;
    const vMin = 0;
    const vMax = (isSide && isShort) ? (height - shift) : height;

    this.uvsArr[this.uvPtr++] = 0; this.uvsArr[this.uvPtr++] = vMin;
    this.uvsArr[this.uvPtr++] = uMax; this.uvsArr[this.uvPtr++] = vMin;
    this.uvsArr[this.uvPtr++] = uMax; this.uvsArr[this.uvPtr++] = vMax;
    this.uvsArr[this.uvPtr++] = 0; this.uvsArr[this.uvPtr++] = vMax;
    this.vertCount += 4;
  }

  _calculateAO(c, axis, dw, duVal, dvVal, ps) {
    const { u, v, w } = this._getAxes(axis);
    const isOpaque = (offU, offV, offW) => {
      const x = c[0] + (u === 0 ? offU : 0) + (v === 0 ? offV : 0) + (w === 0 ? offW : 0);
      const y = c[1] + (u === 1 ? offU : 0) + (v === 1 ? offV : 0) + (w === 1 ? offW : 0);
      const z = c[2] + (u === 2 ? offU : 0) + (v === 2 ? offV : 0) + (w === 2 ? offW : 0);
      if (x < 0 || x >= ps || y < 0 || y >= ps || z < 0 || z >= ps) return false;
      return this._isOpaque(this.sharedData[x + z * ps + y * ps * ps]);
    };
    const s1 = isOpaque(duVal, 0, dw) ? 1 : 0;
    const s2 = isOpaque(0, dvVal, dw) ? 1 : 0;
    const cr = isOpaque(duVal, dvVal, dw) ? 1 : 0;
    if (s1 && s2) return 3;
    return s1 + s2 + cr;
  }
}