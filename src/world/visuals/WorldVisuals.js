import * as THREE from 'three';

export class WorldVisuals {
    constructor(scene) {
        this.scene = scene;
        this.sharedChunkGeometries = this._initGeometries();
        this.hoverOutline = this._initHoverOutline();
        this.miningCracks = this._initMiningCracks();
        
        this.scene.add(this.hoverOutline);
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
                const geo = new THREE.BoxGeometry(1, 15/16, 1);
                geo.translate(0, -0.03125, 0);
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
            grass_block_sides: (() => {
                const geo = new THREE.BoxGeometry(1, 1, 1);
                // BoxGeometry has 12 triangles (2 per face, 36 indices total).
                //py (top) is the 3rd face. Indices 12-17.
                const oldIndices = Array.from(geo.index.array);
                const newIndices = [];
                for (let i = 0; i < oldIndices.length; i += 6) {
                    if (i === 12) continue; // Skip top face
                    for (let j = 0; j < 6; j++) newIndices.push(oldIndices[i + j]);
                }
                const result = new THREE.BufferGeometry();
                result.setAttribute('position', geo.attributes.position);
                result.setAttribute('uv', geo.attributes.uv);
                result.setAttribute('normal', geo.attributes.normal);
                result.setIndex(newIndices);
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

    _initMiningCracks() {
        const crackGeo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
        const mesh = new THREE.Mesh(
            crackGeo,
            new THREE.MeshBasicMaterial({
                transparent: true,
                alphaTest: 0.1,
                side: THREE.FrontSide,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1
            })
        );
        mesh.visible = false;
        return mesh;
    }

    updateHover(x, y, z, visible) {
        this.hoverOutline.position.set(x, y, z);
        this.hoverOutline.visible = visible;
    }

    updateMiningCracks(x, y, z, visible, material) {
        this.miningCracks.position.set(x, y, z);
        this.miningCracks.visible = visible;
        if (material) this.miningCracks.material = material;
    }

    update(_time) {}
}
