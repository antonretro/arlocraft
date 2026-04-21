import * as THREE from 'three';

/**
 * VoxelGeometryBuilder
 *
 * Greedy mesher with:
 * - padded chunk buffer
 * - AO vertex shading
 * - tint support
 * - transparent-face filtering
 * - no per-face temporary array allocations in hot loops
 *
 * Assumptions:
 * - world.state.getInternalId(id) returns numeric IDs
 * - world.state.reverseIdMap maps numeric IDs -> string block IDs
 * - world.state.propertyCache[rawId] is a bitfield:
 *     0x01 = opaque / solid for AO
 *     0x02 = transparent
 *     0x04 = tintable
 * - blockIds is a Set of allowed block ids for this geometry/material pass
 */
export class VoxelGeometryBuilder {
  constructor(world) {
    this.world = world;
    this.cs = world.chunkSize;
    this.rules = world.blocks;

    const ps = this.cs + 2;

    // Shared padded voxel buffer for chunk + 1 shell
    this.sharedData = new Int32Array(ps * ps * ps);

    // Property bit cache
    this.propCache = world.state.propertyCache;

    // Reused scratch
    this.mask = new Int32Array(this.cs * this.cs);
    this.tmpColor = new THREE.Color();
    this.chunkColorMap = new Float32Array(this.cs * this.cs * 3);

    this.tmpP = new Int32Array(3);
    this.tmpDu = new Int32Array(3);
    this.tmpDv = new Int32Array(3);
    this.tmpCorners = [
      new Int32Array(3),
      new Int32Array(3),
      new Int32Array(3),
      new Int32Array(3),
    ];
  }

  _bufferIndex(x, y, z, ps) {
    return x + z * ps + y * ps * ps;
  }

  _normalizeBlockId(blockIdRaw) {
    if (!blockIdRaw) return '';
    const idx = blockIdRaw.indexOf(':');
    return idx >= 0 ? blockIdRaw.slice(idx + 1) : blockIdRaw;
  }

  _getAxes(axis) {
    // Keep face-local axes consistent so UVs/orientation stay predictable
    if (axis === 1) return { u: 0, v: 2, w: 1 }; // Y face: X/Z
    if (axis === 0) return { u: 2, v: 1, w: 0 }; // X face: Z/Y
    return { u: 0, v: 1, w: 2 }; // Z face: X/Y
  }

  _isTransparent(rawId) {
    return rawId === 0 || Boolean(this.propCache[rawId] & 0x02);
  }

  _isOpaque(rawId) {
    return rawId !== 0 && Boolean(this.propCache[rawId] & 0x01);
  }

  prepareBuffer(chunk) {
    const cs = this.cs;
    const ps = cs + 2;

    this.sharedData.fill(0);

    const worldX = chunk.cx * cs;
    const worldY = chunk.cy * cs;
    const worldZ = chunk.cz * cs;

    // Fill padded voxel data
    for (let py = 0; py < ps; py++) {
      for (let pz = 0; pz < ps; pz++) {
        for (let px = 0; px < ps; px++) {
          const wx = worldX + px - 1;
          const wy = worldY + py - 1;
          const wz = worldZ + pz - 1;

          const id = this.world.getBlockAt(wx, wy, wz);
          const rawId = this.world.state.getInternalId(id);

          // Keep buffer safe if registry expands unexpectedly
          this.sharedData[this._bufferIndex(px, py, pz, ps)] =
            rawId >= 0 && rawId < 4096 ? rawId : 0;
        }
      }
    }

    // Precompute blended biome tint colors for local X/Z in this chunk
    for (let z = 0; z < cs; z++) {
      for (let x = 0; x < cs; x++) {
        const tintHex = this.world.terrain.getBlendedColor(
          worldX + x,
          worldZ + z,
          'color'
        );

        const idx = (x + z * cs) * 3;
        this.chunkColorMap[idx] = ((tintHex >> 16) & 255) / 255;
        this.chunkColorMap[idx + 1] = ((tintHex >> 8) & 255) / 255;
        this.chunkColorMap[idx + 2] = (tintHex & 255) / 255;
      }
    }
  }

  build(chunk, blockIds) {
    const vertices = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const groups = [];

    for (let direction = 0; direction < 6; direction++) {
      const groupStart = indices.length;

      this._generateFaces(
        direction,
        chunk,
        blockIds,
        this.sharedData,
        vertices,
        normals,
        uvs,
        colors,
        indices
      );

      const groupCount = indices.length - groupStart;
      if (groupCount > 0) {
        groups.push({
          start: groupStart,
          count: groupCount,
          materialIndex: direction,
        });
      }
    }

    if (vertices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3)
    );
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);

    for (const group of groups) {
      geometry.addGroup(group.start, group.count, group.materialIndex);
    }

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return geometry;
  }

  _generateFaces(
    direction,
    chunk,
    blockIds,
    data,
    vertices,
    normals,
    uvs,
    colors,
    indices
  ) {
    const cs = this.cs;
    const ps = cs + 2;
    const isPositive = (direction & 1) === 0;
    const axis = direction >> 1;
    const { u, v, w } = this._getAxes(axis);
    const offset = isPositive ? 1 : -1;

    for (let depth = 0; depth < cs; depth++) {
      this.mask.fill(0);
      const dPad = depth + 1;

      // Build 2D face mask for this slice
      for (let j = 0; j < cs; j++) {
        for (let i = 0; i < cs; i++) {
          const p0 = 0,
            p1 = 0,
            p2 = 0;
          this.tmpP[0] = 0;
          this.tmpP[1] = 0;
          this.tmpP[2] = 0;
          this.tmpP[w] = dPad;
          this.tmpP[u] = i + 1;
          this.tmpP[v] = j + 1;

          const blockRaw =
            data[this._bufferIndex(this.tmpP[0], this.tmpP[1], this.tmpP[2], ps)];
          if (blockRaw === 0) continue;

          const blockIdRaw = this.world.state.reverseIdMap.get(blockRaw);
          const normalizedId = this._normalizeBlockId(blockIdRaw);

          if (!normalizedId || normalizedId === 'air' || !blockIds.has(normalizedId)) {
            continue;
          }

          const nx = this.tmpP[0] + (w === 0 ? offset : 0);
          const ny = this.tmpP[1] + (w === 1 ? offset : 0);
          const nz = this.tmpP[2] + (w === 2 ? offset : 0);
          const neighborRaw = data[this._bufferIndex(nx, ny, nz, ps)];

          const blockTransparent = this._isTransparent(blockRaw);
          const neighborTransparent = this._isTransparent(neighborRaw);

          // Draw face if exposed to air/transparent,
          // but do not draw between same transparent materials.
          if (neighborTransparent) {
            if (!blockTransparent || neighborRaw !== blockRaw) {
              this.mask[i + j * cs] = blockRaw;
            }
          }
        }
      }

      // Greedy merge
      for (let j = 0; j < cs; j++) {
        for (let i = 0; i < cs; i++) {
          const rawId = this.mask[i + j * cs];
          if (rawId === 0) continue;

          let width = 1;
          while (i + width < cs && this.mask[i + width + j * cs] === rawId) {
            width++;
          }

          let height = 1;
          let done = false;
          while (j + height < cs && !done) {
            for (let k = 0; k < width; k++) {
              if (this.mask[i + k + (j + height) * cs] !== rawId) {
                done = true;
                break;
              }
            }
            if (!done) height++;
          }

          this._addQuad(
            direction,
            depth,
            i,
            j,
            width,
            height,
            rawId,
            data,
            vertices,
            normals,
            uvs,
            colors,
            indices
          );

          for (let yy = 0; yy < height; yy++) {
            for (let xx = 0; xx < width; xx++) {
              this.mask[i + xx + (j + yy) * cs] = 0;
            }
          }
        }
      }
    }
  }

  _addQuad(
    direction,
    depth,
    i,
    j,
    width,
    height,
    rawId,
    data,
    vertices,
    normals,
    uvs,
    colors,
    indices
  ) {
    const cs = this.cs;
    const ps = cs + 2;
    const isPositive = (direction & 1) === 0;
    const axis = direction >> 1;
    const { u: uAxis, v: vAxis, w: wAxis } = this._getAxes(axis);
    const startIdx = vertices.length / 3;

    // Base corner in padded buffer space
    this.tmpP[0] = 0;
    this.tmpP[1] = 0;
    this.tmpP[2] = 0;
    this.tmpP[wAxis] = depth + 1 + (isPositive ? 1 : 0);
    this.tmpP[uAxis] = i + 1;
    this.tmpP[vAxis] = j + 1;

    this.tmpDu[0] = 0;
    this.tmpDu[1] = 0;
    this.tmpDu[2] = 0;
    this.tmpDu[uAxis] = width;

    this.tmpDv[0] = 0;
    this.tmpDv[1] = 0;
    this.tmpDv[2] = 0;
    this.tmpDv[vAxis] = height;

    // Quad corners
    for (let k = 0; k < 4; k++) {
      const c = this.tmpCorners[k];
      const useDu = k === 1 || k === 2;
      const useDv = k === 2 || k === 3;

      c[0] =
        this.tmpP[0] +
        (useDu ? this.tmpDu[0] : 0) +
        (useDv ? this.tmpDv[0] : 0);
      c[1] =
        this.tmpP[1] +
        (useDu ? this.tmpDu[1] : 0) +
        (useDv ? this.tmpDv[1] : 0);
      c[2] =
        this.tmpP[2] +
        (useDu ? this.tmpDu[2] : 0) +
        (useDv ? this.tmpDv[2] : 0);
    }

    // Tint handling
    const props = this.propCache[rawId] || 0;
    const isTintable = Boolean(props & 0x04);
    let shouldTint = isTintable;

    if (isTintable) {
      const blockIdRaw = this.world.state.reverseIdMap.get(rawId) || '';
      const normalizedId = this._normalizeBlockId(blockIdRaw);

      // Do not tint grass block side faces, only top
      if (normalizedId === 'grass_block' || normalizedId === 'grass_path') {
        const isTopFace = axis === 1 && isPositive;
        if (!isTopFace) shouldTint = false;
      }
    }

    if (shouldTint) {
      let lx, lz;

      if (axis === 1) {
        lx = i;
        lz = j;
      } else if (axis === 0) {
        lx = depth;
        lz = i;
      } else {
        lx = i;
        lz = depth;
      }

      const colorIdx = (lx + lz * cs) * 3;
      if (colorIdx >= 0 && colorIdx + 2 < this.chunkColorMap.length) {
        this.tmpColor.r = this.chunkColorMap[colorIdx];
        this.tmpColor.g = this.chunkColorMap[colorIdx + 1];
        this.tmpColor.b = this.chunkColorMap[colorIdx + 2];
      } else {
        this.tmpColor.setRGB(1, 1, 1);
      }
    } else {
      this.tmpColor.setRGB(1, 1, 1);
    }

    const offset = isPositive ? 1 : -1;
    const nx = axis === 0 ? (isPositive ? 1 : -1) : 0;
    const ny = axis === 1 ? (isPositive ? 1 : -1) : 0;
    const nz = axis === 2 ? (isPositive ? 1 : -1) : 0;

    for (let k = 0; k < 4; k++) {
      const c = this.tmpCorners[k];

      // Convert from padded space to local chunk coordinates
      vertices.push(c[0] - 1, c[1] - 1, c[2] - 1);
      normals.push(nx, ny, nz);

      const ao = this._calculateAO(
        c,
        axis,
        offset,
        k === 1 || k === 2 ? 0 : -1,
        k === 2 || k === 3 ? 0 : -1,
        data,
        ps
      );

      const aoFactor = 1.0 - ao * 0.18;
      colors.push(
        this.tmpColor.r * aoFactor,
        this.tmpColor.g * aoFactor,
        this.tmpColor.b * aoFactor
      );
    }

    if (isPositive) {
      indices.push(
        startIdx,
        startIdx + 1,
        startIdx + 2,
        startIdx,
        startIdx + 2,
        startIdx + 3
      );
    } else {
      indices.push(
        startIdx,
        startIdx + 3,
        startIdx + 2,
        startIdx,
        startIdx + 2,
        startIdx + 1
      );
    }

    uvs.push(0, 0, width, 0, width, height, 0, height);
  }

  _calculateAO(c, axis, dw, duVal, dvVal, data, ps) {
    const { u: uAxis, v: vAxis, w: wAxis } = this._getAxes(axis);

    const sampleOpaque = (offU, offV, offW) => {
      const x =
        c[0] +
        (uAxis === 0 ? offU : 0) +
        (vAxis === 0 ? offV : 0) +
        (wAxis === 0 ? offW : 0);
      const y =
        c[1] +
        (uAxis === 1 ? offU : 0) +
        (vAxis === 1 ? offV : 0) +
        (wAxis === 1 ? offW : 0);
      const z =
        c[2] +
        (uAxis === 2 ? offU : 0) +
        (vAxis === 2 ? offV : 0) +
        (wAxis === 2 ? offW : 0);

      if (x < 0 || x >= ps || y < 0 || y >= ps || z < 0 || z >= ps) {
        return false;
      }

      const raw = data[this._bufferIndex(x, y, z, ps)];
      return this._isOpaque(raw);
    };

    const side1 = sampleOpaque(duVal, 0, dw) ? 1 : 0;
    const side2 = sampleOpaque(0, dvVal, dw) ? 1 : 0;
    const corner = sampleOpaque(duVal, dvVal, dw) ? 1 : 0;

    if (side1 && side2) return 3;
    return side1 + side2 + corner;
  }
}