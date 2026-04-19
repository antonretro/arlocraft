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
                // Full-height sides eliminate the 1/16 black seam.
                // Top face stays sunken at 15/16 for correct path look.
                const topY = 7 / 16; // 0.4375 above center
                const H = 0.5;
                const hw = 0.5;

                const positions = new Float32Array([
                    // +X face (right): full height, x=+0.5
                     hw,  H, -hw,   hw, -H, -hw,   hw, -H,  hw,   hw,  H,  hw,
                    // -X face (left): full height, x=-0.5
                    -hw,  H,  hw,  -hw, -H,  hw,  -hw, -H, -hw,  -hw,  H, -hw,
                    // +Y face (top): sunken at topY
                    -hw, topY,  hw,   hw, topY,  hw,   hw, topY, -hw,  -hw, topY, -hw,
                    // -Y face (bottom): full depth, y=-0.5
                    -hw, -H, -hw,   hw, -H, -hw,   hw, -H,  hw,  -hw, -H,  hw,
                    // +Z face (front): full height, z=+0.5
                     hw,  H,  hw,   hw, -H,  hw,  -hw, -H,  hw,  -hw,  H,  hw,
                    // -Z face (back): full height, z=-0.5
                    -hw,  H, -hw,  -hw, -H, -hw,   hw, -H, -hw,   hw,  H, -hw,
                ]);

                const uvs = new Float32Array([
                    1,1, 1,0, 0,0, 0,1,
                    1,1, 1,0, 0,0, 0,1,
                    0,1, 1,1, 1,0, 0,0,
                    0,1, 1,1, 1,0, 0,0,
                    1,1, 1,0, 0,0, 0,1,
                    1,1, 1,0, 0,0, 0,1,
                ]);

                const normals = new Float32Array([
                    1,0,0, 1,0,0, 1,0,0, 1,0,0,
                    -1,0,0,-1,0,0,-1,0,0,-1,0,0,
                    0,1,0, 0,1,0, 0,1,0, 0,1,0,
                    0,-1,0,0,-1,0,0,-1,0,0,-1,0,
                    0,0,1, 0,0,1, 0,0,1, 0,0,1,
                    0,0,-1,0,0,-1,0,0,-1,0,0,-1,
                ]);

                const indices = [];
                for (let f = 0; f < 6; f++) {
                    const b = f * 4;
                    indices.push(b, b+1, b+2, b, b+2, b+3);
                }

                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
                geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                geo.setIndex(indices);
                // Each face group maps to the correct material slot in the array material:
                // 0=right, 1=left, 2=top, 3=bottom, 4=front, 5=back
                for (let f = 0; f < 6; f++) geo.addGroup(f * 6, 6, f);
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
                const geo = new THREE.PlaneGeometry(1.002, 0.9385); // Tiny inflate to hide seams
                geo.translate(0, -0.03125, 0);
                geo.translate(0, 0, 0.5);
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
                const idx2 = Array.from(p2.index.array).map(i => i + 4);
                merged.setAttribute('position', new THREE.Float32BufferAttribute([...pos1, ...pos2], 3));
                merged.setAttribute('uv', new THREE.Float32BufferAttribute([...uv1, ...uv2], 2));
                merged.setAttribute('normal', new THREE.Float32BufferAttribute([...norm1, ...norm2], 3));
                merged.setIndex([...idx1, ...idx2]);
                return withWhiteVertexColors(merged);
            })(),
            tallDeco: (() => {
                const p1 = new THREE.PlaneGeometry(1, 2);
                p1.rotateY(Math.PI / 4);
                p1.translate(0, 0.5, 0);
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
                const idx2 = Array.from(p2.index.array).map(i => i + 4);
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
                geo.translate(0, 0.5, 0);
                return withWhiteVertexColors(geo);
            })(),
            stair: (() => {
                const base = new THREE.BoxGeometry(1, 0.5, 1);
                base.translate(0, -0.25, 0);
                const step = new THREE.BoxGeometry(1, 0.5, 0.5);
                step.translate(0, 0.25, 0.25);
                const merged = new THREE.BufferGeometry();
                const pos = [...base.attributes.position.array, ...step.attributes.position.array];
                const uv = [...base.attributes.uv.array, ...step.attributes.uv.array];
                const norm = [...base.attributes.normal.array, ...step.attributes.normal.array];
                const idx = [...Array.from(base.index.array), ...Array.from(step.index.array).map(i => i + base.attributes.position.count)];
                merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
                merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
                merged.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
                merged.setIndex(idx);
                return withWhiteVertexColors(merged);
            })(),
            slab: (() => {
                const geo = new THREE.BoxGeometry(1, 0.5, 1);
                geo.translate(0, -0.25, 0);
                return withWhiteVertexColors(geo);
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
                    { materialIndex: 5, start: 30 }
                ];
                const newIndices = [];
                const groups = [];

                for (const face of faces) {
                    if (face.materialIndex === 2) continue;
                    const groupStart = newIndices.length;
                    for (let j = 0; j < 6; j++) {
                        newIndices.push(oldIndices[face.start + j]);
                    }
                    groups.push({ start: groupStart, count: 6, materialIndex: face.materialIndex });
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
            })()
        };
    }

    _initHoverOutline() {
        const hoverGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
        const hoverMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.12,
            depthWrite: false
        });
        const mesh = new THREE.Mesh(hoverGeo, hoverMat);
        const borderGeo = new THREE.BoxGeometry(1.003, 1.003, 1.003);
        const borderMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            wireframe: true,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
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
            depthWrite: false
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
                polygonOffsetUnits: -1.5
            })
        );
        mesh.visible = false;
        return mesh;
    }

    updateHover(x, y, z, visible) {
        this.hoverOutline.position.set(x, y, z);
        this.hoverOutline.visible = visible;
    }

    updatePlacement(x, y, z, visible) {
        this.placementOutline.position.set(x, y, z);
        this.placementOutline.visible = visible;
    }

    updateMiningCracks(x, y, z, visible, material) {
        this.miningCracks.position.set(x, y, z);
        this.miningCracks.visible = visible;
        if (material) this.miningCracks.material = material;
    }

    update(_time) {}
}
