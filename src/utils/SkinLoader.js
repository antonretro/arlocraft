import * as THREE from 'three';

/**
 * Minecraft Skin Loader & UV Mapper
 * Handles fetching skins from Minotar and mapping them precisely to Three.js BoxGeometry
 */
export class SkinLoader {
    constructor() {
        this.loader = new THREE.TextureLoader();
        this.defaultSteve = '/assets/steve.png';
        this.defaultAlex = '/assets/alex.png';
    }

    async loadSkin(username) {
        // Minotar accepts usernames directly (no UUID lookup needed) and has CORS enabled
        const url = username === 'Steve' || username === 'Alex' || !username
            ? (username === 'Alex' ? this.defaultAlex : this.defaultSteve)
            : `https://minotar.net/skin/${username}`;
        
        return new Promise((resolve, reject) => {
            this.loader.load(url, (texture) => {
                texture.magFilter = THREE.NearestFilter;
                texture.minFilter = THREE.NearestFilter;
                
                const img = texture.image;
                const materials = this.createMaterials(img);
                
                resolve({ texture, materials });
            }, undefined, (err) => {
                // Absolute fallback to Igneous Steve on any error
                if (url !== this.defaultSteve) {
                    console.warn(`[AntonCraft] Failed to load skin for ${username}, falling back to Igneous Steve.`);
                    this.loadSkin('Steve').then(resolve).catch(reject);
                } else {
                    reject(err);
                }
            });
        });
    }

    createMaterials(img) {
        // Minecraft Skin UVs (Standard 64x64)
        // [w, h, d, u, v]
        const head  = this.getBoxMaterials(img, 8, 8, 8,  0, 0);
        const torso = this.getBoxMaterials(img, 8, 12, 4, 16, 16);
        const armR  = this.getBoxMaterials(img, 4, 12, 4, 40, 16);
        const legR  = this.getBoxMaterials(img, 4, 12, 4, 0, 16);

        // 64x64 skins have separate limb coords, 64x32 use mirrors.
        // We'll treat all as 64x64 for now as Minotar usually provides 64x64.
        const armL = this.getBoxMaterials(img, 4, 12, 4, 32, 48);
        const legL = this.getBoxMaterials(img, 4, 12, 4, 16, 48);

        return { head, torso, armR, armL, legR, legL };
    }

    /**
     * Extracts materials in Three.js order: px, nx, py, ny, pz, nz
     */
    getBoxMaterials(img, w, h, d, u, v) {
        const faces = [
            this.extractFace(img, d, h, u, v + d),             // Right (px)
            this.extractFace(img, d, h, u + d + w, v + d),     // Left (nx)
            this.extractFace(img, w, d, u + d, v),             // Top (py)
            this.extractFace(img, w, d, u + d + w, v),         // Bottom (ny)
            this.extractFace(img, w, h, u + d, v + d),         // Front (pz)
            this.extractFace(img, w, h, u + 2 * d + w, v + d)  // Back (nz)
        ];

        return faces.map(canvas => {
            const tex = new THREE.CanvasTexture(canvas);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.colorSpace = THREE.SRGBColorSpace;
            return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
        });
    }

    extractFace(img, fw, fh, fx, fy) {
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = fw;
        faceCanvas.height = fh;
        const faceCtx = faceCanvas.getContext('2d');
        
        // Safety check for 64x32 skins
        if (fy + fh > img.height) {
            // If we are looking for 64x64 area in a 64x32 skin, we might need to mirror
            // For now, just return empty to avoid crashes, or handle mirroring logic
        }

        faceCtx.drawImage(img, fx, fy, fw, fh, 0, 0, fw, fh);
        return faceCanvas;
    }
}
